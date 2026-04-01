import type { GeoNote, RelayListEntry } from "./data";
import { queryRecentKindOneNotes } from "./nostr";

const defaultInitialDelayMs = 250;
const defaultMaxConcurrentQueries = 4;
const defaultQueryLimit = 50;
const defaultSuccessCooldownMs = 60_000;
const defaultFailureBackoffBaseMs = 15_000;
const defaultFailureBackoffMaxMs = 5 * 60_000;

type QueryRelayNotes = (relayURL: string, options?: { limit?: number }) => Promise<GeoNote[]>;

type PulseRelayRollupOptions = {
  relays: RelayListEntry[];
  currentRelayUrl: string;
  onRelayNotes: (relay: RelayListEntry, notes: GeoNote[]) => void;
  onRelayError?: (relay: RelayListEntry, error: Error) => void;
  queryRelay?: QueryRelayNotes;
  initialDelayMs?: number;
  maxConcurrentQueries?: number;
  queryLimit?: number;
  successCooldownMs?: number;
  failureBackoffBaseMs?: number;
  failureBackoffMaxMs?: number;
};

type RelayRollState = {
  relay: RelayListEntry;
  nextRunAt: number;
  failureCount: number;
  inFlight: boolean;
  index: number;
};

export type PulseRelayRollupHandle = {
  stop: () => void;
};

export function computePulseRelayBackoffMs(
  failureCount: number,
  baseMs = defaultFailureBackoffBaseMs,
  maxMs = defaultFailureBackoffMaxMs
) {
  const normalizedFailureCount = Math.max(1, Math.floor(failureCount));
  return Math.min(maxMs, baseMs * 2 ** (normalizedFailureCount - 1));
}

export function startPulseRelayRollup(options: PulseRelayRollupOptions): PulseRelayRollupHandle {
  const queryRelay = options.queryRelay ?? queryRecentKindOneNotes;
  const initialDelayMs = normalizeNonNegativeInteger(options.initialDelayMs, defaultInitialDelayMs);
  const maxConcurrentQueries = Math.max(
    1,
    normalizeNonNegativeInteger(options.maxConcurrentQueries, defaultMaxConcurrentQueries)
  );
  const queryLimit = Math.max(1, normalizeNonNegativeInteger(options.queryLimit, defaultQueryLimit));
  const successCooldownMs = normalizeNonNegativeInteger(options.successCooldownMs, defaultSuccessCooldownMs);
  const failureBackoffBaseMs = Math.max(
    1,
    normalizeNonNegativeInteger(options.failureBackoffBaseMs, defaultFailureBackoffBaseMs)
  );
  const failureBackoffMaxMs = Math.max(
    failureBackoffBaseMs,
    normalizeNonNegativeInteger(options.failureBackoffMaxMs, defaultFailureBackoffMaxMs)
  );
  const relayStates = orderPulseRelays(options.relays, options.currentRelayUrl).map((relay, index) => ({
    relay,
    nextRunAt: 0,
    failureCount: 0,
    inFlight: false,
    index
  }));

  let stopped = false;
  let timeoutId: number | null = null;

  const clearScheduledPump = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const schedulePump = (delayMs: number) => {
    if (stopped) {
      return;
    }

    clearScheduledPump();
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      pump();
    }, Math.max(0, delayMs));
  };

  const pump = () => {
    if (stopped) {
      return;
    }

    clearScheduledPump();

    const now = Date.now();
    const inFlightCount = relayStates.filter((state) => state.inFlight).length;
    const availableSlots = Math.max(0, maxConcurrentQueries - inFlightCount);

    if (availableSlots > 0) {
      const dueRelayStates = relayStates
        .filter((state) => !state.inFlight && state.nextRunAt <= now)
        .sort((left, right) => compareRelayStates(left, right, options.currentRelayUrl));

      for (const relayState of dueRelayStates.slice(0, availableSlots)) {
        runRelayQuery(relayState);
      }
    }

    const nextRunAt = relayStates
      .filter((state) => !state.inFlight)
      .reduce<number>((soonest, state) => Math.min(soonest, state.nextRunAt), Number.POSITIVE_INFINITY);

    if (Number.isFinite(nextRunAt)) {
      schedulePump(Math.max(0, nextRunAt - Date.now()));
    }
  };

  const runRelayQuery = (relayState: RelayRollState) => {
    relayState.inFlight = true;

    void queryRelay(relayState.relay.url, { limit: queryLimit })
      .then((notes) => {
        if (stopped) {
          return;
        }

        relayState.failureCount = 0;
        relayState.nextRunAt = Date.now() + successCooldownMs;
        options.onRelayNotes(relayState.relay, notes);
      })
      .catch((error) => {
        if (stopped) {
          return;
        }

        relayState.failureCount += 1;
        relayState.nextRunAt =
          Date.now() + computePulseRelayBackoffMs(relayState.failureCount, failureBackoffBaseMs, failureBackoffMaxMs);
        options.onRelayError?.(
          relayState.relay,
          error instanceof Error ? error : new Error("Relay note query failed.")
        );
      })
      .finally(() => {
        relayState.inFlight = false;
        pump();
      });
  };

  schedulePump(initialDelayMs);

  return {
    stop() {
      stopped = true;
      clearScheduledPump();
    }
  };
}

function compareRelayStates(left: RelayRollState, right: RelayRollState, currentRelayUrl: string) {
  const leftPriority = left.relay.url === currentRelayUrl ? 0 : 1;
  const rightPriority = right.relay.url === currentRelayUrl ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (left.nextRunAt !== right.nextRunAt) {
    return left.nextRunAt - right.nextRunAt;
  }

  return left.index - right.index;
}

function orderPulseRelays(relays: RelayListEntry[], currentRelayUrl: string) {
  const currentRelayEntries = relays.filter((relay) => relay.inbox && relay.url === currentRelayUrl);
  const otherRelayEntries = relays.filter((relay) => relay.inbox && relay.url !== currentRelayUrl);
  return [...currentRelayEntries, ...otherRelayEntries];
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}
