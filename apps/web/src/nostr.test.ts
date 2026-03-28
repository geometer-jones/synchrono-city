import { describe, expect, it, vi } from "vitest";

import { importLocalKeyMaterial } from "./key-manager";
import { publishGeoNote, queryGeoNotes, queryProfileMetadata, signEvent, signEventWithPrivateKey } from "./nostr";

function createRelayQueryWebSocketMock(
  responsesByAuthorHex: Record<string, Array<{ createdAt: number; content: Record<string, string> }>>
) {
  const instances: Array<{
    url: string;
    sentMessages: string[];
    deliverMessage: (payload: unknown) => void;
  }> = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    url: string;
    sentMessages: string[] = [];
    private listeners = new Map<string, Set<(event?: { data?: string }) => void>>();

    constructor(url: string) {
      this.url = url;
      instances.push({
        url: this.url,
        sentMessages: this.sentMessages,
        deliverMessage: (payload) => {
          this.emit("message", {
            data: JSON.stringify(payload)
          });
        }
      });
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open");
      });
    }

    addEventListener(type: string, listener: (event?: { data?: string }) => void) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: (event?: { data?: string }) => void) {
      this.listeners.get(type)?.delete(listener);
    }

    send(data: string) {
      this.sentMessages.push(data);
      const payload = JSON.parse(data) as [string, string, { authors?: string[] }?];
      if (payload[0] !== "REQ") {
        return;
      }

      const subscriptionID = payload[1];
      const authors = payload[2]?.authors ?? [];

      queueMicrotask(() => {
        for (const author of authors) {
          for (const response of responsesByAuthorHex[author] ?? []) {
            this.emit("message", {
              data: JSON.stringify([
                "EVENT",
                subscriptionID,
                {
                  id: `kind0-${author}-${response.createdAt}`,
                  pubkey: author,
                  created_at: response.createdAt,
                  kind: 0,
                  tags: [],
                  content: JSON.stringify(response.content),
                  sig: `sig-${author}-${response.createdAt}`
                }
              ])
            });
          }
        }

        this.emit("message", {
          data: JSON.stringify(["EOSE", subscriptionID])
        });
      });
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
      queueMicrotask(() => {
        this.emit("close");
      });
    }

    private emit(type: string, event?: { data?: string }) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  return {
    instances,
    WebSocket: MockWebSocket as unknown as typeof WebSocket
  };
}

