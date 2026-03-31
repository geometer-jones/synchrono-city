import { afterEach, describe, expect, it, vi } from "vitest";

import { importLocalKeyMaterial } from "./key-manager";

describe("media client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("signs Blossom uploads with BUD-11 authorization", async () => {
    const { uploadBlossomFile } = await import("./media-client");
    const key = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      const authorization = headers.get("Authorization");
      expect(authorization).toMatch(/^Nostr /);
      expect(authorization).not.toContain("=");
      expect(headers.get("X-SHA-256")).toBe(await sha256Hex(file));

      const event = JSON.parse(decodeBase64Url(String(authorization).replace(/^Nostr /, ""))) as {
        kind: number;
        pubkey: string;
        created_at: number;
        content: string;
        tags: string[][];
      };

      expect(event.kind).toBe(24242);
      expect(event.pubkey).toBe(key.publicKeyHex);
      expect(event.content).toBe("Authorize upload");
      expect(event.tags).toEqual(
        expect.arrayContaining([
          ["t", "upload"],
          ["expiration", expect.any(String)],
          ["x", await sha256Hex(file)]
        ])
      );

      const expirationTag = event.tags.find((tag) => tag[0] === "expiration");
      expect(expirationTag).toBeDefined();
      expect(Number(expirationTag?.[1])).toBeGreaterThan(event.created_at);

      return new Response(
        JSON.stringify({
          url: "https://blossom.example.test/avatar.png"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    await expect(
      uploadBlossomFile(file, undefined, {
        privateKeyHex: key.privateKeyHex,
        publicKeyHex: key.publicKeyHex
      })
    ).resolves.toMatchObject({
      url: "https://blossom.example.test/avatar.png"
    });
  });

  it("surfaces plain-text Blossom errors instead of failing JSON parsing", async () => {
    const { uploadBlossomFile } = await import("./media-client");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad Request", {
        status: 400,
        headers: { "Content-Type": "text/plain" }
      })
    );

    await expect(
      uploadBlossomFile(
        new File(["avatar"], "avatar.png", { type: "image/png" }),
        undefined,
        {
          privateKeyHex: "1111111111111111111111111111111111111111111111111111111111111111"
        }
      )
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Bad Request",
      status: 400,
      data: "Bad Request"
    });
  });

  it("preserves a Blossom base path when resolving the upload endpoint", async () => {
    vi.stubEnv("VITE_BLOSSOM_URL", "https://media.example.test/blossom");
    const { uploadBlossomFile } = await import("./media-client");
    const key = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://media.example.test/blossom/avatar.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await uploadBlossomFile(new File(["avatar"], "avatar.png", { type: "image/png" }), undefined, {
      privateKeyHex: key.privateKeyHex,
      publicKeyHex: key.publicKeyHex
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("https://media.example.test/blossom/upload"),
      expect.any(Object)
    );
  });

  it("surfaces structured LiveKit token deny reasons instead of a generic 403", async () => {
    const { requestLiveKitToken } = await import("./media-client");
    const key = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          decision: "deny",
          reason: "required_proof",
          scope: "media.join",
          proof_requirement: "nostr_auth"
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await expect(
      requestLiveKitToken("beacon:9q8yyk", {
        privateKeyHex: key.privateKeyHex,
        publicKeyHex: key.publicKeyHex
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "This room requires verified nostr auth.",
      status: 403,
      data: expect.objectContaining({
        reason: "required_proof"
      })
    });
  });
});

async function sha256Hex(value: Blob) {
  const arrayBuffer =
    typeof value.arrayBuffer === "function"
      ? await value.arrayBuffer()
      : await new Response(value).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Url(value: string) {
  const padding = (4 - (value.length % 4)) % 4;
  return atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding));
}
