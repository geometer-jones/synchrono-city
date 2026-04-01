import { afterEach, describe, expect, it, vi } from "vitest";

import type { GeoNote, RelayListEntry } from "./data";
import { computePulseRelayBackoffMs, startPulseRelayRollup } from "./pulse-relay-rollup";

function createRelay(name: string, url: string): RelayListEntry {
  return {
    name,
    url,
    inbox: true,
    outbox: true
  };
}

describe("computePulseRelayBackoffMs", () => {
  it("doubles the backoff until the configured cap", () => {
    expect(computePulseRelayBackoffMs(1, 1_000, 8_000)).toBe(1_000);
    expect(computePulseRelayBackoffMs(2, 1_000, 8_000)).toBe(2_000);
    expect(computePulseRelayBackoffMs(3, 1_000, 8_000)).toBe(4_000);
    expect(computePulseRelayBackoffMs(4, 1_000, 8_000)).toBe(8_000);
    expect(computePulseRelayBackoffMs(5, 1_000, 8_000)).toBe(8_000);
  });
});

describe("startPulseRelayRollup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prioritizes the current relay and rolls remaining relays through the concurrency window", async () => {
    vi.useFakeTimers();

    const relays = [
      createRelay("Mission Mesh", "wss://mission-mesh.example/relay"),
      createRelay("Harbor Dispatch", "wss://harbor-dispatch.example/relay"),
      createRelay("Synchrono City Local", "ws://localhost:8080"),
      createRelay("River Wire", "wss://river-wire.example/relay")
    ];
    const pendingQueries = new Map<string, { resolve: (notes: GeoNote[]) => void; reject: (error: Error) => void }>();
    const queryRelay = vi.fn((relayUrl: string) => {
      return new Promise<GeoNote[]>((resolve, reject) => {
        pendingQueries.set(relayUrl, { resolve, reject });
      });
    });

    const rollup = startPulseRelayRollup({
      relays,
      currentRelayUrl: "ws://localhost:8080",
      initialDelayMs: 250,
      maxConcurrentQueries: 2,
      queryRelay,
      onRelayNotes: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(queryRelay).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(queryRelay.mock.calls.map((call) => call[0])).toEqual([
      "ws://localhost:8080",
      "wss://mission-mesh.example/relay"
    ]);

    pendingQueries.get("ws://localhost:8080")?.resolve([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(queryRelay.mock.calls.map((call) => call[0])).toEqual([
      "ws://localhost:8080",
      "wss://mission-mesh.example/relay",
      "wss://harbor-dispatch.example/relay"
    ]);

    pendingQueries.get("wss://mission-mesh.example/relay")?.resolve([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(queryRelay.mock.calls.map((call) => call[0])).toEqual([
      "ws://localhost:8080",
      "wss://mission-mesh.example/relay",
      "wss://harbor-dispatch.example/relay",
      "wss://river-wire.example/relay"
    ]);

    rollup.stop();
  });

  it("backs off failed relays before retrying them", async () => {
    vi.useFakeTimers();

    const failingRelay = createRelay("Mission Mesh", "wss://mission-mesh.example/relay");
    const healthyRelay = createRelay("Synchrono City Local", "ws://localhost:8080");
    const queryRelay = vi.fn((relayUrl: string) => {
      if (relayUrl === failingRelay.url) {
        return Promise.reject(new Error("Connection error"));
      }

      return new Promise<GeoNote[]>(() => {
        // Keep the healthy relay in flight so the scheduler only retries when the backoff expires.
      });
    });
    const onRelayError = vi.fn();

    const rollup = startPulseRelayRollup({
      relays: [failingRelay, healthyRelay],
      currentRelayUrl: healthyRelay.url,
      initialDelayMs: 100,
      maxConcurrentQueries: 2,
      failureBackoffBaseMs: 1_000,
      failureBackoffMaxMs: 4_000,
      queryRelay,
      onRelayNotes: vi.fn(),
      onRelayError
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(0);

    expect(queryRelay.mock.calls.filter((call) => call[0] === failingRelay.url)).toHaveLength(1);
    expect(onRelayError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(queryRelay.mock.calls.filter((call) => call[0] === failingRelay.url)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryRelay.mock.calls.filter((call) => call[0] === failingRelay.url)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(queryRelay.mock.calls.filter((call) => call[0] === failingRelay.url)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryRelay.mock.calls.filter((call) => call[0] === failingRelay.url)).toHaveLength(3);

    rollup.stop();
  });
});