describe("queryProfileMetadata", () => {
  it("queries kind 0 metadata for npub authors and returns the latest event per pubkey", async () => {
    const author = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );
    const participant = importLocalKeyMaterial(
      "2222222222222222222222222222222222222222222222222222222222222222"
    );
    const relaySocketMock = createRelayQueryWebSocketMock({
      [author.publicKeyHex]: [
        {
          createdAt: 100,
          content: {
            name: "Older Name",
            picture: "https://images.example.test/older.png"
          }
        },
        {
          createdAt: 200,
          content: {
            name: "Aurora Vale",
            picture: "https://images.example.test/aurora.png",
            about: "Organizes the plaza."
          }
        }
      ],
      [participant.publicKeyHex]: [
        {
          createdAt: 150,
          content: {
            name: "Jules Mercer",
            picture: "https://images.example.test/jules.png"
          }
        }
      ]
    });
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;

    try {
      const metadata = await queryProfileMetadata("ws://localhost:8080", [
        author.publicKeyNpub,
        participant.publicKeyNpub
      ]);

      const sentPayload = relaySocketMock.instances[0]?.sentMessages[0];
      expect(sentPayload).toBeTruthy();
      expect(JSON.parse(String(sentPayload))).toEqual([
        "REQ",
        expect.any(String),
        {
          kinds: [0],
          authors: [author.publicKeyHex, participant.publicKeyHex]
        }
      ]);

      expect(metadata.get(author.publicKeyNpub)).toEqual({
        name: "Aurora Vale",
        picture: "https://images.example.test/aurora.png",
        about: "Organizes the plaza."
      });
      expect(metadata.get(participant.publicKeyNpub)).toEqual({
        name: "Jules Mercer",
        picture: "https://images.example.test/jules.png"
      });
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("skips invalid pubkeys without opening a relay subscription", async () => {
    const relaySocketMock = createRelayQueryWebSocketMock({});
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;

    try {
      await expect(queryProfileMetadata("ws://localhost:8080", ["npub1invalid", ""])).resolves.toEqual(new Map());
      expect(relaySocketMock.instances).toHaveLength(0);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});

describe("queryGeoNotes", () => {
  it("queries kind 1 notes for a geohash and normalizes relay events into app notes", async () => {
    const author = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );
    const relaySocketMock = createRelayQueryWebSocketMock({});
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;

    try {
      const notesPromise = queryGeoNotes("ws://localhost:8080", "9Q8YYK");
      await Promise.resolve();
      const sentPayload = relaySocketMock.instances[0]?.sentMessages[0];
      expect(sentPayload).toBeTruthy();

      const requestPayload = JSON.parse(String(sentPayload)) as [string, string, { kinds?: number[]; "#g"?: string[] }];
      expect(requestPayload).toEqual([
        "REQ",
        expect.any(String),
        {
          kinds: [1],
          "#g": ["9q8yyk"]
        }
      ]);

      const subscriptionID = requestPayload[1];
      relaySocketMock.instances[0]?.deliverMessage([
        "EVENT",
        subscriptionID,
        {
          id: "note-2",
          pubkey: author.publicKeyHex,
          created_at: 200,
          kind: 1,
          tags: [["g", "9q8yyk"]],
          content: "Latest plaza note",
          sig: "sig-2"
        }
      ]);
      relaySocketMock.instances[0]?.deliverMessage([
        "EVENT",
        subscriptionID,
        {
          id: "note-1",
          pubkey: author.publicKeyHex,
          created_at: 100,
          kind: 1,
          tags: [["g", "9q8yyk"]],
          content: "Earlier plaza note",
          sig: "sig-1"
        }
      ]);
      relaySocketMock.instances[0]?.deliverMessage(["EOSE", subscriptionID]);

      await expect(notesPromise).resolves.toEqual([
        {
          id: "note-2",
          geohash: "9q8yyk",
          authorPubkey: author.publicKeyNpub,
          content: "Latest plaza note",
          createdAt: "1970-01-01T00:03:20.000Z",
          replies: 0
        },
        {
          id: "note-1",
          geohash: "9q8yyk",
          authorPubkey: author.publicKeyNpub,
          content: "Earlier plaza note",
          createdAt: "1970-01-01T00:01:40.000Z",
          replies: 0
        }
      ]);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});

describe("signEventWithPrivateKey", () => {
  it("signs an event with a private key", async () => {
    const key = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );

    const event = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["g", "9q8yyk"]],
      content: "Hello world!"
    };

    const signed = await signEventWithPrivateKey(event, key.privateKeyHex, key.publicKeyHex);

    expect(signed.id).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.pubkey).toBe(key.publicKeyHex);
    expect(signed.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(signed.kind).toBe(1);
    expect(signed.content).toBe("Hello world!");
  });

  it("derives public key from private key if not provided", async () => {
    const key = importLocalKeyMaterial(
      "2222222222222222222222222222222222222222222222222222222222222222"
    );

    const event = {
      kind: 1,
      created_at: 1234567890,
      tags: [],
      content: "Test"
    };

    const signed = await signEventWithPrivateKey(event, key.privateKeyHex);

    expect(signed.pubkey).toBe(key.publicKeyHex);
  });

  it("produces same event ID for same input", async () => {
    const key = importLocalKeyMaterial(
      "3333333333333333333333333333333333333333333333333333333333333333"
    );

    const event = {
      kind: 1,
      created_at: 1234567890,
      tags: [["g", "test"]],
      content: "Same content"
    };

    const signed1 = await signEventWithPrivateKey(event, key.privateKeyHex, key.publicKeyHex);
    const signed2 = await signEventWithPrivateKey(event, key.privateKeyHex, key.publicKeyHex);

    // Same event should produce same ID
    expect(signed1.id).toBe(signed2.id);
    // Signatures will differ due to randomized auxiliary data (security feature)
    expect(signed1.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(signed2.sig).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("signEvent", () => {
  it("uses private key from signing options when provided", async () => {
    const key = importLocalKeyMaterial(
      "4444444444444444444444444444444444444444444444444444444444444444"
    );

    const event = {
      kind: 1,
      created_at: 1234567890,
      tags: [],
      content: "Test"
    };

    const signed = await signEvent(event, {
      privateKeyHex: key.privateKeyHex,
      publicKeyHex: key.publicKeyHex
    });

    expect(signed.pubkey).toBe(key.publicKeyHex);
    expect(signed.sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it("throws error when no signer available", async () => {
    const originalNostr = window.nostr;
    delete window.nostr;

    const event = {
      kind: 1,
      created_at: 1234567890,
      tags: [],
      content: "Test"
    };

    try {
      await expect(signEvent(event)).rejects.toThrow("A Nostr signer is required to publish to the relay.");
    } finally {
      window.nostr = originalNostr;
    }
  });

  it("uses window.nostr when available", async () => {
    const mockSignEvent = vi.fn().mockResolvedValue({
      id: "mock-event-id",
      pubkey: "mock-pubkey",
      created_at: 1234567890,
      kind: 1,
      tags: [],
      content: "Test",
      sig: "mock-signature"
    });

    const mockGetPublicKey = vi.fn().mockResolvedValue("mock-pubkey");

    const originalNostr = window.nostr;
    window.nostr = { signEvent: mockSignEvent, getPublicKey: mockGetPublicKey };

    try {
      const event = {
        kind: 1,
        created_at: 1234567890,
        tags: [],
        content: "Test"
      };

      const signed = await signEvent(event);

      expect(mockSignEvent).toHaveBeenCalledWith(event);
      expect(signed.id).toBe("mock-event-id");
    } finally {
      window.nostr = originalNostr;
    }
  });
});
