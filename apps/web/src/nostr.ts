import { schnorr } from "@noble/curves/secp256k1.js";

import { pulseNetworkGeohash, type GeoNote, type GeoNoteReaction, type Place } from "./data";
import { devLogger } from "./dev-logger";
import {
  bytesToHex,
  decodeNostrBech32,
  encodeNostrBech32,
  hexToBytes,
  normalizePublicKeyHex as normalizePublicKeyHexShared,
  normalizePublicKeyNpub
} from "./nostr-utils";

export type ProfileMetadataContent = Record<string, unknown> & {
  name?: string;
  picture?: string;
  about?: string;
};

export type BeaconDefinitionContent = {
  name: string;
  picture?: string;
  about?: string;
  tags?: string[];
};

export type NostrSigningOptions = {
  privateKeyHex?: string;
  publicKeyHex?: string;
};

export type PublishGeoNoteOptions = {
  replyTarget?: Pick<GeoNote, "id" | "authorPubkey" | "rootNoteId" | "taggedPubkeys">;
};

type UnsignedRelayEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
};

type SignedEventInput = NostrEventTemplate & {
  pubkey: string;
};

const relayPublishTimeoutMs = 10_000;
export const beaconDefinitionKind = 39001;

export async function signEventWithPrivateKey(
  event: NostrEventTemplate,
  privateKeyHex: string,
  publicKeyHex?: string
): Promise<NostrSignedEvent> {
  const secretKey = hexToBytes(privateKeyHex);
  const pubkey = publicKeyHex ?? bytesToHex(schnorr.getPublicKey(secretKey));
  const id = await computeEventId({ ...event, pubkey });

  devLogger.key.signing(id);

  const sig = bytesToHex(schnorr.sign(hexToBytes(id), secretKey));

  devLogger.key.signed(id);

  return {
    ...event,
    id,
    pubkey,
    sig
  };
}

export async function signEvent(
  event: NostrEventTemplate,
  signingOptions?: NostrSigningOptions
): Promise<NostrSignedEvent> {
  if (signingOptions?.privateKeyHex) {
    return signEventWithPrivateKey(event, signingOptions.privateKeyHex, signingOptions.publicKeyHex);
  }

  const nostr = window.nostr;
  if (!nostr) {
    throw new Error("A Nostr signer is required to publish to the relay.");
  }

  return nostr.signEvent(event);
}

export async function publishGeoNote(
  relayURL: string,
  geohash: string,
  content: string,
  signingOptions?: NostrSigningOptions,
  options?: PublishGeoNoteOptions
): Promise<NostrSignedEvent> {
  const normalizedGeohash = normalizeGeohash(geohash, "Geohash is required to publish a note.");
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const signedEvent = await signEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: buildGeoNoteTags(normalizedGeohash, normalizedRelayURL, options?.replyTarget),
      content: content.trim()
    },
    signingOptions
  );

  await publishSignedEvent(relayURL, signedEvent);
  return signedEvent;
}

export async function publishGeoReaction(
  relayURL: string,
  note: Pick<GeoNote, "id" | "authorPubkey" | "geohash">,
  emoji: string,
  signingOptions?: NostrSigningOptions
): Promise<NostrSignedEvent> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const normalizedGeohash = normalizeGeohash(note.geohash, "Geohash is required to publish a reaction.");
  const normalizedEmoji = emoji.trim();
  if (!normalizedEmoji) {
    throw new Error("Emoji reaction is required.");
  }

  const signedEvent = await signEvent(
    {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: buildGeoReactionTags(normalizedGeohash, normalizedRelayURL, note),
      content: normalizedEmoji
    },
    signingOptions
  );

  await publishSignedEvent(relayURL, signedEvent);
  return signedEvent;
}

