import { describe, expect, it } from "vitest";

import { decrypt, encrypt, isEncryptedData } from "./crypto";

describe("crypto", () => {
  describe("encrypt and decrypt", () => {
    it("encrypts and decrypts plaintext correctly", async () => {
      const plaintext = "my-secret-private-key-hex-string-64-chars-1234567890abcdef";
      const password = "my-secure-password";

      const encrypted = await encrypt(plaintext, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext", async () => {
      const plaintext = "same-plaintext";
      const password = "same-password";

      const encrypted1 = await encrypt(plaintext, password);
      const encrypted2 = await encrypt(plaintext, password);

      // Different due to random salt and IV
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it("fails to decrypt with wrong password", async () => {
      const plaintext = "secret-data";
      const encrypted = await encrypt(plaintext, "correct-password");

      await expect(decrypt(encrypted, "wrong-password")).rejects.toThrow(
        "Decryption failed. Wrong password or corrupted data."
      );
    });

    it("handles empty plaintext", async () => {
      const plaintext = "";
      const password = "password";

      const encrypted = await encrypt(plaintext, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe("");
    });

    it("handles unicode plaintext", async () => {
      const plaintext = "🔥 Hello 世界 🌍";
      const password = "password";

      const encrypted = await encrypt(plaintext, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(plaintext);
    });

    it("handles long plaintext", async () => {
      const plaintext = "x".repeat(10_000);
      const password = "password";

      const encrypted = await encrypt(plaintext, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("isEncryptedData", () => {
    it("returns true for valid encrypted data", async () => {
      const encrypted = await encrypt("test", "password");
      expect(isEncryptedData(encrypted)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isEncryptedData(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isEncryptedData(undefined)).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isEncryptedData({})).toBe(false);
    });

    it("returns false for partial encrypted data", () => {
      expect(isEncryptedData({ salt: "abc", iv: "def" })).toBe(false);
    });

    it("returns false for wrong version", async () => {
      const encrypted = await encrypt("test", "password");
      const wrongVersion = { ...encrypted, v: 2 };
      expect(isEncryptedData(wrongVersion)).toBe(false);
    });
  });
});
