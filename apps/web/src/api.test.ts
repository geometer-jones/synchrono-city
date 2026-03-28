import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces plain-text error responses instead of failing JSON parsing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("404 page not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
      })
    );

    await expect(apiFetch("/api/v1/social/beacons", { method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "ApiError",
      message: "404 page not found",
      status: 404,
      data: "404 page not found"
    });
  });

  it("returns plain-text success bodies without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      })
    );

    await expect(apiFetch<string>("/healthz")).resolves.toBe("ok");
  });
});