export async function publishBeaconDefinition(
  relayURL: string,
  geohash: string,
  details: BeaconDefinitionContent,
  signingOptions?: NostrSigningOptions
): Promise<Place> {
  const normalizedGeohash = normalizeGeohash(geohash, "Beacon geohash is required.");
  const normalizedName = details.name.trim();
  if (!normalizedName) {
    throw new Error("Beacon name is required.");
  }

  const normalizedPicture = details.picture?.trim() ?? "";
  const normalizedAbout = details.about?.trim() ?? "";
  const normalizedTags = normalizeBeaconTags(details.tags ?? []);

  const signedEvent = await signEvent(
    {
      kind: beaconDefinitionKind,
      created_at: Math.floor(Date.now() / 1000),
      tags: buildBeaconDefinitionTags(normalizedGeohash, normalizedTags),
      content: JSON.stringify({
        name: normalizedName,
        picture: normalizedPicture,
        about: normalizedAbout,
        tags: normalizedTags
      })
    },
    signingOptions
  );

  await publishSignedEvent(relayURL, signedEvent);

  const beacon = normalizeRelayBeaconDefinitionEvent(signedEvent);
  if (!beacon) {
    throw new Error("Published beacon definition was invalid.");
  }

  return beacon;
}

export async function publishSignedEvent(relayURL: string, event: NostrSignedEvent): Promise<void> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);

  devLogger.relay.publishing(normalizedRelayURL, event.id);

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    let settled = false;
    let lastNotice = "";
    const timeoutID = window.setTimeout(() => {
      fail(new Error("Relay publish timed out."));
    }, relayPublishTimeoutMs);

    devLogger.ws.connecting(normalizedRelayURL);

    const succeed = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutID);
      socket.close();
      devLogger.relay.published(normalizedRelayURL, event.id);
      resolve();
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during error handling.
      }
      const message = error instanceof Error ? error.message : "Relay publish failed.";
      devLogger.relay.publishFailed(normalizedRelayURL, event.id, message);
      reject(error instanceof Error ? error : new Error("Relay publish failed."));
    };

    socket.addEventListener("open", () => {
      devLogger.ws.connected(normalizedRelayURL);
      devLogger.ws.sent(normalizedRelayURL, "EVENT");
      socket.send(JSON.stringify(["EVENT", event]));
    });

    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as unknown;
        if (!Array.isArray(payload) || payload.length < 1) {
          return;
        }

        devLogger.ws.message(normalizedRelayURL, payload[0]);

        if (payload[0] === "NOTICE" && typeof payload[1] === "string") {
          lastNotice = payload[1];
          return;
        }

        if (payload[0] !== "OK" || payload[1] !== event.id) {
          return;
        }

        if (payload[2] === true) {
          succeed();
          return;
        }

        const reason = typeof payload[3] === "string" && payload[3].trim().length > 0
          ? payload[3]
          : "Relay rejected the event.";
        fail(new Error(reason));
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      devLogger.ws.error(normalizedRelayURL, "Connection error");
      fail(new Error("Relay connection failed."));
    });

    socket.addEventListener("close", () => {
      devLogger.ws.closed(normalizedRelayURL, lastNotice || "Connection closed");
      if (!settled) {
        fail(new Error(lastNotice || "Relay closed before acknowledging the event."));
      }
    });
  });
}

