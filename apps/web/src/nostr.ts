import { schnorr } from "@noble/curves/secp256k1.js";

import type { GeoNote } from "./data";
import { devLogger } from "./dev-logger";
import {
  bytesToHex,
  decodeNostrBech32,
  encodeNostrBech32,
  hexToBytes,
  normalizePublicKeyHex as normalizePublicKeyHexShared,
  normalizePublicKeyNpub
} from "./nostr-utils";

export type ProfileMetadataContent = {
  name?: string;
  picture?: string;
  about?: string;
};

export type NostrSigningOptions = {
  privateKeyHex?: string;
  publicKeyHex?: string;
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
  signingOptions?: NostrSigningOptions
): Promise<NostrSignedEvent> {
  const normalizedGeohash = normalizeGeohash(geohash);
  const signedEvent = await signEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["g", normalizedGeohash]],
      content: content.trim()
    },
    signingOptions
  );

  await publishSignedEvent(relayURL, signedEvent);
  return signedEvent;
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

export async function queryGeoNotes(relayURL: string, geohash: string): Promise<GeoNote[]> {
  const normalizedRelayURL = normalizeRelayURL(relayURL);
  const normalizedGeohash = normalizeGeohash(geohash);

  const filter = { kinds: [1], ["#g"]: [normalizedGeohash] };
  devLogger.relay.querying(normalizedRelayURL, filter);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(normalizedRelayURL);
    const subscriptionID = `kind1-${normalizedGeohash}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const notesByID = new Map<string, GeoNote>();
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
      resolve(
        Array.from(notesByID.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
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
            kinds: [1],
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

async function computeEventId(event: SignedEventInput) {
  const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return bytesToHex(new Uint8Array(digest));
}

function normalizeGeohash(geohash: string) {
  const normalized = geohash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Geohash is required to publish a note.");
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

function parseProfileMetadataContent(content: string): ProfileMetadataContent | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const metadata: ProfileMetadataContent = {};

    if (typeof record.name === "string") {
      metadata.name = record.name;
    }
    if (typeof record.picture === "string") {
      metadata.picture = record.picture;
    }
    if (typeof record.about === "string") {
      metadata.about = record.about;
    }

    return metadata;
  } catch {
    return null;
  }
}

function normalizeRelayKindOneNote(event: UnsignedRelayEvent, defaultGeohash: string): GeoNote | null {
  const geohash = extractGeohashTag(event.tags) ?? defaultGeohash;
  if (!geohash) {
    return null;
  }

  return {
    id: event.id,
    geohash,
    authorPubkey: normalizePublicKeyNpub(event.pubkey),
    content: event.content.trim(),
    createdAt: new Date(event.created_at * 1000).toISOString(),
    replies: 0
  };
}

function extractGeohashTag(tags: string[][]) {
  for (const tag of tags) {
    if (tag[0] === "g" && typeof tag[1] === "string" && tag[1].trim()) {
      return tag[1].trim().toLowerCase();
    }
  }

  return null;
}
