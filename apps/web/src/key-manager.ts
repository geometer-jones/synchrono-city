import { schnorr } from "@noble/curves/secp256k1.js";

import { decrypt, encrypt, isEncryptedData, type EncryptedData } from "./crypto";
import { devLogger } from "./dev-logger";
import {
  bytesToHex,
  decodeNostrBech32,
  encodeNostrBech32,
  hexToBytes
} from "./nostr-utils";

export type LocalKeyMaterial = {
  id: string;
  source: "generated" | "imported";
  createdAt: string;
  publicKeyHex: string;
  publicKeyNpub: string;
  privateKeyHex: string;
  privateKeyNsec: string;
};

export type LocalKeyring = {
  activePublicKeyNpub: string | null;
  keys: LocalKeyMaterial[];
};

/**
 * An encrypted key entry stored in localStorage.
 * Private key material is encrypted with a password.
 */
type EncryptedKeyEntry = {
  id: string;
  source: "generated" | "imported";
  createdAt: string;
  publicKeyHex: string;
  publicKeyNpub: string;
  /** Encrypted privateKeyHex */
  encryptedPrivateKeyHex: EncryptedData;
  /** Encrypted privateKeyNsec */
  encryptedPrivateKeyNsec: EncryptedData;
};

/**
 * The stored keyring format with optional encryption.
 */
type StoredKeyring = {
  activePublicKeyNpub: string | null;
  keys: Array<LocalKeyMaterial | EncryptedKeyEntry>;
  /** Whether the keyring is encrypted */
  encrypted: boolean;
};

const localKeyStorageKey = "synchrono-city.local-keyring";
const legacyLocalKeyStorageKey = "synchrono-city.local-key";

export function createEmptyLocalKeyring(): LocalKeyring {
  return {
    activePublicKeyNpub: null,
    keys: []
  };
}

export function generateLocalKeyMaterial(): LocalKeyMaterial {
  const key = createLocalKeyMaterial(schnorr.utils.randomSecretKey(), "generated");
  devLogger.key.generated(key.publicKeyNpub);
  return key;
}

export function importLocalKeyMaterial(input: string): LocalKeyMaterial {
  const normalizedInput = input.trim();
  if (!normalizedInput) {
    throw new Error("Paste a private key to import.");
  }

  // Try hex first (64-char hex secret)
  if (/^[0-9a-f]{64}$/i.test(normalizedInput)) {
    const key = createLocalKeyMaterial(hexToBytes(normalizedInput), "imported");
    devLogger.key.imported(key.publicKeyNpub);
    return key;
  }

  // Try nsec format
  if (normalizedInput.toLowerCase().startsWith("nsec1")) {
    const key = createLocalKeyMaterial(decodeNostrBech32("nsec", normalizedInput), "imported");
    devLogger.key.imported(key.publicKeyNpub);
    return key;
  }

  throw new Error("Private key must be a 64-char hex secret or nsec key.");
}

/**
 * Loads the stored keyring (without decrypting).
 * Returns a keyring with only public key info if encrypted.
 */
export function loadStoredLocalKeyring(): LocalKeyring {
  const storage = resolveStorage();
  if (!storage) {
    return createEmptyLocalKeyring();
  }

  const raw = storage.getItem(localKeyStorageKey) ?? storage.getItem(legacyLocalKeyStorageKey);
  if (!raw) {
    return createEmptyLocalKeyring();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const stored = normalizeStoredKeyring(parsed);

    // Migrate legacy format
    if (storage.getItem(localKeyStorageKey) === null && stored.keys.length > 0) {
      storage.setItem(localKeyStorageKey, JSON.stringify(stored));
      storage.removeItem(legacyLocalKeyStorageKey);
    }

    // Preserve unencrypted private keys. Only encrypted entries should be hidden
    // behind placeholder values until the user unlocks them.
    return {
      activePublicKeyNpub: stored.activePublicKeyNpub,
      keys: stored.keys.map((key) => {
        if ("privateKeyHex" in key && "privateKeyNsec" in key) {
          return key;
        }

        return {
          id: key.id,
          source: key.source,
          createdAt: key.createdAt,
          publicKeyHex: key.publicKeyHex,
          publicKeyNpub: key.publicKeyNpub,
          privateKeyHex: "",
          privateKeyNsec: ""
        };
      })
    };
  } catch {
    return createEmptyLocalKeyring();
  }
}

