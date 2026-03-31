export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// In local Vite dev we proxy API requests through the dev server to avoid
// cross-origin requests to the Dockerized Concierge backend.
const conciergeOrigin = import.meta.env.VITE_CONCIERGE_URL ?? "";
const conciergeRequestBaseUrl = import.meta.env.DEV ? "" : conciergeOrigin;

export function resolveApiURL(path: string): URL {
  return new URL(path, conciergeRequestBaseUrl || window.location.origin);
}

export function resolveApiAuthURL(path: string): URL {
  return new URL(path, conciergeOrigin || window.location.origin);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiURL(path), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  const text = await response.text();
  const data = parseResponseBody(text);

  if (!response.ok) {
    throw new ApiError(formatApiErrorMessage(data, response.status), response.status, data);
  }

  return data as T;
}

function parseResponseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

export function formatApiErrorMessage(data: unknown, status: number) {
  if (typeof data === "string" && data.length > 0) {
    return data;
  }

  if (typeof data === "object" && data !== null) {
    if ("message" in data && typeof (data as { message?: unknown }).message === "string") {
      return String((data as { message: string }).message);
    }

    if ("reason" in data && typeof (data as { reason?: unknown }).reason === "string") {
      return formatDecisionReason(data as { reason: string; scope?: unknown; proof_requirement?: unknown });
    }
  }

  return `Request failed with status ${status}`;
}

function formatDecisionReason(data: { reason: string; scope?: unknown; proof_requirement?: unknown }) {
  const reason = data.reason.trim();
  const scope = typeof data.scope === "string" ? data.scope.trim() : "";
  const proofRequirement =
    typeof data.proof_requirement === "string" ? data.proof_requirement.trim() : "";

  switch (reason) {
    case "room_permission_missing":
    case "room_permission_denied":
      return scope === "media.publish"
        ? "This room does not allow you to publish audio or video."
        : "You are not allowed to join this room.";
    case "not_allowlisted":
      return "This room requires guest-list access.";
    case "required_proof":
      return proofRequirement
        ? `This room requires verified ${humanizeDecisionToken(proofRequirement)}.`
        : "This room requires additional proof.";
    case "standing_blocks_capability":
      return "Your standing does not allow this action.";
    case "block_policy":
      return "You are blocked from this action.";
    case "policy_lookup_failed":
    case "room_permission_lookup_failed":
    case "gate_policy_lookup_failed":
    case "proof_lookup_failed":
      return "Permission check failed. Try again.";
    default:
      return humanizeDecisionToken(reason);
  }
}

function humanizeDecisionToken(value: string) {
  return value.replace(/_/g, " ").trim();
}
