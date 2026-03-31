import { ApiError, formatApiErrorMessage, resolveApiAuthURL, resolveApiURL } from "./api";
import { signEventWithPrivateKey } from "./nostr";

const kindHTTPAuth = 27235;
const kindBlossomAuth = 24242;
const blossomBaseUrl = import.meta.env.VITE_BLOSSOM_URL ?? "";
const maxBlossomFileBytes = 50 * 1024 * 1024;
const blossomAuthorizationTtlSeconds = 60;

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

export type MediaSigningOptions = {
  privateKeyHex?: string;
  publicKeyHex?: string;
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

export async function requestLiveKitToken(
  roomID: string,
  signingOptions?: MediaSigningOptions
): Promise<LiveKitTokenResponse> {
  const url = resolveApiURL("/api/v1/token");
  const authorizationURL = resolveApiAuthURL("/api/v1/token");
  const bodyText = JSON.stringify({ room_id: roomID.trim() });

  return fetchJSON<LiveKitTokenResponse>(url, {
    method: "POST",
    headers: {
      Authorization: await createAuthorizationHeader(authorizationURL.toString(), "POST", bodyText, signingOptions)
    },
    body: bodyText
  });
}

export async function uploadBlossomFile(
  file: File,
  signal?: AbortSignal,
  signingOptions?: MediaSigningOptions
): Promise<BlossomUpload> {
  validateBlossomFile(file);

  const sha256 = await sha256Hex(file);
  const uploadURL = resolveBlossomURL("upload");
  const response = await fetch(uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-SHA-256": sha256,
      Authorization: await createBlossomAuthorizationHeader(sha256, signingOptions)
    },
    body: file,
    signal
  });

  const text = await response.text();
  const data = parseResponseBody(text);
  if (!response.ok) {
    throw new ApiError(formatResponseErrorMessage(data, response.status), response.status, data);
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
  return formatApiErrorMessage(data, status);
}

async function createAuthorizationHeader(
  url: string,
  method: string,
  payload?: string | Blob,
  signingOptions?: MediaSigningOptions
): Promise<string> {
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
  }, signingOptions);

  return `Nostr ${btoa(JSON.stringify(signedEvent))}`;
}

async function createBlossomAuthorizationHeader(
  sha256: string,
  signingOptions?: MediaSigningOptions
): Promise<string> {
  const createdAt = Math.floor(Date.now() / 1000);
  const signedEvent = await signEvent(
    {
      kind: kindBlossomAuth,
      created_at: createdAt,
      tags: [
        ["t", "upload"],
        ["x", sha256],
        ["expiration", String(createdAt + blossomAuthorizationTtlSeconds)]
      ],
      content: "Authorize upload"
    },
    signingOptions
  );

  return `Nostr ${encodeBase64Url(JSON.stringify(signedEvent))}`;
}

async function signEvent(
  event: NostrEventTemplate,
  signingOptions?: MediaSigningOptions
): Promise<NostrSignedEvent> {
  if (signingOptions?.privateKeyHex) {
    return signEventWithPrivateKey(event, signingOptions.privateKeyHex, signingOptions.publicKeyHex);
  }

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

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  if (typeof data === "string") {
    try {
      return new URL(data).toString();
    } catch {
      return null;
    }
  }

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
  return resolveBlossomURL(`${sha256}${suffix}`).toString();
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

function resolveBlossomURL(path: string) {
  const normalizedPath = path.replace(/^\/+/, "");
  const normalizedBaseUrl = blossomBaseUrl.trim();

  if (!normalizedBaseUrl) {
    return new URL(`/${normalizedPath}`, window.location.origin);
  }

  const baseWithTrailingSlash = normalizedBaseUrl.endsWith("/") ? normalizedBaseUrl : `${normalizedBaseUrl}/`;
  return new URL(normalizedPath, baseWithTrailingSlash);
}
