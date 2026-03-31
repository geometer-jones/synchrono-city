import { ApiError, formatApiErrorMessage, resolveApiAuthURL, resolveApiURL } from "./api";

const kindHTTPAuth = 27235;
const hexPubkeyPattern = /^[a-f0-9]{64}$/i;
const validStandings = ["guest", "member", "trusted", "moderator", "owner", "suspended", "banned"] as const;
const validPolicyTypes = ["block", "allow_publish", "allow_media", "guest"] as const;
const validProofTypes = ["oauth", "social"] as const;
const validGateCapabilities = ["relay.publish", "media.join", "media.publish"] as const;

export type StandingValue = (typeof validStandings)[number];
export type PolicyTypeValue = (typeof validPolicyTypes)[number];
export type StandingRole = StandingValue;
export type ProofTypeValue = (typeof validProofTypes)[number];
export type GateCapabilityValue = (typeof validGateCapabilities)[number];

export type RoomPerms = {
  canJoin: boolean;
  canPublish: boolean;
  canSubscribe: boolean;
};

export type AdminAccessDecision = {
  decision: string;
  reason: string;
  standing: string;
  scope: string;
  auth_mode: string;
};

export type PolicyAssignment = {
  id?: number;
  subject_pubkey: string;
  policy_type: string;
  scope: string;
  granted_by_pubkey: string;
  revoked: boolean;
  metadata?: Record<string, string>;
  created_at?: string;
};

export type StandingRecord = {
  id?: number;
  subject_pubkey: string;
  standing: string;
  scope: string;
  granted_by_pubkey: string;
  revoked: boolean;
  created_at?: string;
};

export type RoomPermission = {
  id?: number;
  subject_pubkey: string;
  room_id: string;
  can_join: boolean;
  can_publish: boolean;
  can_subscribe: boolean;
  granted_by_pubkey: string;
  revoked: boolean;
  created_at?: string;
  live_sync_applied?: boolean;
  live_sync_warning?: string;
};

export type AuditEntry = {
  id?: number;
  actor_pubkey: string;
  action: string;
  target_pubkey: string;
  scope: string;
  metadata?: Record<string, string>;
  created_at?: string;
};

export type ProofVerification = {
  id?: number;
  subject_pubkey: string;
  proof_type: ProofTypeValue;
  proof_value: string;
  granted_by_pubkey: string;
  revoked: boolean;
  metadata?: Record<string, string>;
  created_at?: string;
};

export type GatePolicy = {
  id?: number;
  capability: GateCapabilityValue;
  scope: string;
  require_guest: boolean;
  proof_types: ProofTypeValue[];
  granted_by_pubkey: string;
  revoked: boolean;
  metadata?: Record<string, string>;
  created_at?: string;
};

export type EditorialPin = {
  id?: number;
  geohash: string;
  note_id: string;
  label: string;
  granted_by_pubkey: string;
  revoked: boolean;
  metadata?: Record<string, string>;
  created_at?: string;
};

export type Paginated<T> = {
  entries: T[];
  next_cursor?: string;
};

type PolicyAssignmentFilters = {
  subjectPubkey?: string;
  policyType?: PolicyTypeValue;
  scope?: string;
  includeRevoked?: boolean;
  limit?: number;
};

type StandingRecordFilters = {
  subjectPubkey?: string;
  scope?: string;
  includeRevoked?: boolean;
  limit?: number;
};

type RoomPermissionFilters = {
  subjectPubkey?: string;
  roomID?: string;
  includeRevoked?: boolean;
  limit?: number;
};

type ProofVerificationFilters = {
  subjectPubkey?: string;
  proofType?: ProofTypeValue;
  includeRevoked?: boolean;
  limit?: number;
};

type GatePolicyFilters = {
  capability?: GateCapabilityValue;
  scope?: string;
  includeRevoked?: boolean;
  limit?: number;
};