export async function queryProfileMetadata(
  relayURL: string,
  authors: string[]
): Promise<Map<string, ProfileMetadataContent>> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const requestedAuthorsByHex = new Map<string, Set<string>>();

  for (const author of authors) {
    const normalizedAuthor = author.trim();
    if (!normalizedAuthor) {
      continue;
    }

    const authorHex = normalizePublicKeyHex(normalizedAuthor);
    if (!authorHex) {
      continue;
    }

    const existing = requestedAuthorsByHex.get(authorHex) ?? new Set<string>();
    existing.add(normalizedAuthor);
    requestedAuthorsByHex.set(authorHex, existing);
  }

  if (requestedAuthorsByHex.size === 0) {
    return new Map();
  }

  const filter = { kinds: [0], authors: Array.from(requestedAuthorsByHex.keys()) };
  devLogger.relay.querying(normalizedRelayURL, filter);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    const subscriptionID = `kind0-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const latestEvents = new Map<string, NostrSignedEvent>();
    let settled = false;
    let lastNotice = "";
    const timeoutID = window.setTimeout(() => {
      fail(new Error("Relay metadata query timed out."));
    }, relayPublishTimeoutMs);

    devLogger.ws.connecting(normalizedRelayURL);

    const succeed = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during normal teardown.
      }
      devLogger.relay.queryComplete(normalizedRelayURL, latestEvents.size);
      resolve(
        new Map(
          Array.from(latestEvents.entries()).flatMap(([pubkeyHex, event]) => {
            const metadata = parseProfileMetadataContent(event.content);
            if (!metadata) {
              return [];
            }

            const requestedAuthors = requestedAuthorsByHex.get(pubkeyHex);
            if (!requestedAuthors) {
              return [];
            }

            return Array.from(requestedAuthors, (requestedAuthor) => [requestedAuthor, metadata] as const);
          })
        )
      );
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during error handling.
      }
      reject(error instanceof Error ? error : new Error("Relay metadata query failed."));
    };

    socket.addEventListener("open", () => {
      devLogger.ws.connected(normalizedRelayURL);
      devLogger.ws.sent(normalizedRelayURL, "REQ");
      socket.send(
        JSON.stringify([
          "REQ",
          subscriptionID,
          {
            kinds: [0],
            authors: Array.from(requestedAuthorsByHex.keys())
          }
        ])
      );
    });

    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as unknown;
        if (!Array.isArray(payload) || payload.length < 1) {
          return;
        }

        devLogger.ws.message(normalizedRelayURL, payload[0]);

        if (payload[0] === "NOTICE" && typeof payload[1] === "string") {
          lastNotice = payload[1];
          return;
        }

        if (payload[0] === "EVENT" && payload[1] === subscriptionID && isSignedKindZeroEvent(payload[2])) {
          const existing = latestEvents.get(payload[2].pubkey);
          if (!existing || payload[2].created_at > existing.created_at) {
            latestEvents.set(payload[2].pubkey, payload[2]);
          }
          return;
        }

        if (payload[0] === "EOSE" && payload[1] === subscriptionID) {
          socket.send(JSON.stringify(["CLOSE", subscriptionID]));
          succeed();
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      devLogger.ws.error(normalizedRelayURL, "Connection error");
      fail(new Error("Relay connection failed."));
    });

    socket.addEventListener("close", () => {
      devLogger.ws.closed(normalizedRelayURL, lastNotice || "Connection closed");
      if (!settled) {
        fail(new Error(lastNotice || "Relay closed before returning metadata."));
      }
    });
  });
}

export async function queryBeaconDefinitions(relayURL: string, geohash?: string): Promise<Place[]> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const normalizedGeohash = geohash ? normalizeGeohash(geohash, "Beacon geohash is required.") : "";
  const filter = normalizedGeohash
    ? { kinds: [beaconDefinitionKind], ["#d"]: [normalizedGeohash] }
    : { kinds: [beaconDefinitionKind] };

  devLogger.relay.querying(normalizedRelayURL, filter);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    const subscriptionID = `kind${beaconDefinitionKind}-${normalizedGeohash || "all"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const beaconsByGeohash = new Map<string, Place>();
    const createdAtByGeohash = new Map<string, number>();
    let settled = false;
    let lastNotice = "";
    const timeoutID = window.setTimeout(() => {
      fail(new Error("Relay beacon query timed out."));
    }, relayPublishTimeoutMs);

    devLogger.ws.connecting(normalizedRelayURL);

    const succeed = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during normal teardown.
      }

      const beacons = Array.from(beaconsByGeohash.values()).sort((left, right) => left.geohash.localeCompare(right.geohash));
      devLogger.relay.queryComplete(normalizedRelayURL, beacons.length);
      resolve(beacons);
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during error handling.
      }

      reject(error instanceof Error ? error : new Error("Relay beacon query failed."));
    };

    socket.addEventListener("open", () => {
      devLogger.ws.connected(normalizedRelayURL);
      devLogger.ws.sent(normalizedRelayURL, "REQ");
      socket.send(JSON.stringify(["REQ", subscriptionID, filter]));
    });

    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as unknown;
        if (!Array.isArray(payload) || payload.length < 1) {
          return;
        }

        devLogger.ws.message(normalizedRelayURL, payload[0]);

        if (payload[0] === "NOTICE" && typeof payload[1] === "string") {
          lastNotice = payload[1];
          return;
        }

        if (payload[0] === "EVENT" && payload[1] === subscriptionID && isSignedBeaconDefinitionEvent(payload[2])) {
          const beacon = normalizeRelayBeaconDefinitionEvent(payload[2]);
          if (!beacon) {
            return;
          }

          const existingCreatedAt = createdAtByGeohash.get(beacon.geohash) ?? Number.NEGATIVE_INFINITY;
          if (payload[2].created_at >= existingCreatedAt) {
            createdAtByGeohash.set(beacon.geohash, payload[2].created_at);
            beaconsByGeohash.set(beacon.geohash, beacon);
          }
          return;
        }

        if (payload[0] === "EOSE" && payload[1] === subscriptionID) {
          socket.send(JSON.stringify(["CLOSE", subscriptionID]));
          succeed();
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      devLogger.ws.error(normalizedRelayURL, "Connection error");
      fail(new Error("Relay connection failed."));
    });

    socket.addEventListener("close", () => {
      devLogger.ws.closed(normalizedRelayURL, lastNotice || "Connection closed");
      if (!settled) {
        fail(new Error(lastNotice || "Relay closed before returning beacon definitions."));
      }
    });
  });
}

