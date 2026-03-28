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
const conciergeBaseUrl = import.meta.env.DEV ? "" : (import.meta.env.VITE_CONCIERGE_URL ?? "");

export function resolveApiURL(path: string): URL {
  return new URL(path, conciergeBaseUrl || window.location.origin);
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
    throw new ApiError(formatResponseErrorMessage(data, response.status), response.status, data);
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

function formatResponseErrorMessage(data: unknown, status: number) {
  if (typeof data === "string" && data.length > 0) {
    return data;
  }

  if (typeof data === "object" && data !== null && "message" in data) {
    return String((data as { message: unknown }).message);
  }

  return `Request failed with status ${status}`;
}