type EditorialPinFilters = {
  geohash?: string;
  noteID?: string;
  includeRevoked?: boolean;
  limit?: number;
};

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export async function connectAdminSigner(): Promise<{
  pubkey: string;
  access: AdminAccessDecision;
}> {
  const pubkey = await getPublicKey();
  const access = await checkAdminAccess();
  return { pubkey, access };
}

export async function checkAdminAccess(): Promise<AdminAccessDecision> {
  return adminFetch<AdminAccessDecision>("/api/v1/admin/policy/check", {
    method: "POST"
  });
}

export async function fetchPolicyAssignments(filters: PolicyAssignmentFilters = {}): Promise<PolicyAssignment[]> {
  const response = await adminFetch<{ entries: PolicyAssignment[] }>(
    buildAdminPath("/api/v1/admin/policies", {
      subject_pubkey: filters.subjectPubkey ? validatePubkey(filters.subjectPubkey) : undefined,
      policy_type: filters.policyType ? validatePolicyType(filters.policyType) : undefined,
      scope: filters.scope?.trim() || undefined,
      include_revoked: filters.includeRevoked ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined
    }),
    { method: "GET" }
  );
  return response.entries;
}

export async function fetchGuestList(limit = 20): Promise<PolicyAssignment[]> {
  return fetchPolicyAssignments({ policyType: "guest", limit });
}

export async function addToGuestList(pubkey: string, scope = "relay"): Promise<PolicyAssignment> {
  return createPolicyAssignment({
    subjectPubkey: pubkey,
    policyType: "guest",
    scope,
    revoked: false
  });
}

export async function removeFromGuestList(pubkey: string, scope = "relay"): Promise<PolicyAssignment> {
  return createPolicyAssignment({
    subjectPubkey: pubkey,
    policyType: "guest",
    scope,
    revoked: true
  });
}

export async function fetchBlocklist(limit = 20): Promise<PolicyAssignment[]> {
  return fetchPolicyAssignments({ policyType: "block", limit });
}

export async function blockPubkey(pubkey: string, reason?: string, scope = "relay"): Promise<PolicyAssignment> {
  return createPolicyAssignment({
    subjectPubkey: pubkey,
    policyType: "block",
    scope,
    revoked: false,
    metadata: reason?.trim() ? { reason } : undefined
  });
}

export async function unblockPubkey(pubkey: string, scope = "relay"): Promise<PolicyAssignment> {
  return createPolicyAssignment({
    subjectPubkey: pubkey,
    policyType: "block",
    scope,
    revoked: true
  });
}

export async function createPolicyAssignment(input: {
  subjectPubkey: string;
  policyType: PolicyTypeValue;
  scope: string;
  revoked: boolean;
  metadata?: Record<string, string>;
}): Promise<PolicyAssignment> {
  const metadata = input.metadata
    ? {
        ...input.metadata,
        ...(input.metadata.reason ? { reason: validateReason(input.metadata.reason) } : {})
      }
    : undefined;

  return adminFetch<PolicyAssignment>("/api/v1/admin/policies", {
    method: "POST",
    body: {
      subject_pubkey: validatePubkey(input.subjectPubkey),
      policy_type: validatePolicyType(input.policyType),
      scope: input.scope.trim(),
      revoked: input.revoked,
      metadata
    }
  });
}

export async function fetchStandingRecords(filters: StandingRecordFilters = {}): Promise<StandingRecord[]> {
  const response = await adminFetch<{ entries: StandingRecord[] }>(
    buildAdminPath("/api/v1/admin/standing", {
      subject_pubkey: filters.subjectPubkey ? validatePubkey(filters.subjectPubkey) : undefined,
      scope: filters.scope?.trim() || undefined,
      include_revoked: filters.includeRevoked ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined
    }),
    { method: "GET" }
  );
  return response.entries;
}

export async function fetchStanding(pubkey?: string, limit = 20): Promise<StandingRecord[]> {
  return fetchStandingRecords({ subjectPubkey: pubkey, limit });
}

export async function assignStanding(pubkey: string, standing: StandingRole, scope = "relay"): Promise<StandingRecord> {
  return createStandingRecord({
    subjectPubkey: pubkey,
    standing,
    scope,
    revoked: false
  });
}

