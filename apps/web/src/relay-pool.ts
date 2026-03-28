/**
 * WebSocket connection pool for Nostr relay connections.
 *
 * Manages connection lifecycle, reuse, and cleanup to reduce
 * the overhead of establishing new WebSocket connections.
 */

import { devLogger } from "./dev-logger";

type ConnectionState = "connecting" | "open" | "closing" | "closed";

type PooledConnection = {
  url: string;
  socket: WebSocket;
  state: ConnectionState;
  lastActivity: number;
  messageHandlers: Set<(data: unknown) => void>;
  errorHandlers: Set<(error: Error) => void>;
};

type PoolOptions = {
  /** Maximum idle time before closing a connection (ms) */
  idleTimeoutMs?: number;
  /** Maximum connections to keep in pool */
  maxConnections?: number;
};

const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONNECTIONS = 5;

class RelayConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly idleTimeoutMs: number;
  private readonly maxConnections: number;

  constructor(options: PoolOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  }

  /**
   * Gets or creates a connection to the specified relay URL.
   * Returns a cleanup function to call when done with the connection.
   */
  async getConnection(
    url: string,
    onMessage?: (data: unknown) => void,
    onError?: (error: Error) => void
  ): Promise<{ socket: WebSocket; cleanup: () => void }> {
    const normalizedUrl = this.normalizeUrl(url);
    let connection = this.connections.get(normalizedUrl);

    if (connection && connection.state === "open") {
      devLogger.debug("POOL", "Reusing existing connection", normalizedUrl);
      connection.lastActivity = Date.now();

      if (onMessage) {
        connection.messageHandlers.add(onMessage);
      }
      if (onError) {
        connection.errorHandlers.add(onError);
      }

      return {
        socket: connection.socket,
        cleanup: () => this.cleanupHandler(normalizedUrl, onMessage, onError)
      };
    }

    // Close stale connection if exists
    if (connection) {
      devLogger.debug("POOL", "Closing stale connection", normalizedUrl);
      this.closeConnection(normalizedUrl);
    }

    // Enforce max connections by closing oldest idle connection
    if (this.connections.size >= this.maxConnections) {
      this.evictOldestIdle();
    }

    // Create new connection
    connection = await this.createConnection(normalizedUrl, onMessage, onError);

    return {
      socket: connection.socket,
      cleanup: () => this.cleanupHandler(normalizedUrl, onMessage, onError)
    };
  }

  /**
   * Starts the idle connection cleanup interval.
   */
  startCleanup(): void {
    if (this.idleCheckInterval) {
      return;
    }

    this.idleCheckInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.idleTimeoutMs / 2);

    devLogger.debug("POOL", "Started cleanup interval");
  }

  /**
   * Stops the idle connection cleanup interval.
   */
  stopCleanup(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
      devLogger.debug("POOL", "Stopped cleanup interval");
    }
  }

  /**
   * Closes all connections in the pool.
   */
  closeAll(): void {
    devLogger.debug("POOL", "Closing all connections", { count: this.connections.size });
    for (const url of this.connections.keys()) {
      this.closeConnection(url);
    }
  }

  /**
   * Gets pool statistics for monitoring.
   */
  getStats(): { totalConnections: number; connections: Array<{ url: string; state: ConnectionState; lastActivity: number }> } {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.entries()).map(([url, conn]) => ({
        url,
        state: conn.state,
        lastActivity: conn.lastActivity
      }))
    };
  }

  private async createConnection(
    url: string,
    onMessage?: (data: unknown) => void,
    onError?: (error: Error) => void
  ): Promise<PooledConnection> {
    devLogger.debug("POOL", "Creating new connection", url);

    const connection: PooledConnection = {
      url,
      socket: new WebSocket(url),
      state: "connecting",
      lastActivity: Date.now(),
      messageHandlers: new Set(),
      errorHandlers: new Set()
    };

    if (onMessage) {
      connection.messageHandlers.add(onMessage);
    }
    if (onError) {
      connection.errorHandlers.add(onError);
    }

    this.connections.set(url, connection);

    // Set up event handlers
    connection.socket.addEventListener("open", () => {
      connection.state = "open";
      connection.lastActivity = Date.now();
      devLogger.debug("POOL", "Connection opened", url);
    });

    connection.socket.addEventListener("message", (event) => {
      connection.lastActivity = Date.now();
      try {
        const data = JSON.parse(event.data);
        for (const handler of connection.messageHandlers) {
          handler(data);
        }
      } catch {
        // Non-JSON message, pass through
        for (const handler of connection.messageHandlers) {
          handler(event.data);
        }
      }
    });

    connection.socket.addEventListener("error", () => {
      const error = new Error(`WebSocket error for ${url}`);
      for (const handler of connection.errorHandlers) {
        handler(error);
      }
      devLogger.error("POOL", "Connection error", url);
    });

    connection.socket.addEventListener("close", () => {
      connection.state = "closed";
      devLogger.debug("POOL", "Connection closed", url);
    });

    // Wait for connection to open
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout for ${url}`));
      }, 10_000);

      connection.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(connection);
      });

      connection.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed for ${url}`));
      });
    });
  }

  private cleanupHandler(url: string, onMessage?: (data: unknown) => void, onError?: (error: Error) => void): void {
    const connection = this.connections.get(url);
    if (!connection) {
      return;
    }

    if (onMessage) {
      connection.messageHandlers.delete(onMessage);
    }
    if (onError) {
      connection.errorHandlers.delete(onError);
    }
  }

  private closeConnection(url: string): void {
    const connection = this.connections.get(url);
    if (!connection) {
      return;
    }

    connection.state = "closing";
    try {
      connection.socket.close();
    } catch {
      // Ignore close errors
    }
    this.connections.delete(url);
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idleThreshold = now - this.idleTimeoutMs;

    for (const [url, connection] of this.connections.entries()) {
      if (
        connection.state === "open" &&
        connection.lastActivity < idleThreshold &&
        connection.messageHandlers.size === 0
      ) {
        devLogger.debug("POOL", "Closing idle connection", url);
        this.closeConnection(url);
      }
    }
  }

  private evictOldestIdle(): void {
    let oldestUrl: string | null = null;
    let oldestActivity = Infinity;

    for (const [url, connection] of this.connections.entries()) {
      if (connection.messageHandlers.size === 0 && connection.lastActivity < oldestActivity) {
        oldestUrl = url;
        oldestActivity = connection.lastActivity;
      }
    }

    if (oldestUrl) {
      devLogger.debug("POOL", "Evicting oldest idle connection to make room", oldestUrl);
      this.closeConnection(oldestUrl);
    }
  }

  private normalizeUrl(url: string): string {
    return url.trim().toLowerCase();
  }
}

// Singleton pool instance
export const relayPool = new RelayConnectionPool();

// Export class for testing
export { RelayConnectionPool };