export async function queryGeoNotes(relayURL: string, geohash: string): Promise<GeoNote[]> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const normalizedGeohash = normalizeGeohash(geohash, "Geohash is required to query notes.");

  const filter = { kinds: [1, 7], ["#g"]: [normalizedGeohash] };
  devLogger.relay.querying(normalizedRelayURL, filter);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    const subscriptionID = `kind1-kind7-${normalizedGeohash}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const notesByID = new Map<string, GeoNote>();
    const reactionsByNoteID = new Map<string, Map<string, number>>();
    let settled = false;
    let lastNotice = "";
    const timeoutID = window.setTimeout(() => {
      fail(new Error("Relay geohash note query timed out."));
    }, relayPublishTimeoutMs);

    devLogger.ws.connecting(normalizedRelayURL);

    const succeed = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during normal teardown.
      }

      devLogger.relay.queryComplete(normalizedRelayURL, notesByID.size);
      resolve(finalizeQueriedGeoNotes(notesByID, reactionsByNoteID));
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during error handling.
      }

      reject(error instanceof Error ? error : new Error("Relay geohash note query failed."));
    };

    socket.addEventListener("open", () => {
      devLogger.ws.connected(normalizedRelayURL);
      devLogger.ws.sent(normalizedRelayURL, "REQ");
      socket.send(
        JSON.stringify([
          "REQ",
          subscriptionID,
          {
            kinds: [1, 7],
            ["#g"]: [normalizedGeohash]
          }
        ])
      );
    });

    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as unknown;
        if (!Array.isArray(payload) || payload.length < 1) {
          return;
        }

        devLogger.ws.message(normalizedRelayURL, payload[0]);

        if (payload[0] === "NOTICE" && typeof payload[1] === "string") {
          lastNotice = payload[1];
          return;
        }

        if (payload[0] === "EVENT" && payload[1] === subscriptionID && isSignedKindOneEvent(payload[2])) {
          const note = normalizeRelayKindOneNote(payload[2], normalizedGeohash);
          if (note) {
            notesByID.set(note.id, note);
          }
          return;
        }

        if (payload[0] === "EVENT" && payload[1] === subscriptionID && isSignedKindSevenEvent(payload[2])) {
          const reaction = normalizeRelayKindSevenReaction(payload[2], normalizedGeohash);
          if (!reaction) {
            return;
          }

          const existing = reactionsByNoteID.get(reaction.targetEventID) ?? new Map<string, number>();
          existing.set(reaction.emoji, (existing.get(reaction.emoji) ?? 0) + 1);
          reactionsByNoteID.set(reaction.targetEventID, existing);
          return;
        }

        if (payload[0] === "EOSE" && payload[1] === subscriptionID) {
          succeed();
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      devLogger.ws.error(normalizedRelayURL, "Connection error");
      fail(new Error("Relay connection failed."));
    });

    socket.addEventListener("close", () => {
      devLogger.ws.closed(normalizedRelayURL, lastNotice || "Connection closed");
      if (!settled) {
        fail(new Error(lastNotice || "Relay closed before returning geohash notes."));
      }
    });
  });
}

export async function queryRecentKindOneNotes(
  relayURL: string,
  options?: { limit?: number }
): Promise<GeoNote[]> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : 50;
  const filter = { kinds: [1], limit };
  devLogger.relay.querying(normalizedRelayURL, filter);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    const subscriptionID = `kind1-recent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const notesByID = new Map<string, GeoNote>();
    let settled = false;
    let lastNotice = "";
    const timeoutID = window.setTimeout(() => {
      fail(new Error("Relay note query timed out."));
    }, relayPublishTimeoutMs);

    devLogger.ws.connecting(normalizedRelayURL);

    const succeed = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during normal teardown.
      }

      devLogger.relay.queryComplete(normalizedRelayURL, notesByID.size);
      resolve(finalizeQueriedGeoNotes(notesByID, new Map()));
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during error handling.
      }

      reject(error instanceof Error ? error : new Error("Relay note query failed."));
    };

    socket.addEventListener("open", () => {
      devLogger.ws.connected(normalizedRelayURL);
      devLogger.ws.sent(normalizedRelayURL, "REQ");
      socket.send(JSON.stringify(["REQ", subscriptionID, filter]));
    });

    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as unknown;
        if (!Array.isArray(payload) || payload.length < 1) {
          return;
        }

        devLogger.ws.message(normalizedRelayURL, payload[0]);

        if (payload[0] === "NOTICE" && typeof payload[1] === "string") {
          lastNotice = payload[1];
          return;
        }

        if (payload[0] === "EVENT" && payload[1] === subscriptionID && isSignedKindOneEvent(payload[2])) {
          const note = normalizeRelayKindOneNote(payload[2], pulseNetworkGeohash);
          if (note) {
            notesByID.set(note.id, note);
          }
          return;
        }

        if (payload[0] === "EOSE" && payload[1] === subscriptionID) {
          socket.send(JSON.stringify(["CLOSE", subscriptionID]));
          succeed();
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      devLogger.ws.error(normalizedRelayURL, "Connection error");
      fail(new Error("Relay connection failed."));
    });

    socket.addEventListener("close", () => {
      devLogger.ws.closed(normalizedRelayURL, lastNotice || "Connection closed");
      if (!settled) {
        fail(new Error(lastNotice || "Relay closed before returning notes."));
      }
    });
  });
}

