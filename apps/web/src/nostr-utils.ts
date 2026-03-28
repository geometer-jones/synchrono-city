import { bech32 } from "@scure/base";

const hexPattern = /^[0-9a-f]{64}$/i;

export function isValidHex(value: unknown): value is string {
  return typeof value === "string" && hexPattern.test(value);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!hexPattern.test(normalized)) {
    throw new Error("Input must be 64 hex characters.");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

export function encodeNostrBech32(prefix: "npub" | "nsec", bytes: Uint8Array): string {
  return bech32.encode(prefix, bech32.toWords(bytes), 1000);
}

export function decodeNostrBech32(prefix: "npub" | "nsec", value: string): Uint8Array {
  const decoded = bech32.decode(value as `${string}1${string}`, 1000);
  if (decoded.prefix !== prefix) {
    throw new Error(`Expected a ${prefix} key.`);
  }
  return Uint8Array.from(bech32.fromWords(decoded.words));
}

export function normalizePublicKeyHex(pubkey: string): string | null {
  const normalized = pubkey.trim().toLowerCase();
  if (hexPattern.test(normalized)) {
    return normalized;
  }

  if (!normalized.startsWith("npub1")) {
    return null;
  }

  try {
    return bytesToHex(decodeNostrBech32("npub", normalized));
  } catch {
    return null;
  }
}

export function normalizePublicKeyNpub(pubkey: string): string {
  const normalized = pubkey.trim().toLowerCase();
  if (normalized.startsWith("npub1")) {
    return normalized;
  }

  if (hexPattern.test(normalized)) {
    return encodeNostrBech32("npub", hexToBytes(normalized));
  }

  return pubkey.trim();
}
