/**
 * Dev-only logging utility for Nostr operations.
 *
 * In production, all logging is disabled via tree-shaking.
 * In development, provides visibility into WebSocket connections,
 * relay operations, and key management.
 */

const isDev = import.meta.env.DEV;

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message}`;
  }
  return `${prefix} ${entry.message}`;
}

function log(level: LogLevel, category: string, message: string, data?: unknown) {
  if (!isDev) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString().split("T")[1]!.slice(0, 12),
    level,
    category,
    message,
    data
  };

  const formatted = formatLog(entry);

  switch (level) {
    case "debug":
      console.debug(formatted, data ?? "");
      break;
    case "info":
      console.info(formatted, data ?? "");
      break;
    case "warn":
      console.warn(formatted, data ?? "");
      break;
    case "error":
      console.error(formatted, data ?? "");
      break;
  }
}

export const devLogger = {
  debug: (category: string, message: string, data?: unknown) => log("debug", category, message, data),
  info: (category: string, message: string, data?: unknown) => log("info", category, message, data),
  warn: (category: string, message: string, data?: unknown) => log("warn", category, message, data),
  error: (category: string, message: string, data?: unknown) => log("error", category, message, data),

  // Convenience methods for common categories
  ws: {
    connecting: (url: string) => log("debug", "WS", "Connecting", url),
    connected: (url: string) => log("debug", "WS", "Connected", url),
    closed: (url: string, reason?: string) => log("debug", "WS", "Closed", { url, reason }),
    error: (url: string, error: unknown) => log("error", "WS", "Error", { url, error }),
    message: (url: string, type: string) => log("debug", "WS", `Message: ${type}`, url),
    sent: (url: string, type: string) => log("debug", "WS", `Sent: ${type}`, url)
  },

  relay: {
    publishing: (relayUrl: string, eventId: string) =>
      log("info", "RELAY", "Publishing event", { relayUrl, eventId: eventId.slice(0, 8) }),
    published: (relayUrl: string, eventId: string) =>
      log("info", "RELAY", "Event published", { relayUrl, eventId: eventId.slice(0, 8) }),
    publishFailed: (relayUrl: string, eventId: string, reason: string) =>
      log("error", "RELAY", "Publish failed", { relayUrl, eventId: eventId.slice(0, 8), reason }),
    querying: (relayUrl: string, filter: unknown) =>
      log("info", "RELAY", "Querying", { relayUrl, filter }),
    queryComplete: (relayUrl: string, count: number) =>
      log("info", "RELAY", "Query complete", { relayUrl, resultCount: count })
  },

  key: {
    generated: (npub: string) => log("info", "KEY", "Generated key", npub.slice(0, 12) + "..."),
    imported: (npub: string) => log("info", "KEY", "Imported key", npub.slice(0, 12) + "..."),
    activated: (npub: string) => log("info", "KEY", "Activated key", npub.slice(0, 12) + "..."),
    removed: (npub: string) => log("info", "KEY", "Removed key", npub.slice(0, 12) + "..."),
    signing: (eventId: string) => log("debug", "KEY", "Signing event", eventId.slice(0, 8)),
    signed: (eventId: string) => log("debug", "KEY", "Event signed", eventId.slice(0, 8)),
    encrypted: () => log("info", "KEY", "Keyring encrypted"),
    decrypted: () => log("info", "KEY", "Keyring decrypted"),
    locked: () => log("info", "KEY", "Keyring locked"),
    unlocked: () => log("info", "KEY", "Keyring unlocked")
  }
} as const;
