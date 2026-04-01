const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function describeRelayConnectionIssue(relayURL: string, pageURL: string) {
  try {
    const relay = new URL(relayURL);
    const page = new URL(pageURL);
    const relayUsesInsecureWebSocket = relay.protocol === "ws:";
    const relayIsLoopback = isLoopbackHost(relay.hostname);
    const pageIsLoopback = isLoopbackHost(page.hostname);

    if (relayIsLoopback && !pageIsLoopback) {
      return relayUsesInsecureWebSocket && page.protocol === "https:"
        ? `Relay URL ${relayURL} points to localhost over ws://. Remote HTTPS browsers cannot reach it. Set PRIMARY_RELAY_URL to a public wss:// relay URL.`
        : `Relay URL ${relayURL} points to localhost. Browsers on ${page.hostname} cannot reach it. Set PRIMARY_RELAY_URL to a reachable relay host.`;
    }

    if (relayUsesInsecureWebSocket && page.protocol === "https:") {
      return `Relay URL ${relayURL} uses ws:// while this page is loaded over HTTPS. Configure PRIMARY_RELAY_URL as wss://...`;
    }
  } catch {
    return null;
  }

  return null;
}

function isLoopbackHost(hostname: string) {
  return loopbackHosts.has(hostname.trim().toLowerCase());
}
