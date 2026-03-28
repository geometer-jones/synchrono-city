import { describe, expect, it } from "vitest";

import {
  addKeyToKeyring,
  createEmptyLocalKeyring,
  generateLocalKeyMaterial,
  getActiveLocalKey,
  importLocalKeyMaterial,
  removeKeyFromKeyring,
  loadStoredLocalKeyring,
  setActiveKeyInKeyring
} from "./key-manager";

describe("key manager", () => {
  it("generates a nostr-compatible local keypair", () => {
    const keys = generateLocalKeyMaterial();

    expect(keys.source).toBe("generated");
    expect(keys.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.publicKeyNpub).toMatch(/^npub1/);
    expect(keys.privateKeyNsec).toMatch(/^nsec1/);
  });

  it("imports a hex private key and derives matching public encodings", () => {
    const keys = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");

    expect(keys.source).toBe("imported");
    expect(keys.privateKeyHex).toBe("1111111111111111111111111111111111111111111111111111111111111111");
    expect(keys.publicKeyHex).toBe("4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa");
    expect(keys.publicKeyNpub).toBe("npub1fu64hh9hes90w2808n8tjc2ajp5yhddjef0ctx4s7zmsgp6cwx4qgy4eg9");
    expect(keys.privateKeyNsec).toMatch(/^nsec1/);
  });

  it("rejects unsupported private key formats", () => {
    expect(() => importLocalKeyMaterial("not-a-key")).toThrow(/private key must/i);
  });

  it("stores multiple keypairs and tracks one active key", () => {
    const first = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");
    const second = generateLocalKeyMaterial();

    const withFirst = addKeyToKeyring(createEmptyLocalKeyring(), first).keyring;
    const withSecond = addKeyToKeyring(withFirst, second).keyring;

    expect(withSecond.keys).toHaveLength(2);
    expect(getActiveLocalKey(withSecond)?.publicKeyNpub).toBe(second.publicKeyNpub);

    const switched = setActiveKeyInKeyring(withSecond, first.publicKeyNpub);
    expect(getActiveLocalKey(switched)?.publicKeyNpub).toBe(first.publicKeyNpub);

    const removed = removeKeyFromKeyring(switched, first.publicKeyNpub);
    expect(removed.keys).toHaveLength(1);
    expect(getActiveLocalKey(removed)?.publicKeyNpub).toBe(second.publicKeyNpub);
  });

  it("preserves private keys when loading an unencrypted stored keyring", () => {
    const first = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");
    const originalLocalStorage = window.localStorage;
    const storage = new Map<string, string>();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        }
      }
    });

    try {
      window.localStorage.setItem(
        "synchrono-city.local-keyring",
        JSON.stringify({
          activePublicKeyNpub: first.publicKeyNpub,
          encrypted: false,
          keys: [first]
        })
      );

      const loaded = loadStoredLocalKeyring();

      expect(loaded.activePublicKeyNpub).toBe(first.publicKeyNpub);
      expect(loaded.keys).toHaveLength(1);
      expect(loaded.keys[0]?.privateKeyHex).toBe(first.privateKeyHex);
      expect(loaded.keys[0]?.privateKeyNsec).toBe(first.privateKeyNsec);
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });
});