export async function revokeStanding(pubkey: string, standing: StandingRole, scope = "relay"): Promise<StandingRecord> {
  return createStandingRecord({
    subjectPubkey: pubkey,
    standing,
    scope,
    revoked: true
  });
}

export async function createStandingRecord(input: {
  subjectPubkey: string;
  standing: StandingValue;
  scope: string;
  revoked: boolean;
}): Promise<StandingRecord> {
  return adminFetch<StandingRecord>("/api/v1/admin/standing", {
    method: "POST",
    body: {
      subject_pubkey: validatePubkey(input.subjectPubkey),
      standing: validateStanding(input.standing),
      scope: input.scope.trim(),
      revoked: input.revoked
    }
  });
}

export async function fetchRoomPermissions(filters: RoomPermissionFilters = {}): Promise<RoomPermission[]> {
  const response = await adminFetch<{ entries: RoomPermission[] }>(
    buildAdminPath("/api/v1/admin/room-permissions", {
      subject_pubkey: filters.subjectPubkey ? validatePubkey(filters.subjectPubkey) : undefined,
      room_id: filters.roomID ? validateRoomID(filters.roomID) : undefined,
      include_revoked: filters.includeRevoked ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined
    }),
    { method: "GET" }
  );
  return response.entries;
}

export async function grantRoomPermission(pubkey: string, roomID: string, perms: RoomPerms): Promise<RoomPermission> {
  return createRoomPermission({
    subjectPubkey: pubkey,
    roomID,
    canJoin: perms.canJoin,
    canPublish: perms.canPublish,
    canSubscribe: perms.canSubscribe,
    revoked: false
  });
}

export async function revokeRoomPermission(pubkey: string, roomID: string): Promise<RoomPermission> {
  return createRoomPermission({
    subjectPubkey: pubkey,
    roomID,
    canJoin: true,
    canPublish: false,
    canSubscribe: true,
    revoked: true
  });
}

export async function createRoomPermission(input: {
  subjectPubkey: string;
  roomID: string;
  canJoin: boolean;
  canPublish: boolean;
  canSubscribe: boolean;
  revoked: boolean;
}): Promise<RoomPermission> {
  return adminFetch<RoomPermission>("/api/v1/admin/room-permissions", {
    method: "POST",
    body: {
      subject_pubkey: validatePubkey(input.subjectPubkey),
      room_id: validateRoomID(input.roomID),
      can_join: input.canJoin,
      can_publish: input.canPublish,
      can_subscribe: input.canSubscribe,
      revoked: input.revoked
    }
  });
}

export async function fetchProofVerifications(filters: ProofVerificationFilters = {}): Promise<ProofVerification[]> {
  const response = await adminFetch<{ entries: ProofVerification[] }>(
    buildAdminPath("/api/v1/admin/proofs", {
      subject_pubkey: filters.subjectPubkey ? validatePubkey(filters.subjectPubkey) : undefined,
      proof_type: filters.proofType ? validateProofType(filters.proofType) : undefined,
      include_revoked: filters.includeRevoked ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined
    }),
    { method: "GET" }
  );
  return response.entries;
}

export async function verifyProof(
  pubkey: string,
  proofType: ProofTypeValue,
  proofValue: string,
  metadata?: Record<string, string>
): Promise<ProofVerification> {
  return createProofVerification({
    subjectPubkey: pubkey,
    proofType,
    proofValue,
    revoked: false,
    metadata
  });
}

export async function revokeProof(
  pubkey: string,
  proofType: ProofTypeValue,
  proofValue: string,
  metadata?: Record<string, string>
): Promise<ProofVerification> {
  return createProofVerification({
    subjectPubkey: pubkey,
    proofType,
    proofValue,
    revoked: true,
    metadata
  });
}

