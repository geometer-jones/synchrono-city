import { ApiError, formatApiErrorMessage, resolveApiAuthURL, resolveApiURL } from "./api";
import { signEventWithPrivateKey } from "./nostr";
import type { MediaSigningOptions } from "./media-client";

const kindHTTPAuth = 27235;

export type SelfProofVerification = {
  subject_pubkey: string;
  proof_type: "oauth" | "social";
  proof_value: string;
  granted_by_pubkey: string;
  revoked: boolean;
  metadata?: Record<string, string>;
  created_at?: string;
};

export async function fetchOwnProofVerifications(
  signingOptions?: MediaSigningOptions,
  proofType?: "oauth" | "social"
): Promise<SelfProofVerification[]> {
  const path = proofType ? `/api/v1/me/proofs?proof_type=${encodeURIComponent(proofType)}` : "/api/v1/me/proofs";
  const url = resolveApiURL(path);
  const authURL = resolveApiAuthURL(path);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: await createAuthorizationHeader(authURL.toString(), "GET", undefined, signingOptions)
    }
  });

  const text = await response.text();
  const data = parseResponseBody(text);
  if (!response.ok) {
    throw new ApiError(formatApiErrorMessage(data, response.status), response.status, data);
  }

  const payload = data as { entries?: SelfProofVerification[] } | null;
  return Array.isArray(payload?.entries) ? payload.entries : [];
}

export async function startOAuthVerification(
  returnTo: string,
  signingOptions?: MediaSigningOptions
): Promise<{ authorization_url: string; proof_type: "oauth"; subject_pubkey: string }> {
  const path = "/api/v1/oauth/start";
  const url = resolveApiURL(path);
  const authURL = resolveApiAuthURL(path);
  const bodyText = JSON.stringify({ return_to: returnTo });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: await createAuthorizationHeader(authURL.toString(), "POST", bodyText, signingOptions)
    },
    body: bodyText
  });

  const text = await response.text();
  const data = parseResponseBody(text);
  if (!response.ok) {
    throw new ApiError(formatApiErrorMessage(data, response.status), response.status, data);
  }

  return data as { authorization_url: string; proof_type: "oauth"; subject_pubkey: string };
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

async function createAuthorizationHeader(
  url: string,
  method: string,
  payload?: string,
  signingOptions?: MediaSigningOptions
): Promise<string> {
  const tags = [
    ["u", url],
    ["method", method]
  ];

  if (payload) {
    tags.push(["payload", await sha256Hex(payload)]);
  }

  const event: NostrEventTemplate = {
    kind: kindHTTPAuth,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ""
  };

  const signedEvent = await signEvent(event, signingOptions);
  return `Nostr ${btoa(JSON.stringify(signedEvent))}`;
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
    throw new Error("A Nostr signer is required for proof requests.");
  }

  return nostr.signEvent(event);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