/**
 * Checks if the stored keyring is encrypted.
 */
export function isStoredKeyringEncrypted(): boolean {
  const storage = resolveStorage();
  if (!storage) {
    return false;
  }

  const raw = storage.getItem(localKeyStorageKey);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return false;
    }

    const record = parsed as { encrypted?: unknown };
    return record.encrypted === true;
  } catch {
    return false;
  }
}

/**
 * Decrypts the stored keyring with a password.
 * Returns the full keyring with private keys.
 */
export async function unlockStoredKeyring(password: string): Promise<LocalKeyring> {
  const storage = resolveStorage();
  if (!storage) {
    return createEmptyLocalKeyring();
  }

  const raw = storage.getItem(localKeyStorageKey);
  if (!raw) {
    return createEmptyLocalKeyring();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const stored = normalizeStoredKeyring(parsed);

    if (!stored.encrypted) {
      // Not encrypted - return as-is
      const keyring: LocalKeyring = {
        activePublicKeyNpub: stored.activePublicKeyNpub,
        keys: stored.keys.filter((key): key is LocalKeyMaterial => "privateKeyHex" in key && key.privateKeyHex !== "")
      };
      devLogger.key.unlocked();
      return keyring;
    }

    // Decrypt each key
    const decryptedKeys = await Promise.all(
      stored.keys.map(async (key): Promise<LocalKeyMaterial | null> => {
        if (!isEncryptedKeyEntry(key)) {
          return key as LocalKeyMaterial;
        }

        try {
          const privateKeyHex = await decrypt(key.encryptedPrivateKeyHex, password);
          const privateKeyNsec = await decrypt(key.encryptedPrivateKeyNsec, password);
          return {
            id: key.id,
            source: key.source,
            createdAt: key.createdAt,
            publicKeyHex: key.publicKeyHex,
            publicKeyNpub: key.publicKeyNpub,
            privateKeyHex,
            privateKeyNsec
          };
        } catch {
          // Decryption failed for this key
          return null;
        }
      })
    );

    const validKeys = decryptedKeys.filter((key): key is LocalKeyMaterial => key !== null);

    if (validKeys.length === 0 && stored.keys.length > 0) {
      throw new Error("Failed to decrypt keys. Wrong password?");
    }

    devLogger.key.unlocked();
    return {
      activePublicKeyNpub: stored.activePublicKeyNpub,
      keys: validKeys
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Wrong password")) {
      throw error;
    }
    return createEmptyLocalKeyring();
  }
}

/**
 * Stores the keyring unencrypted (for backward compatibility).
 * Prefer storeEncryptedLocalKeyring for new usage.
 */
export function storeLocalKeyring(keyring: LocalKeyring) {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  const stored: StoredKeyring = {
    activePublicKeyNpub: keyring.activePublicKeyNpub,
    keys: normalizeKeyring(keyring).keys,
    encrypted: false
  };

  storage.setItem(localKeyStorageKey, JSON.stringify(stored));
  storage.removeItem(legacyLocalKeyStorageKey);
}

/**
 * Encrypts and stores the keyring with a password.
 */
export async function storeEncryptedLocalKeyring(keyring: LocalKeyring, password: string) {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  const normalizedKeyring = normalizeKeyring(keyring);
  const encryptedKeys = await Promise.all(
    normalizedKeyring.keys.map(async (key): Promise<EncryptedKeyEntry> => ({
      id: key.id,
      source: key.source,
      createdAt: key.createdAt,
      publicKeyHex: key.publicKeyHex,
      publicKeyNpub: key.publicKeyNpub,
      encryptedPrivateKeyHex: await encrypt(key.privateKeyHex, password),
      encryptedPrivateKeyNsec: await encrypt(key.privateKeyNsec, password)
    }))
  );

  const stored: StoredKeyring = {
    activePublicKeyNpub: normalizedKeyring.activePublicKeyNpub,
    keys: encryptedKeys,
    encrypted: true
  };

  storage.setItem(localKeyStorageKey, JSON.stringify(stored));
  storage.removeItem(legacyLocalKeyStorageKey);
  devLogger.key.encrypted();
}