export async function createProofVerification(input: {
  subjectPubkey: string;
  proofType: ProofTypeValue;
  proofValue: string;
  revoked: boolean;
  metadata?: Record<string, string>;
}): Promise<ProofVerification> {
  return adminFetch<ProofVerification>("/api/v1/admin/proofs", {
    method: "POST",
    body: {
      subject_pubkey: validatePubkey(input.subjectPubkey),
      proof_type: validateProofType(input.proofType),
      proof_value: validateProofValue(input.proofValue),
      revoked: input.revoked,
      metadata: input.metadata
    }
  });
}

export async function fetchGatePolicies(filters: GatePolicyFilters = {}): Promise<GatePolicy[]> {
  const response = await adminFetch<{ entries: GatePolicy[] }>(
    buildAdminPath("/api/v1/admin/gates", {
      capability: filters.capability ? validateCapability(filters.capability) : undefined,
      scope: filters.scope?.trim() || undefined,
      include_revoked: filters.includeRevoked ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined
    }),
    { method: "GET" }
  );
  return response.entries;
}

export async function saveGatePolicy(input: {
  capability: GateCapabilityValue;
  scope?: string;
  requireGuest: boolean;
  proofTypes: ProofTypeValue[];
  revoked?: boolean;
  metadata?: Record<string, string>;
}): Promise<GatePolicy> {
  return adminFetch<GatePolicy>("/api/v1/admin/gates", {
    method: "POST",
    body: {
      capability: validateCapability(input.capability),
      scope: input.scope?.trim() ?? "relay",
      require_guest: input.requireGuest,
      proof_types: input.proofTypes.map((proofType) => validateProofType(proofType)),
      revoked: input.revoked ?? false,
      metadata: input.metadata
    }
  });
}

export async function fetchEditorialPins(filters: EditorialPinFilters = {}): Promise<EditorialPin[]> {
  const response = await adminFetch<{ entries: EditorialPin[] }>(
    buildAdminPath("/api/v1/admin/editorial/pins", {
      geohash: filters.geohash ? validateGeohash(filters.geohash) : undefined,
      note_id: filters.noteID ? validateNoteID(filters.noteID) : undefined,
      include_revoked: filters.includeRevoked ? "true" : undefined,
      limit: filters.limit ? String(filters.limit) : undefined
    }),
    { method: "GET" }
  );
  return response.entries;
}

export async function pinEditorialNote(
  geohash: string,
  noteID: string,
  label = "featured",
  metadata?: Record<string, string>
): Promise<EditorialPin> {
  return createEditorialPin({
    geohash,
    noteID,
    label,
    revoked: false,
    metadata
  });
}

export async function unpinEditorialNote(
  geohash: string,
  noteID: string,
  label = "featured",
  metadata?: Record<string, string>
): Promise<EditorialPin> {
  return createEditorialPin({
    geohash,
    noteID,
    label,
    revoked: true,
    metadata
  });
}

export async function createEditorialPin(input: {
  geohash: string;
  noteID: string;
  label: string;
  revoked: boolean;
  metadata?: Record<string, string>;
}): Promise<EditorialPin> {
  return adminFetch<EditorialPin>("/api/v1/admin/editorial/pins", {
    method: "POST",
    body: {
      geohash: validateGeohash(input.geohash),
      note_id: validateNoteID(input.noteID),
      label: validateLabel(input.label),
      revoked: input.revoked,
      metadata: input.metadata
    }
  });
}

export async function fetchAuditLog(cursor?: string, limit = 20): Promise<Paginated<AuditEntry>> {
  return adminFetch<Paginated<AuditEntry>>(
    buildAdminPath("/api/v1/admin/audit", {
      cursor: cursor || undefined,
      limit: String(limit)
    }),
    { method: "GET" }
  );
}

export function validatePubkey(pubkey: string): string {
  const normalized = pubkey.trim();
  if (!normalized) {
    throw new AdminAuthError("Pubkey is required.");
  }
  if (!normalized.startsWith("npub1") && !hexPubkeyPattern.test(normalized)) {
    throw new AdminAuthError("Pubkey must be a valid npub or 64-char hex key.");
  }
  return normalized;
}