export async function queryAuthorKindOneNotes(
  relayURL: string,
  author: string,
  options?: { limit?: number }
): Promise<GeoNote[]> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const normalizedAuthor = normalizePublicKeyHex(author.trim());
  if (!normalizedAuthor) {
    return [];
  }

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : 5;
  const filter = { kinds: [1], authors: [normalizedAuthor], limit };
  devLogger.relay.querying(normalizedRelayURL, filter);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    const subscriptionID = `kind1-author-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const notesByID = new Map<string, GeoNote>();
    let settled = false;
    let lastNotice = "";
    const timeoutID = window.setTimeout(() => {
      fail(new Error("Relay author note query timed out."));
    }, relayPublishTimeoutMs);

    devLogger.ws.connecting(normalizedRelayURL);

    const succeed = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during normal teardown.
      }

      devLogger.relay.queryComplete(normalizedRelayURL, notesByID.size);
      resolve(finalizeQueriedGeoNotes(notesByID, new Map()));
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutID);
      try {
        socket.close();
      } catch {
        // Ignore close failures during error handling.
      }

      reject(error instanceof Error ? error : new Error("Relay author note query failed."));
    };

    socket.addEventListener("open", () => {
      devLogger.ws.connected(normalizedRelayURL);
      devLogger.ws.sent(normalizedRelayURL, "REQ");
      socket.send(JSON.stringify(["REQ", subscriptionID, filter]));
    });

    socket.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as unknown;
        if (!Array.isArray(payload) || payload.length < 1) {
          return;
        }

        devLogger.ws.message(normalizedRelayURL, payload[0]);

        if (payload[0] === "NOTICE" && typeof payload[1] === "string") {
          lastNotice = payload[1];
          return;
        }

        if (payload[0] === "EVENT" && payload[1] === subscriptionID && isSignedKindOneEvent(payload[2])) {
          const note = normalizeRelayKindOneNote(payload[2], pulseNetworkGeohash);
          if (note) {
            notesByID.set(note.id, note);
          }
          return;
        }

        if (payload[0] === "EOSE" && payload[1] === subscriptionID) {
          socket.send(JSON.stringify(["CLOSE", subscriptionID]));
          succeed();
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener("error", () => {
      devLogger.ws.error(normalizedRelayURL, "Connection error");
      fail(new Error("Relay connection failed."));
    });

    socket.addEventListener("close", () => {
      devLogger.ws.closed(normalizedRelayURL, lastNotice || "Connection closed");
      if (!settled) {
        fail(new Error(lastNotice || "Relay closed before returning author notes."));
      }
    });
  });
}

async function computeEventId(event: SignedEventInput) {
  const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return bytesToHex(new Uint8Array(digest));
}

function normalizeGeohash(geohash: string, errorMessage: string) {
  const normalized = geohash.trim().toLowerCase();
  if (!normalized) {
    throw new Error(errorMessage);
  }

  return normalized;
}

function normalizeRelayURL(relayURL: string) {
  const normalized = relayURL.trim();
  if (!normalized) {
    throw new Error("Relay URL unavailable.");
  }

  const parsed = new URL(normalized);
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("Relay URL must use ws:// or wss://.");
  }

  return parsed.toString();
}

export const normalizePublicKeyHex = normalizePublicKeyHexShared;

function isSignedKindZeroEvent(value: unknown): value is NostrSignedEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<NostrSignedEvent>;
  return (
    record.kind === 0 &&
    typeof record.id === "string" &&
    typeof record.pubkey === "string" &&
    typeof record.sig === "string" &&
    typeof record.content === "string" &&
    typeof record.created_at === "number" &&
    Array.isArray(record.tags)
  );
}

function isSignedKindOneEvent(value: unknown): value is UnsignedRelayEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<UnsignedRelayEvent>;
  return (
    record.kind === 1 &&
    typeof record.id === "string" &&
    typeof record.pubkey === "string" &&
    typeof record.content === "string" &&
    typeof record.created_at === "number" &&
    Array.isArray(record.tags)
  );
}

function isSignedKindSevenEvent(value: unknown): value is UnsignedRelayEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<UnsignedRelayEvent>;
  return (
    record.kind === 7 &&
    typeof record.id === "string" &&
    typeof record.pubkey === "string" &&
    typeof record.content === "string" &&
    typeof record.created_at === "number" &&
    Array.isArray(record.tags)
  );
}

function isSignedBeaconDefinitionEvent(value: unknown): value is UnsignedRelayEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<UnsignedRelayEvent>;
  return (
    record.kind === beaconDefinitionKind &&
    typeof record.id === "string" &&
    typeof record.pubkey === "string" &&
    typeof record.content === "string" &&
    typeof record.created_at === "number" &&
    Array.isArray(record.tags)
  );
}

function parseProfileMetadataContent(content: string): ProfileMetadataContent | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    return record as ProfileMetadataContent;
  } catch {
    return null;
  }
}

function normalizeRelayKindOneNote(event: UnsignedRelayEvent, defaultGeohash: string): GeoNote | null {
  const geohash = extractGeohashTag(event.tags) ?? defaultGeohash;
  if (!geohash) {
    return null;
  }

  const eventReferences = extractEventReferences(event.tags);
  const taggedPubkeys = Array.from(
    new Set(
      extractTagValues(event.tags, "p")
        .map((pubkey) => normalizePublicKeyNpub(pubkey))
        .filter((pubkey) => pubkey.length > 0)
    )
  );

  return {
    id: event.id,
    geohash,
    authorPubkey: normalizePublicKeyNpub(event.pubkey),
    content: event.content.trim(),
    createdAt: new Date(event.created_at * 1000).toISOString(),
    replies: 0,
    replyTargetId: eventReferences.replyID ?? undefined,
    rootNoteId: eventReferences.rootID ?? undefined,
    taggedPubkeys: taggedPubkeys.length > 0 ? taggedPubkeys : undefined
  };
}

function finalizeQueriedGeoNotes(
  notesByID: Map<string, GeoNote>,
  reactionsByNoteID: Map<string, Map<string, number>>
) {
  const replyCounts = new Map<string, number>();

  for (const note of notesByID.values()) {
    if (!note.replyTargetId) {
      continue;
    }

    replyCounts.set(note.replyTargetId, (replyCounts.get(note.replyTargetId) ?? 0) + 1);
  }

  return Array.from(notesByID.values())
    .map((note) => ({
      ...note,
      replies: replyCounts.get(note.id) ?? 0,
      reactions: normalizeReactionCounts(reactionsByNoteID.get(note.id))
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeRelayKindSevenReaction(event: UnsignedRelayEvent, defaultGeohash: string) {
  const geohash = extractGeohashTag(event.tags) ?? defaultGeohash;
  if (!geohash) {
    return null;
  }

  const targetEventID = extractLastTagValue(event.tags, "e");
  if (!targetEventID) {
    return null;
  }

  const emoji = event.content.trim() || "+";

  return {
    geohash,
    targetEventID,
    emoji
  };
}

function normalizeRelayBeaconDefinitionEvent(event: UnsignedRelayEvent): Place | null {
  const geohash = extractTagValue(event.tags, "d") ?? extractGeohashTag(event.tags);
  if (!geohash) {
    return null;
  }

  const content = parseBeaconDefinitionContent(event.content);
  const title = content?.name?.trim() ?? "";
  if (!title) {
    return null;
  }

  const description = content?.about?.trim() ?? "";
  const picture = content?.picture?.trim() ?? "";
  const tags = normalizeBeaconTags(content?.tags ?? extractTagValues(event.tags, "t"));
  const ownerPubkey = normalizePublicKeyNpub(event.pubkey);

  return {
    geohash,
    title,
    neighborhood: "Newly lit beacon",
    description,
    activitySummary: description || "Freshly lit beacon.",
    createdAt: new Date(event.created_at * 1000).toISOString(),
    picture: picture || undefined,
    ownerPubkey,
    memberPubkeys: ownerPubkey ? [ownerPubkey] : undefined,
    tags,
    capacity: 8,
    occupantPubkeys: [],
    unread: false
  };
}

function parseBeaconDefinitionContent(content: string): BeaconDefinitionContent | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name.trim()) {
      return null;
    }

    return {
      name: record.name,
      picture: typeof record.picture === "string" ? record.picture : undefined,
      about: typeof record.about === "string" ? record.about : undefined,
      tags: Array.isArray(record.tags)
        ? record.tags.filter((entry): entry is string => typeof entry === "string")
        : undefined
    };
  } catch {
    return null;
  }
}

function buildGeoNoteTags(
  geohash: string,
  relayURL: string,
  replyTarget?: Pick<GeoNote, "id" | "authorPubkey" | "rootNoteId" | "taggedPubkeys">
) {
  const tags: string[][] = [["g", geohash]];

  if (!replyTarget) {
    return tags;
  }

  const referencedPubkeys = Array.from(
    new Set([replyTarget.authorPubkey, ...(replyTarget.taggedPubkeys ?? [])])
  )
    .map((pubkey) => normalizePublicKeyHex(pubkey))
    .filter((pubkey): pubkey is string => Boolean(pubkey));

  const targetAuthorHex = normalizePublicKeyHex(replyTarget.authorPubkey);
  const rootID = replyTarget.rootNoteId?.trim() || replyTarget.id.trim();
  const replyID = replyTarget.id.trim();

  if (rootID && rootID !== replyID) {
    tags.push(buildReplyReferenceTag(rootID, relayURL, "root", targetAuthorHex));
    tags.push(buildReplyReferenceTag(replyID, relayURL, "reply", targetAuthorHex));
  } else {
    tags.push(buildReplyReferenceTag(replyID, relayURL, "root", targetAuthorHex));
  }

  for (const pubkey of referencedPubkeys) {
    tags.push(["p", pubkey]);
  }

  return tags;
}

function buildGeoReactionTags(
  geohash: string,
  relayURL: string,
  note: Pick<GeoNote, "id" | "authorPubkey">
) {
  const tags: string[][] = [["g", geohash], ["e", note.id.trim(), relayURL]];
  const targetAuthorHex = normalizePublicKeyHex(note.authorPubkey);

  if (targetAuthorHex) {
    tags[1].push(targetAuthorHex);
    tags.push(["p", targetAuthorHex]);
  }

  tags.push(["k", "1"]);
  return tags;
}

function buildReplyReferenceTag(id: string, relayURL: string, marker: "root" | "reply", authorHex?: string | null) {
  const tag = ["e", id, relayURL, marker];
  if (authorHex) {
    tag.push(authorHex);
  }
  return tag;
}

function buildBeaconDefinitionTags(geohash: string, tags: string[]) {
  const normalizedTags = normalizeBeaconTags(tags);
  const eventTags: string[][] = [["d", geohash], ["g", geohash]];

  for (const tag of normalizedTags) {
    eventTags.push(["t", tag]);
  }

  return eventTags;
}

function normalizeBeaconTags(tags: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of ["beacon", "geohash8", ...tags]) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function extractGeohashTag(tags: string[][]) {
  for (const tag of tags) {
    if (tag[0] === "g" && typeof tag[1] === "string" && tag[1].trim()) {
      return tag[1].trim().toLowerCase();
    }
  }

  return null;
}

function extractTagValue(tags: string[][], name: string) {
  for (const tag of tags) {
    if (tag[0] === name && typeof tag[1] === "string" && tag[1].trim()) {
      return tag[1].trim().toLowerCase();
    }
  }

  return null;
}

function extractTagValues(tags: string[][], name: string) {
  const values: string[] = [];

  for (const tag of tags) {
    if (tag[0] === name && typeof tag[1] === "string" && tag[1].trim()) {
      values.push(tag[1].trim().toLowerCase());
    }
  }

  return values;
}

function extractLastTagValue(tags: string[][], name: string) {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    const tag = tags[index];
    if (tag[0] === name && typeof tag[1] === "string" && tag[1].trim()) {
      return tag[1].trim().toLowerCase();
    }
  }

  return null;
}

function extractEventReferences(tags: string[][]) {
  const eventTags = tags.filter((tag) => tag[0] === "e" && typeof tag[1] === "string" && tag[1].trim());
  const markedRoot = eventTags.find((tag) => tag[3] === "root");
  const markedReply = eventTags.find((tag) => tag[3] === "reply");

  if (markedReply) {
    return {
      rootID: (markedRoot?.[1] ?? markedReply[1]).trim().toLowerCase(),
      replyID: markedReply[1].trim().toLowerCase()
    };
  }

  if (markedRoot) {
    const eventID = markedRoot[1].trim().toLowerCase();
    return {
      rootID: eventID,
      replyID: eventID
    };
  }

  if (eventTags.length === 1) {
    const eventID = eventTags[0][1].trim().toLowerCase();
    return {
      rootID: eventID,
      replyID: eventID
    };
  }

  if (eventTags.length > 1) {
    return {
      rootID: eventTags[0][1].trim().toLowerCase(),
      replyID: eventTags[eventTags.length - 1][1].trim().toLowerCase()
    };
  }

  return {
    rootID: null,
    replyID: null
  };
}

function normalizeReactionCounts(reactionsByEmoji?: Map<string, number>): GeoNoteReaction[] | undefined {
  if (!reactionsByEmoji || reactionsByEmoji.size === 0) {
    return undefined;
  }

  return Array.from(reactionsByEmoji.entries())
    .filter(([, count]) => count > 0)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji));
}
