import { describe, expect, it } from "vitest";

import { describeRelayConnectionIssue } from "./relay-url-diagnostics";

describe("describeRelayConnectionIssue", () => {
  it("flags localhost relay URLs for remote browsers", () => {
    expect(
      describeRelayConnectionIssue("ws://localhost:8080", "http://app.example.test/app")
    ).toContain("points to localhost");
  });

  it("flags insecure ws relay URLs on https pages", () => {
    expect(
      describeRelayConnectionIssue("ws://relay.example.test", "https://app.example.test/app")
    ).toContain("uses ws:// while this page is loaded over HTTPS");
  });

  it("returns the strongest warning when localhost and https both apply", () => {
    expect(
      describeRelayConnectionIssue("ws://localhost:8080", "https://app.example.test/app")
    ).toContain("Remote HTTPS browsers cannot reach it");
  });

  it("returns null for reachable secure relay URLs", () => {
    expect(
      describeRelayConnectionIssue("wss://relay.example.test", "https://app.example.test/app")
    ).toBeNull();
  });
});