export function validateStanding(standing: string): StandingValue {
  const normalized = standing.trim().toLowerCase();
  if (!validStandings.includes(normalized as StandingValue)) {
    throw new AdminAuthError("Standing must be one of the supported relay roles.");
  }
  return normalized as StandingValue;
}

export function validatePolicyType(policyType: string): PolicyTypeValue {
  const normalized = policyType.trim().toLowerCase();
  if (!validPolicyTypes.includes(normalized as PolicyTypeValue)) {
    throw new AdminAuthError("Policy type must be one of the supported policy values.");
  }
  return normalized as PolicyTypeValue;
}

export function validateRoomID(roomID: string): string {
  const normalized = roomID.trim();
  if (!normalized) {
    throw new AdminAuthError("Room ID is required.");
  }
  return normalized;
}

export function validateReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length > 500) {
    throw new AdminAuthError("Reason must be 500 characters or fewer.");
  }
  return normalized;
}

export function validateProofType(proofType: string): ProofTypeValue {
  const normalized = proofType.trim().toLowerCase();
  if (!validProofTypes.includes(normalized as ProofTypeValue)) {
    throw new AdminAuthError("Proof type must be oauth or social.");
  }
  return normalized as ProofTypeValue;
}

export function validateCapability(capability: string): GateCapabilityValue {
  const normalized = capability.trim();
  if (!validGateCapabilities.includes(normalized as GateCapabilityValue)) {
    throw new AdminAuthError("Capability must be one of the supported gate targets.");
  }
  return normalized as GateCapabilityValue;
}

export function validateProofValue(proofValue: string): string {
  const normalized = proofValue.trim();
  if (!normalized) {
    throw new AdminAuthError("Proof value is required.");
  }
  return normalized;
}

export function validateGeohash(geohash: string): string {
  const normalized = geohash.trim().toLowerCase();
  if (!normalized) {
    throw new AdminAuthError("Geohash is required.");
  }
  return normalized;
}

export function validateNoteID(noteID: string): string {
  const normalized = noteID.trim();
  if (!normalized) {
    throw new AdminAuthError("Note ID is required.");
  }
  return normalized;
}

export function validateLabel(label: string): string {
  const normalized = label.trim();
  return normalized || "featured";
}

export { validGateCapabilities, validPolicyTypes, validProofTypes, validStandings };

async function adminFetch<T>(
  path: string,
  init: {
    method: "GET" | "POST";
    body?: unknown;
  }
): Promise<T> {
  const url = resolveApiURL(path);
  const authorizationURL = resolveApiAuthURL(path);
  const bodyText = init.body === undefined ? undefined : JSON.stringify(init.body);
  const authorization = await createAuthorizationHeader(authorizationURL.toString(), init.method, bodyText);

  const headers = new Headers({
    Authorization: authorization
  });
  if (bodyText !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: bodyText
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    throw new ApiError(formatApiErrorMessage(data, response.status), response.status, data);
  }

  return data as T;
}

function buildAdminPath(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

async function createAuthorizationHeader(url: string, method: string, bodyText?: string): Promise<string> {
  const signedEvent = await signEvent(
    {
      kind: kindHTTPAuth,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["u", url],
        ["method", method]
      ],
      content: ""
    },
    bodyText
  );

  return `Nostr ${encodeBase64(JSON.stringify(signedEvent))}`;
}

async function signEvent(event: NostrEventTemplate, bodyText?: string): Promise<NostrSignedEvent> {
  const nostr = window.nostr;
  if (!nostr) {
    throw new AdminAuthError("A Nostr browser extension is required for admin requests.");
  }

  const nextEvent: NostrEventTemplate = {
    ...event,
    tags: [...event.tags]
  };
  if (bodyText && bodyText.length > 0) {
    nextEvent.tags.push(["payload", await sha256Hex(bodyText)]);
  }

  return nostr.signEvent(nextEvent);
}

async function getPublicKey(): Promise<string> {
  const nostr = window.nostr;
  if (!nostr) {
    throw new AdminAuthError("A Nostr browser extension is required for admin requests.");
  }
  return nostr.getPublicKey();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64(value: string): string {
  return btoa(value);
}