/**
 * Migrates an unencrypted keyring to encrypted storage.
 */
export async function encryptStoredKeyring(password: string): Promise<boolean> {
  const storage = resolveStorage();
  if (!storage) {
    return false;
  }

  const raw = storage.getItem(localKeyStorageKey);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const stored = normalizeStoredKeyring(parsed);

    if (stored.encrypted) {
      // Already encrypted
      return true;
    }

    // Get keys with private data
    const keysWithPrivate = stored.keys.filter(
      (key): key is LocalKeyMaterial => "privateKeyHex" in key && key.privateKeyHex !== ""
    );

    if (keysWithPrivate.length === 0) {
      return false;
    }

    const keyring: LocalKeyring = {
      activePublicKeyNpub: stored.activePublicKeyNpub,
      keys: keysWithPrivate
    };

    await storeEncryptedLocalKeyring(keyring, password);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredLocalKeyring() {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(localKeyStorageKey);
  storage.removeItem(legacyLocalKeyStorageKey);
}

export function addKeyToKeyring(keyring: LocalKeyring, key: LocalKeyMaterial): {
  keyring: LocalKeyring;
  activeKey: LocalKeyMaterial;
  added: boolean;
} {
  const normalizedKeyring = normalizeKeyring(keyring);
  const existing = normalizedKeyring.keys.find((entry) => entry.publicKeyNpub === key.publicKeyNpub);
  const activeKey = existing ?? key;

  if (!existing) {
    devLogger.key.imported(key.publicKeyNpub);
  }

  return {
    keyring: {
      activePublicKeyNpub: activeKey.publicKeyNpub,
      keys: existing ? normalizedKeyring.keys : [activeKey, ...normalizedKeyring.keys]
    },
    activeKey,
    added: !existing
  };
}

export function removeKeyFromKeyring(keyring: LocalKeyring, publicKeyNpub: string): LocalKeyring {
  const remainingKeys = normalizeKeyring(keyring).keys.filter((key) => key.publicKeyNpub !== publicKeyNpub);
  devLogger.key.removed(publicKeyNpub);
  return {
    activePublicKeyNpub: remainingKeys[0]?.publicKeyNpub ?? null,
    keys: remainingKeys
  };
}

export function setActiveKeyInKeyring(keyring: LocalKeyring, publicKeyNpub: string): LocalKeyring {
  const normalizedKeyring = normalizeKeyring(keyring);
  if (!normalizedKeyring.keys.some((key) => key.publicKeyNpub === publicKeyNpub)) {
    return normalizedKeyring;
  }

  devLogger.key.activated(publicKeyNpub);
  return {
    activePublicKeyNpub: publicKeyNpub,
    keys: normalizedKeyring.keys
  };
}

export function getActiveLocalKey(keyring: LocalKeyring): LocalKeyMaterial | null {
  const normalizedKeyring = normalizeKeyring(keyring);
  return normalizedKeyring.keys.find((key) => key.publicKeyNpub === normalizedKeyring.activePublicKeyNpub) ?? null;
}

function normalizeStoredKeyring(parsed: unknown): StoredKeyring {
  if (!parsed || typeof parsed !== "object") {
    return { activePublicKeyNpub: null, keys: [], encrypted: false };
  }

  // New format with keys array
  if ("keys" in parsed && Array.isArray(parsed.keys)) {
    const record = parsed as { activePublicKeyNpub?: unknown; keys: unknown[]; encrypted?: unknown };
    const activePublicKeyNpub =
      typeof record.activePublicKeyNpub === "string" ? record.activePublicKeyNpub : null;
    const encrypted = record.encrypted === true;
    const keys = record.keys.map(normalizeStoredKey).filter((key): key is LocalKeyMaterial | EncryptedKeyEntry => Boolean(key));
    return { activePublicKeyNpub, keys, encrypted };
  }

  // Legacy single-key format
  const legacyKey = normalizeStoredKey(parsed);
  if (!legacyKey) {
    return { activePublicKeyNpub: null, keys: [], encrypted: false };
  }

  return {
    activePublicKeyNpub: legacyKey.publicKeyNpub,
    keys: [legacyKey],
    encrypted: false
  };
}

function normalizeStoredKey(value: unknown): LocalKeyMaterial | EncryptedKeyEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  // Check for required public key fields
  if (typeof record.publicKeyHex !== "string" || typeof record.publicKeyNpub !== "string") {
    return null;
  }

  // Check if it's an encrypted entry
  if (isEncryptedData(record.encryptedPrivateKeyHex) && isEncryptedData(record.encryptedPrivateKeyNsec)) {
    return {
      id: typeof record.id === "string" ? record.id : record.publicKeyNpub,
      source: record.source === "generated" ? "generated" : "imported",
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      publicKeyHex: record.publicKeyHex,
      publicKeyNpub: record.publicKeyNpub,
      encryptedPrivateKeyHex: record.encryptedPrivateKeyHex,
      encryptedPrivateKeyNsec: record.encryptedPrivateKeyNsec
    };
  }

  // Check if it's an unencrypted entry
  if (typeof record.privateKeyHex !== "string" || typeof record.privateKeyNsec !== "string") {
    return null;
  }

  return {
    id: typeof record.id === "string" ? record.id : record.publicKeyNpub,
    source: record.source === "generated" ? "generated" : "imported",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    publicKeyHex: record.publicKeyHex,
    publicKeyNpub: record.publicKeyNpub,
    privateKeyHex: record.privateKeyHex,
    privateKeyNsec: record.privateKeyNsec
  };
}

