import { ApiError, resolveApiURL } from "./api";

const kindHTTPAuth = 27235;
const blossomBaseUrl = import.meta.env.VITE_BLOSSOM_URL ?? "";
const maxBlossomFileBytes = 50 * 1024 * 1024;

const supportedMimePrefixes = ["image/", "audio/", "video/"];
const supportedMimeTypes = new Set(["application/pdf"]);

export type LiveKitTokenResponse = {
  decision: string;
  reason: string;
  token: {
    token: string;
    identity: string;
    room_id: string;
    livekit_url: string;
    expires_at: string;
    grants: {
      room_join: boolean;
      can_publish: boolean;
      can_subscribe: boolean;
    };
  };
};

export type BlossomUpload = {
  url: string;
  sha256: string;
  mimeType: string;
  size: number;
};

export class MediaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaAuthError";
  }
}

export function hasNostrSigner() {
  return typeof window !== "undefined" && Boolean(window.nostr);
}

export async function requestLiveKitToken(roomID: string): Promise<LiveKitTokenResponse> {
  const url = resolveApiURL("/api/v1/token");
  const bodyText = JSON.stringify({ room_id: roomID.trim() });

  return fetchJSON<LiveKitTokenResponse>(url, {
    method: "POST",
    headers: {
      Authorization: await createAuthorizationHeader(url.toString(), "POST", bodyText)
    },
    body: bodyText
  });
}

export async function uploadBlossomFile(file: File, signal?: AbortSignal): Promise<BlossomUpload> {
  validateBlossomFile(file);

  const sha256 = await sha256Hex(file);
  const uploadURL = new URL("/upload", blossomBaseUrl || window.location.origin);
  const response = await fetch(uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      Authorization: await createAuthorizationHeader(uploadURL.toString(), "PUT", file)
    },
    body: file,
    signal
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  const url = extractUploadedURL(data) ?? buildBlossomAssetURL(sha256, file);

  return {
    url,
    sha256,
    mimeType: file.type || "application/octet-stream",
    size: file.size
  };
}

function validateBlossomFile(file: File) {
  if (file.size > maxBlossomFileBytes) {
    throw new MediaAuthError("File too large. Blossom uploads are limited to 50 MB.");
  }

  if (
    !supportedMimePrefixes.some((prefix) => file.type.startsWith(prefix)) &&
    !supportedMimeTypes.has(file.type)
  ) {
    throw new MediaAuthError("Unsupported file type. Use image, audio, video, or PDF media.");
  }
}

async function fetchJSON<T>(url: URL, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

async function createAuthorizationHeader(url: string, method: string, payload?: string | Blob): Promise<string> {
  const tags = [
    ["u", url],
    ["method", method]
  ];

  if (payload) {
    tags.push(["payload", await sha256Hex(payload)]);
  }

  const signedEvent = await signEvent({
    kind: kindHTTPAuth,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ""
  });

  return `Nostr ${btoa(JSON.stringify(signedEvent))}`;
}

async function signEvent(event: NostrEventTemplate): Promise<NostrSignedEvent> {
  const nostr = window.nostr;
  if (!nostr) {
    throw new MediaAuthError("A Nostr browser extension is required for media requests.");
  }

  return nostr.signEvent(event);
}

async function sha256Hex(value: string | ArrayBuffer | Blob): Promise<string> {
  const bytes = await toUint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function toUint8Array(value: string | ArrayBuffer | Blob) {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  const arrayBuffer =
    typeof value.arrayBuffer === "function"
      ? await value.arrayBuffer()
      : await new Response(value).arrayBuffer();

  return new Uint8Array(arrayBuffer);
}

function extractUploadedURL(data: unknown) {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  if ("url" in data && typeof data.url === "string") {
    return data.url;
  }

  return null;
}

function buildBlossomAssetURL(sha256: string, file: File) {
  const extension = extractExtension(file);
  const suffix = extension ? `.${extension}` : "";
  const base = blossomBaseUrl.replace(/\/$/, "");
  return `${base}/${sha256}${suffix}`;
}

function extractExtension(file: File) {
  const namePart = file.name.trim().split(".").pop();
  if (namePart && namePart !== file.name.trim()) {
    return namePart.toLowerCase();
  }

  if (file.type === "application/pdf") {
    return "pdf";
  }

  const subtype = file.type.split("/")[1];
  return subtype ? subtype.toLowerCase() : "";
}
