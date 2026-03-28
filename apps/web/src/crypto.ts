/**
 * Encryption utilities for securing sensitive data like private keys.
 *
 * Uses PBKDF2 for key derivation and AES-GCM for authenticated encryption.
 * All operations use the Web Crypto API for broad compatibility.
 */

import { devLogger } from "./dev-logger";

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export type EncryptedData = {
  /** Base64-encoded salt for PBKDF2 */
  salt: string;
  /** Base64-encoded IV for AES-GCM */
  iv: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Version identifier for future migration support */
  v: 1;
};

/**
 * Derives an encryption key from a password using PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using a password-derived key.
 *
 * @param plaintext - The data to encrypt
 * @param password - The password to derive the encryption key from
 * @returns Encrypted data structure with salt, IV, and ciphertext
 */
export async function encrypt(plaintext: string, password: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoder.encode(plaintext)
  );

  devLogger.debug("CRYPTO", "Encrypted data", { saltLength: SALT_LENGTH, ivLength: IV_LENGTH });

  return {
    salt: base64Encode(salt),
    iv: base64Encode(iv),
    ciphertext: base64Encode(new Uint8Array(ciphertext)),
    v: 1
  };
}

/**
 * Decrypts ciphertext using a password-derived key.
 *
 * @param encrypted - The encrypted data structure
 * @param password - The password to derive the decryption key from
 * @returns The decrypted plaintext
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decrypt(encrypted: EncryptedData, password: string): Promise<string> {
  if (encrypted.v !== 1) {
    throw new Error(`Unsupported encryption version: ${encrypted.v}`);
  }

  const salt = base64Decode(encrypted.salt);
  const iv = base64Decode(encrypted.iv);
  const ciphertext = base64Decode(encrypted.ciphertext);
  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    devLogger.debug("CRYPTO", "Decrypted data successfully");
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    devLogger.warn("CRYPTO", "Decryption failed - wrong password or corrupted data");
    throw new Error("Decryption failed. Wrong password or corrupted data.");
  }
}

/**
 * Checks if a value looks like encrypted data.
 */
export function isEncryptedData(value: unknown): value is EncryptedData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<EncryptedData>;
  return (
    typeof record.salt === "string" &&
    typeof record.iv === "string" &&
    typeof record.ciphertext === "string" &&
    record.v === 1
  );
}

/**
 * Generates a random encryption key for use when no password is set.
 * This provides basic obfuscation (not true security) for keys stored without a password.
 */
export function generateRandomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Encode(bytes);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