function isEncryptedKeyEntry(key: LocalKeyMaterial | EncryptedKeyEntry): key is EncryptedKeyEntry {
  return "encryptedPrivateKeyHex" in key;
}

function normalizeKeyring(keyring: LocalKeyring): LocalKeyring {
  const dedupedKeys = new Map<string, LocalKeyMaterial>();
  for (const key of keyring.keys) {
    if (key.privateKeyHex) {
      dedupedKeys.set(key.publicKeyNpub, key);
    }
  }

  const keys = Array.from(dedupedKeys.values());
  const activePublicKeyNpub =
    keyring.activePublicKeyNpub && dedupedKeys.has(keyring.activePublicKeyNpub)
      ? keyring.activePublicKeyNpub
      : keys[0]?.publicKeyNpub ?? null;

  return { activePublicKeyNpub, keys };
}

function createLocalKeyMaterial(privateKeyBytes: Uint8Array, source: LocalKeyMaterial["source"]): LocalKeyMaterial {
  if (privateKeyBytes.length !== 32) {
    throw new Error("Private key must be exactly 32 bytes.");
  }

  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
  const privateKeyHex = bytesToHex(privateKeyBytes);
  const publicKeyHex = bytesToHex(publicKeyBytes);
  const publicKeyNpub = encodeNostrBech32("npub", publicKeyBytes);

  return {
    id: publicKeyNpub,
    source,
    createdAt: new Date().toISOString(),
    publicKeyHex,
    publicKeyNpub,
    privateKeyHex,
    privateKeyNsec: encodeNostrBech32("nsec", privateKeyBytes)
  };
}

function resolveStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (typeof window === "undefined" || typeof window.localStorage !== "object" || window.localStorage === null) {
    return null;
  }

  const { getItem, setItem, removeItem } = window.localStorage;
  if (typeof getItem !== "function" || typeof setItem !== "function" || typeof removeItem !== "function") {
    return null;
  }

  return window.localStorage;
}
