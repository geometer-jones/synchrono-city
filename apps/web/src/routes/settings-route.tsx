import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import {
  AdminAuthError,
  addToGuestList,
  assignStanding,
  blockPubkey,
  connectAdminSigner,
  fetchEditorialPins,
  fetchGatePolicies,
  fetchAuditLog,
  fetchBlocklist,
  fetchGuestList,
  fetchProofVerifications,
  fetchRoomPermissions,
  fetchStanding,
  grantRoomPermission,
  pinEditorialNote,
  revokeProof,
  removeFromGuestList,
  saveGatePolicy,
  unblockPubkey,
  unpinEditorialNote,
  revokeRoomPermission,
  revokeStanding,
  verifyProof,
  type AdminAccessDecision,
  type AuditEntry,
  type EditorialPin,
  type GateCapabilityValue,
  type GatePolicy,
  type Paginated,
  type PolicyAssignment,
  type ProofTypeValue,
  type ProofVerification,
  type RoomPermission,
  type StandingRecord,
  type StandingValue,
  validGateCapabilities,
  validProofTypes,
  validStandings
} from "../admin-client";
import { useAppearance, type AppearanceMode } from "../appearance";
import { ApiError, apiFetch } from "../api";
import { useAppState } from "../app-state";
import { ResizablePanels } from "../components/resizable-panels";
import { useNarrowViewport } from "../hooks/use-viewport";
import {
  addKeyToKeyring,
  clearStoredLocalKeyring,
  createEmptyLocalKeyring,
  generateLocalKeyMaterial,
  getActiveLocalKey,
  importLocalKeyMaterial,
  loadStoredLocalKeyring,
  removeKeyFromKeyring,
  setKeyVerification,
  setActiveKeyInKeyring,
  storeLocalKeyring,
  type LocalKeyring
} from "../key-manager";
import { uploadBlossomFile } from "../media-client";
import { publishSignedEvent, signEventWithPrivateKey, type ProfileMetadataContent } from "../nostr";
import { fetchOwnProofVerifications, startOAuthVerification } from "../proof-client";
import { describeRelayConnectionIssue } from "../relay-url-diagnostics";
import { showToast } from "../toast";

type RelayHealth = {
  status: string;
  relay_name: string;
  relay_url: string;
  operator_pubkey: string;
  timestamp: string;
};

type AdminSession = {
  pubkey: string;
  access: AdminAccessDecision;
};

type MetadataDraft = {
  name: string;
  picture: string;
  about: string;
};

const defaultStanding = "member";
const defaultProofType = "oauth";
const defaultGateCapability = "relay.publish";
const appearanceOptions: { value: AppearanceMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" }
];
const showOAuthVerificationSection = false;

export function SettingsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { appearanceMode, resolvedAppearanceMode, setAppearanceMode } = useAppearance();
  const {
    currentUser,
    profiles,
    relayList,
    relayOperatorPubkey,
    relayURL,
    addRelayListEntry,
    updateRelayListEntryFlags,
    removeRelayListEntry,
    refreshSocialBootstrap,
    setLocalCurrentUserPubkey,
    setProfileMetadata
  } = useAppState();
  const [health, setHealth] = useState<RelayHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [lastMutation, setLastMutation] = useState<string | null>(null);
  const [localKeyring, setLocalKeyring] = useState<LocalKeyring>(() => loadStoredLocalKeyring());
  const [importKeysOpen, setImportKeysOpen] = useState(false);
  const [keyImportValue, setKeyImportValue] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isRefreshingSelectedKeyProofs, setIsRefreshingSelectedKeyProofs] = useState(false);
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [isOAuthHelpOpen, setIsOAuthHelpOpen] = useState(false);
  const [metadataDrafts, setMetadataDrafts] = useState<Record<string, MetadataDraft>>({});
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});
  const [metadataSaving, setMetadataSaving] = useState<Record<string, boolean>>({});
  const [pictureUploading, setPictureUploading] = useState<Record<string, boolean>>({});
  const [selectedKeyPubkey, setSelectedKeyPubkey] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("key") ?? loadStoredLocalKeyring().activePublicKeyNpub
  );

  const [guestEntries, setGuestEntries] = useState<PolicyAssignment[]>([]);
  const [blockEntries, setBlockEntries] = useState<PolicyAssignment[]>([]);
  const [standingEntries, setStandingEntries] = useState<StandingRecord[]>([]);
  const [roomEntries, setRoomEntries] = useState<RoomPermission[]>([]);
  const [proofEntries, setProofEntries] = useState<ProofVerification[]>([]);
  const [gateEntries, setGateEntries] = useState<GatePolicy[]>([]);
  const [pinEntries, setPinEntries] = useState<EditorialPin[]>([]);
  const [auditPage, setAuditPage] = useState<Paginated<AuditEntry>>({ entries: [] });

  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingGuest, setIsSavingGuest] = useState(false);
  const [isSavingBlock, setIsSavingBlock] = useState(false);
  const [isSavingStanding, setIsSavingStanding] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isSavingProof, setIsSavingProof] = useState(false);
  const [isSavingGate, setIsSavingGate] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isLoadingAuditMore, setIsLoadingAuditMore] = useState(false);

  const [guestPubkey, setGuestPubkey] = useState("");
  const [blockPubkeyValue, setBlockPubkeyValue] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const [standingPubkey, setStandingPubkey] = useState("");
  const [standingValue, setStandingValue] = useState<StandingValue>(defaultStanding);
  const [standingScope, setStandingScope] = useState("relay");
  const [standingLookupPubkey, setStandingLookupPubkey] = useState("");

  const [roomPubkey, setRoomPubkey] = useState("");
  const [roomID, setRoomID] = useState("");
  const [roomCanJoin, setRoomCanJoin] = useState(true);
  const [roomCanPublish, setRoomCanPublish] = useState(false);
  const [roomCanSubscribe, setRoomCanSubscribe] = useState(true);
  const [roomLookupID, setRoomLookupID] = useState("");
  const [proofPubkey, setProofPubkey] = useState("");
  const [proofType, setProofType] = useState<ProofTypeValue>(defaultProofType);
  const [proofValue, setProofValue] = useState("");
  const [gateCapability, setGateCapability] = useState<GateCapabilityValue>(defaultGateCapability);
  const [gateScope, setGateScope] = useState("relay");
  const [gateRequireGuest, setGateRequireGuest] = useState(false);
  const [gateRequireOAuth, setGateRequireOAuth] = useState(false);
  const [gateRequireSocial, setGateRequireSocial] = useState(false);
  const [pinGeohash, setPinGeohash] = useState("");
  const [pinNoteID, setPinNoteID] = useState("");
  const [pinLabel, setPinLabel] = useState("featured");
  const [relayDraftName, setRelayDraftName] = useState("");
  const [relayDraftURL, setRelayDraftURL] = useState("");
  const [relayListError, setRelayListError] = useState<string | null>(null);
  const [relayRemovalTarget, setRelayRemovalTarget] = useState<{ url: string; label: string } | null>(null);
  const isNarrowKeysLayout = useNarrowViewport(900);
  const oauthHelpId = useId();

  const refreshGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    void apiFetch<RelayHealth>("/healthz")
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setHealth(payload);
        setHealthError(null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setHealthError("Health check unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const canAdmin = adminSession?.access.decision === "allow";
  const activeLocalKey = getActiveLocalKey(localKeyring);
  const configuredOperatorPubkey =
    health?.operator_pubkey != null ? health.operator_pubkey.trim() : relayOperatorPubkey.trim();
  const hasConfiguredOperatorPubkey = configuredOperatorPubkey.length > 0;
  const hasOperatorPubkey =
    hasConfiguredOperatorPubkey &&
    (currentUser.pubkey === configuredOperatorPubkey || adminSession?.pubkey === configuredOperatorPubkey);
  const relayConnectionIssue = describeRelayConnectionIssue(health?.relay_url ?? relayURL, window.location.href);

  useDialogEscape(Boolean(relayRemovalTarget), () => setRelayRemovalTarget(null));

  useEffect(() => {
    setMetadataDrafts((current) => {
      const nextDrafts: Record<string, MetadataDraft> = {};

      for (const key of localKeyring.keys) {
        const existingDraft = current[key.publicKeyNpub];
        const profile = profiles.find((entry) => entry.pubkey === key.publicKeyNpub);
        const profileDraft = {
          name: profile?.name ?? profile?.displayName ?? "",
          picture: profile?.picture ?? "",
          about: profile?.bio ?? ""
        };

        nextDrafts[key.publicKeyNpub] =
          shouldHydrateMetadataDraft(existingDraft) ? profileDraft : existingDraft;
      }

      return nextDrafts;
    });
  }, [localKeyring.keys, profiles]);

  useEffect(() => {
    if (localKeyring.keys.length === 0) {
      setSelectedKeyPubkey(null);
      return;
    }

    if (selectedKeyPubkey && localKeyring.keys.some((key) => key.publicKeyNpub === selectedKeyPubkey)) {
      return;
    }

    setSelectedKeyPubkey(activeLocalKey?.publicKeyNpub ?? localKeyring.keys[0]?.publicKeyNpub ?? null);
  }, [activeLocalKey?.publicKeyNpub, localKeyring.keys, selectedKeyPubkey]);

  useEffect(() => {
    const requestedKey = searchParams.get("key");
    if (!requestedKey) {
      return;
    }

    if (localKeyring.keys.some((key) => key.publicKeyNpub === requestedKey)) {
      setSelectedKeyPubkey(requestedKey);
    }
  }, [localKeyring.keys, searchParams]);

  useEffect(() => {
    setVerificationError(null);
  }, [selectedKeyPubkey]);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth_status");
    if (!oauthStatus) {
      return;
    }

    if (oauthStatus === "success") {
      showToast("OAuth verification recorded for this key.", "info");
    } else {
      showToast(searchParams.get("oauth_error") || "OAuth verification failed.", "error");
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("oauth_status");
    nextParams.delete("oauth_error");
    nextParams.delete("oauth_proof");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  function updateMetadataDraft(publicKeyNpub: string, patch: Partial<MetadataDraft>) {
    setMetadataDrafts((current) => ({
      ...current,
      [publicKeyNpub]: {
        ...getMetadataDraft(current, publicKeyNpub),
        ...patch
      }
    }));
    setMetadataErrors((current) => {
      const next = { ...current };
      delete next[publicKeyNpub];
      return next;
    });
  }

  async function handleConnectSigner() {
    setIsConnecting(true);
    setAdminError(null);

    try {
      const session = await connectAdminSigner();
      setAdminSession(session);
      setLastMutation(`Admin signer verified for ${session.pubkey}.`);
      showToast("Admin signer verified.", "info");
      if (session.access.decision === "allow") {
        await refreshGovernanceData();
      }
    } catch (error) {
      setAdminSession(null);
      setAdminError(formatAdminError(error));
      setLastMutation(null);
    } finally {
      setIsConnecting(false);
    }
  }

  function commitLocalKeyring(nextKeyring: LocalKeyring) {
    const normalizedKeyring =
      nextKeyring.keys.length > 0 ? nextKeyring : createEmptyLocalKeyring();

    setLocalKeyring(normalizedKeyring);
    if (normalizedKeyring.keys.length === 0) {
      clearStoredLocalKeyring();
      setLocalCurrentUserPubkey(null);
      return;
    }

    storeLocalKeyring(normalizedKeyring);
    setLocalCurrentUserPubkey(normalizedKeyring.activePublicKeyNpub);
  }

  function persistLocalKeyVerification(publicKeyNpub: string, verification: NonNullable<LocalKeyring["keys"][number]["verifications"]>["oauth"]) {
    setLocalKeyring((current) => {
      const nextKeyring = setKeyVerification(current, publicKeyNpub, "oauth", verification ?? null);
      storeLocalKeyring(nextKeyring);
      return nextKeyring;
    });
  }

  async function refreshSelectedKeyOAuthStatus(key: LocalKeyring["keys"][number], options?: { silent?: boolean }) {
    if (!key.privateKeyHex) {
      return;
    }

    setIsRefreshingSelectedKeyProofs(true);
    setVerificationError(null);
    try {
      const proofs = await fetchOwnProofVerifications(
        {
          privateKeyHex: key.privateKeyHex,
          publicKeyHex: key.publicKeyHex
        },
        "oauth"
      );

      const latestActiveProof = proofs.find((entry) => entry.proof_type === "oauth" && !entry.revoked);
      persistLocalKeyVerification(
        key.publicKeyNpub,
        latestActiveProof
          ? {
              status: "verified",
              proofValue: latestActiveProof.proof_value,
              checkedAt: new Date().toISOString(),
              verifiedAt: latestActiveProof.created_at,
              metadata: latestActiveProof.metadata
            }
          : {
              status: "missing",
              checkedAt: new Date().toISOString()
            }
      );
    } catch (error) {
      if (!options?.silent) {
        setVerificationError(error instanceof Error ? error.message : "Could not refresh OAuth verification.");
      }
    } finally {
      setIsRefreshingSelectedKeyProofs(false);
    }
  }

  async function handleStartOAuthAuthentication(key: LocalKeyring["keys"][number]) {
    if (!key.privateKeyHex) {
      setVerificationError("Selected key is not unlocked in this browser.");
      return;
    }

    setIsStartingOAuth(true);
    setVerificationError(null);
    try {
      const result = await startOAuthVerification(`/app/settings?key=${encodeURIComponent(key.publicKeyNpub)}`, {
        privateKeyHex: key.privateKeyHex,
        publicKeyHex: key.publicKeyHex
      });
      window.location.assign(result.authorization_url);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Could not start OAuth verification.");
      setIsStartingOAuth(false);
    }
  }

  function handleGenerateKeys() {
    const result = addKeyToKeyring(localKeyring, generateLocalKeyMaterial());
    commitLocalKeyring(result.keyring);
    setSelectedKeyPubkey(result.activeKey.publicKeyNpub);
    setKeyImportValue("");
    setKeyError(null);
    setVerificationError(null);
    showToast(result.added ? "Local Nostr keypair generated." : "Existing local key activated.", "info");
  }

  function handleImportKeys() {
    try {
      const result = addKeyToKeyring(localKeyring, importLocalKeyMaterial(keyImportValue));
      commitLocalKeyring(result.keyring);
      setSelectedKeyPubkey(result.activeKey.publicKeyNpub);
      setImportKeysOpen(false);
      setKeyImportValue("");
      setKeyError(null);
      setVerificationError(null);
      showToast(result.added ? "Local Nostr keypair imported." : "Imported key already exists. Activated existing key.", "info");
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Key import failed.");
    }
  }

  function handleStartImportKeys() {
    setImportKeysOpen(true);
    setKeyError(null);
  }

  function handleCancelImportKeys() {
    setImportKeysOpen(false);
    setKeyImportValue("");
    setKeyError(null);
  }

  function handleActivateKey(publicKeyNpub: string) {
    setSelectedKeyPubkey(publicKeyNpub);
    commitLocalKeyring(setActiveKeyInKeyring(localKeyring, publicKeyNpub));
    setKeyError(null);
    setVerificationError(null);
    showToast("Local key activated for this session.", "info");
  }

  function handleRemoveKey(publicKeyNpub: string) {
    const key = localKeyring.keys.find((entry) => entry.publicKeyNpub === publicKeyNpub);
    if (!key) {
      return;
    }

    const metadataDraft = getMetadataDraft(metadataDrafts, publicKeyNpub);
    const keyLabel = getLocalKeyDisplayName(metadataDraft, key);
    const confirmed = window.confirm(
      `Remove ${keyLabel} from this browser? This deletes the stored private key and cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    const removingActiveKey = activeLocalKey?.publicKeyNpub === publicKeyNpub;
    commitLocalKeyring(removeKeyFromKeyring(localKeyring, publicKeyNpub));
    setKeyError(null);
    setVerificationError(null);
    showToast(removingActiveKey ? "Active local key removed." : "Local key removed.", "info");
  }

  async function handleCopyKeyValue(label: string, value: string) {
    if (!navigator.clipboard?.writeText) {
      showToast("Clipboard unavailable in this browser.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied.`, "info");
    } catch {
      showToast(`Unable to copy ${label.toLowerCase()}.`, "error");
    }
  }

  async function handleMetadataPictureUpload(key: LocalKeyring["keys"][number], file: File | null) {
    if (!file) {
      return;
    }

    setPictureUploading((current) => ({ ...current, [key.publicKeyNpub]: true }));
    setMetadataErrors((current) => {
      const next = { ...current };
      delete next[key.publicKeyNpub];
      return next;
    });

    try {
      const upload = await uploadBlossomFile(file, undefined, {
        privateKeyHex: key.privateKeyHex,
        publicKeyHex: key.publicKeyHex
      });
      updateMetadataDraft(key.publicKeyNpub, { picture: upload.url });
      showToast(`Uploaded ${file.name} to Blossom.`, "info");
    } catch (error) {
      setMetadataErrors((current) => ({
        ...current,
        [key.publicKeyNpub]: error instanceof Error ? error.message : "Picture upload failed."
      }));
    } finally {
      setPictureUploading((current) => ({ ...current, [key.publicKeyNpub]: false }));
    }
  }

  async function handleMetadataSubmit(event: FormEvent<HTMLFormElement>, key: LocalKeyring["keys"][number]) {
    event.preventDefault();
    setMetadataSaving((current) => ({ ...current, [key.publicKeyNpub]: true }));
    setMetadataErrors((current) => {
      const next = { ...current };
      delete next[key.publicKeyNpub];
      return next;
    });

    try {
      const draft = getMetadataDraft(metadataDrafts, key.publicKeyNpub);
      const metadata = buildProfileMetadataContent(draft);
      const signedEvent = await signEventWithPrivateKey(
        {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify(metadata)
        },
        key.privateKeyHex,
        key.publicKeyHex
      );

      await publishSignedEvent(relayURL, signedEvent);
      setProfileMetadata(key.publicKeyNpub, draft);
      setLastMutation(`Kind 0 metadata published for ${key.publicKeyNpub}.`);
      showToast("Metadata published.", "info");
    } catch (error) {
      setMetadataErrors((current) => ({
        ...current,
        [key.publicKeyNpub]: error instanceof Error ? error.message : "Metadata publish failed."
      }));
    } finally {
      setMetadataSaving((current) => ({ ...current, [key.publicKeyNpub]: false }));
    }
  }

  async function refreshGovernanceData() {
    const generation = ++refreshGenerationRef.current;
    setIsRefreshing(true);
    try {
      const [guestList, blocklist, standings, roomPermissions, proofs, gates, pins, audit] = await Promise.all([
        fetchGuestList(),
        fetchBlocklist(),
        fetchStanding(standingLookupPubkey || undefined),
        fetchRoomPermissions({ roomID: roomLookupID || undefined, limit: 20 }),
        fetchProofVerifications({ limit: 20 }),
        fetchGatePolicies({ limit: 20 }),
        fetchEditorialPins({ limit: 20 }),
        fetchAuditLog(undefined, 20)
      ]);

      // Only apply results if this is still the latest refresh
      if (generation !== refreshGenerationRef.current) {
        return;
      }

      setGuestEntries(guestList);
      setBlockEntries(blocklist);
      setStandingEntries(standings);
      setRoomEntries(roomPermissions);
      setProofEntries(proofs);
      setGateEntries(gates);
      setPinEntries(pins);
      setAuditPage(audit);
      setAdminError(null);
    } catch (error) {
      if (generation !== refreshGenerationRef.current) {
        return;
      }
      setAdminError(formatAdminError(error));
    } finally {
      if (generation === refreshGenerationRef.current) {
        setIsRefreshing(false);
      }
    }
  }

  async function loadStandingEntries() {
    try {
      const entries = await fetchStanding(standingLookupPubkey || undefined);
      setStandingEntries(entries);
      setAdminError(null);
    } catch (error) {
      setAdminError(formatAdminError(error));
    }
  }

  async function loadRoomEntries() {
    try {
      const entries = await fetchRoomPermissions({ roomID: roomLookupID || undefined, limit: 20 });
      setRoomEntries(entries);
      setAdminError(null);
    } catch (error) {
      setAdminError(formatAdminError(error));
    }
  }

  async function loadMoreAuditEntries() {
    if (!auditPage.next_cursor) {
      return;
    }

    setIsLoadingAuditMore(true);
    try {
      const nextPage = await fetchAuditLog(auditPage.next_cursor, 20);
      setAuditPage((current) => ({
        entries: [...current.entries, ...nextPage.entries],
        next_cursor: nextPage.next_cursor
      }));
      setAdminError(null);
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsLoadingAuditMore(false);
    }
  }

  async function handleGuestListAction(action: "add" | "remove") {
    setIsSavingGuest(true);
    try {
      const record = action === "add"
        ? await addToGuestList(guestPubkey)
        : await removeFromGuestList(guestPubkey);
      setLastMutation(`${action === "add" ? "Guest allow" : "Guest revoke"} saved for ${record.subject_pubkey}.`);
      showToast(action === "add" ? "Guest added." : "Guest removed.", "info");
      setGuestPubkey("");
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingGuest(false);
    }
  }

  async function handleBlockListAction(action: "block" | "unblock") {
    setIsSavingBlock(true);
    try {
      const record = action === "block"
        ? await blockPubkey(blockPubkeyValue, blockReason)
        : await unblockPubkey(blockPubkeyValue);
      setLastMutation(`${action === "block" ? "Block" : "Unblock"} saved for ${record.subject_pubkey}.`);
      showToast(action === "block" ? "Pubkey blocked." : "Pubkey unblocked.", "info");
      setBlockPubkeyValue("");
      setBlockReason("");
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingBlock(false);
    }
  }

  async function handleStandingSubmit(event: FormEvent<HTMLFormElement>, action: "assign" | "revoke") {
    event.preventDefault();
    setIsSavingStanding(true);

    try {
      const record = action === "assign"
        ? await assignStanding(standingPubkey, standingValue, standingScope)
        : await revokeStanding(standingPubkey, standingValue, standingScope);
      setLastMutation(`Standing ${record.standing} ${record.revoked ? "revoked" : "saved"} for ${record.subject_pubkey}.`);
      showToast(action === "assign" ? "Standing saved." : "Standing revoked.", "info");
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingStanding(false);
    }
  }

  async function handleStandingRevoke() {
    setIsSavingStanding(true);
    try {
      const record = await revokeStanding(standingPubkey, standingValue, standingScope);
      setLastMutation(`Standing ${record.standing} revoked for ${record.subject_pubkey}.`);
      showToast("Standing revoked.", "info");
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingStanding(false);
    }
  }

  async function handleRoomPermissionSubmit(event: FormEvent<HTMLFormElement>, action: "grant" | "revoke") {
    event.preventDefault();
    setIsSavingRoom(true);

    try {
      const record = action === "grant"
        ? await grantRoomPermission(roomPubkey, roomID, {
            canJoin: roomCanJoin,
            canPublish: roomCanPublish,
            canSubscribe: roomCanSubscribe
          })
        : await revokeRoomPermission(roomPubkey, roomID);
      setLastMutation(`Room permission ${record.revoked ? "revoked" : "saved"} for ${record.subject_pubkey} on ${record.room_id}.`);
      showToast(action === "grant" ? "Room permission saved." : "Room permission revoked.", "info");
      if (record.live_sync_warning) {
        showToast(`Live room update failed: ${record.live_sync_warning}`, "error");
      }
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function handleRoomPermissionRevoke() {
    setIsSavingRoom(true);
    try {
      const record = await revokeRoomPermission(roomPubkey, roomID);
      setLastMutation(`Room permission revoked for ${record.subject_pubkey} on ${record.room_id}.`);
      showToast("Room permission revoked.", "info");
      if (record.live_sync_warning) {
        showToast(`Live room update failed: ${record.live_sync_warning}`, "error");
      }
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function handleProofAction(action: "verify" | "revoke") {
    setIsSavingProof(true);
    try {
      const record = action === "verify"
        ? await verifyProof(proofPubkey, proofType, proofValue)
        : await revokeProof(proofPubkey, proofType, proofValue);
      setLastMutation(`Proof ${record.proof_type} ${record.revoked ? "revoked" : "verified"} for ${record.subject_pubkey}.`);
      showToast(action === "verify" ? "Proof verified." : "Proof revoked.", "info");
      setProofPubkey("");
      setProofValue("");
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingProof(false);
    }
  }

  async function handleGatePolicyAction(action: "save" | "revoke") {
    setIsSavingGate(true);
    try {
      const proofTypes: ProofTypeValue[] = [];
      if (gateRequireOAuth) {
        proofTypes.push("oauth");
      }
      if (gateRequireSocial) {
        proofTypes.push("social");
      }

      const record = await saveGatePolicy({
        capability: gateCapability,
        scope: gateScope,
        requireGuest: gateRequireGuest,
        proofTypes,
        revoked: action === "revoke"
      });
      setLastMutation(`Gate policy ${record.revoked ? "revoked" : "saved"} for ${record.capability}.`);
      showToast(action === "save" ? "Gate policy saved." : "Gate policy revoked.", "info");
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingGate(false);
    }
  }

  async function handleEditorialPinAction(action: "pin" | "unpin") {
    setIsSavingPin(true);
    try {
      const record = action === "pin"
        ? await pinEditorialNote(pinGeohash, pinNoteID, pinLabel)
        : await unpinEditorialNote(pinGeohash, pinNoteID, pinLabel);
      setLastMutation(`Editorial pin ${record.revoked ? "revoked" : "saved"} for ${record.geohash} -> ${record.note_id}.`);
      showToast(action === "pin" ? "Editorial pin saved." : "Editorial pin revoked.", "info");
      await refreshGovernanceData();
      await refreshSocialBootstrap();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingPin(false);
    }
  }

  function handleAddRelay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRelayListError(null);

    try {
      const entry = addRelayListEntry({
        name: relayDraftName,
        url: relayDraftURL
      });
      setRelayDraftName("");
      setRelayDraftURL("");
      showToast(`Added relay ${entry.name}.`, "info");
    } catch (error) {
      setRelayListError(error instanceof Error ? error.message : "Relay update failed.");
    }
  }

  function handleRequestRemoveRelay(url: string, label: string) {
    setRelayListError(null);
    setRelayRemovalTarget({ url, label });
  }

  function handleConfirmRemoveRelay() {
    if (!relayRemovalTarget) {
      return;
    }

    setRelayListError(null);

    try {
      removeRelayListEntry(relayRemovalTarget.url);
      showToast(`Removed relay ${relayRemovalTarget.label}.`, "info");
      setRelayRemovalTarget(null);
    } catch (error) {
      setRelayListError(error instanceof Error ? error.message : "Relay update failed.");
    }
  }

  function handleRelayFlagChange(
    relay: { url: string; name: string; inbox: boolean; outbox: boolean },
    flag: "inbox" | "outbox",
    checked: boolean
  ) {
    setRelayListError(null);

    try {
      updateRelayListEntryFlags(relay.url, {
        inbox: flag === "inbox" ? checked : relay.inbox,
        outbox: flag === "outbox" ? checked : relay.outbox
      });
    } catch (error) {
      setRelayListError(error instanceof Error ? error.message : "Relay update failed.");
    }
  }

  const selectedKey =
    localKeyring.keys.find((key) => key.publicKeyNpub === selectedKeyPubkey) ?? activeLocalKey ?? localKeyring.keys[0] ?? null;
  const selectedMetadataDraft = selectedKey ? getMetadataDraft(metadataDrafts, selectedKey.publicKeyNpub) : null;
  const selectedMetadataError = selectedKey ? metadataErrors[selectedKey.publicKeyNpub] : null;
  const isSelectedUploadingPicture = selectedKey ? pictureUploading[selectedKey.publicKeyNpub] === true : false;
  const isSelectedSavingMetadata = selectedKey ? metadataSaving[selectedKey.publicKeyNpub] === true : false;
  const isSelectedKeyActive = selectedKey ? activeLocalKey?.publicKeyNpub === selectedKey.publicKeyNpub : false;
  const selectedOAuthVerification = selectedKey?.verifications?.oauth;

  useEffect(() => {
    if (!showOAuthVerificationSection || !selectedKey?.privateKeyHex) {
      return;
    }

    void refreshSelectedKeyOAuthStatus(selectedKey, { silent: true });
  }, [selectedKey?.privateKeyHex, selectedKey?.publicKeyHex, selectedKey?.publicKeyNpub]);

  const keysListPanel = (
    <div className="admin-form keys-list-panel">
      {!importKeysOpen ? (
        <div className="action-row">
          <button className="primary-button" type="button" onClick={handleGenerateKeys}>
            Generate keys
          </button>
          <button className="secondary-button" type="button" onClick={handleStartImportKeys}>
            Import keys
          </button>
        </div>
      ) : null}
      {importKeysOpen ? (
        <>
          <label className="field-stack">
            <textarea
              className="note-input key-secret-input"
              value={keyImportValue}
              onChange={(event) => setKeyImportValue(event.target.value)}
              aria-label="Import private key"
              placeholder="Paste nsec1... or 64-char hex private key"
            />
          </label>
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={handleImportKeys}>
              Import keys
            </button>
            <button className="secondary-button" type="button" onClick={handleCancelImportKeys}>
              Cancel
            </button>
          </div>
          {keyError ? <p className="field-error">{keyError}</p> : null}
        </>
      ) : null}
      <div className="admin-record-list keys-summary-list">
        {localKeyring.keys.length === 0 ? <p className="muted">No local keypairs stored in this browser.</p> : null}
        {localKeyring.keys.map((key) => {
          const metadataDraft = getMetadataDraft(metadataDrafts, key.publicKeyNpub);
          const isActive = activeLocalKey?.publicKeyNpub === key.publicKeyNpub;
          const isSelected = selectedKey?.publicKeyNpub === key.publicKeyNpub;
          const displayName = getLocalKeyDisplayName(metadataDraft, key);

          return (
            <article
              key={key.id}
              className={`mini-card admin-record key-summary-card${isSelected ? " is-selected" : ""}`}
            >
              <button
                className="key-summary-main key-summary-select"
                type="button"
                onClick={() => setSelectedKeyPubkey(key.publicKeyNpub)}
                aria-pressed={isSelected}
              >
                <KeyAvatar picture={metadataDraft.picture} name={displayName} />
                <div className="key-summary-meta">
                  <strong>{displayName}</strong>
                  <code className="key-summary-pubkey">{truncateMiddle(key.publicKeyHex, 8, 8)}</code>
                </div>
              </button>
              <div className="key-summary-actions">
                {isActive ? (
                  <span className="thread-pill live">Active</span>
                ) : (
                  <button
                    className="secondary-button key-activate-button"
                    type="button"
                    aria-label="Use key"
                    onClick={() => handleActivateKey(key.publicKeyNpub)}
                  >
                    Use
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
  const keysDetailPanel =
    selectedKey && selectedMetadataDraft ? (
      <article className="feature-card admin-form keys-detail-panel">
        <div className="detail-header keys-detail-header">
          <div className="keys-detail-title">
            <KeyAvatar picture={selectedMetadataDraft.picture} name={getLocalKeyDisplayName(selectedMetadataDraft, selectedKey)} />
            <div className="keys-detail-heading">
              <div>
                <p className="section-label">Active key</p>
                <h3>{getLocalKeyDisplayName(selectedMetadataDraft, selectedKey)}</h3>
              </div>
              <button
                className="secondary-button danger-button"
                type="button"
                onClick={() => handleRemoveKey(selectedKey.publicKeyNpub)}
              >
                Remove key
              </button>
            </div>
          </div>
        </div>

        {!isSelectedKeyActive ? (
          <div className="action-row">
            <button
              className="secondary-button key-activate-button"
              type="button"
              onClick={() => handleActivateKey(selectedKey.publicKeyNpub)}
            >
              Use key
            </button>
          </div>
        ) : null}

        {showOAuthVerificationSection ? (
          <>
            <article className="mini-card admin-record">
              <div className="detail-header">
                <div className="detail-heading-with-help">
                  <p className="section-label">Relay verification</p>
                  <div className="detail-heading-row">
                    <h4>OAuth status for call access</h4>
                    <button
                      className="copy-icon-button helper-icon-button"
                      type="button"
                      aria-label={isOAuthHelpOpen ? "Hide OAuth status help" : "Show OAuth status help"}
                      aria-expanded={isOAuthHelpOpen}
                      aria-controls={oauthHelpId}
                      onClick={() => setIsOAuthHelpOpen((current) => !current)}
                    >
                      ?
                    </button>
                  </div>
                </div>
                <span className={`thread-pill${selectedOAuthVerification?.status === "verified" ? " live" : ""}`}>
                  {selectedOAuthVerification?.status === "verified" ? "Verified" : "Missing"}
                </span>
              </div>
              {isOAuthHelpOpen ? (
                <div id={oauthHelpId} className="helper-text-stack">
                  <p className="muted">
                    Pubkey is your primary Nostr identity. OAuth is a relay-local secondary marker so operators can retain
                    a less-fungible abuse and ban handle for call resources if someone violates relay policy.
                  </p>
                  <p className="muted">
                    Removing or regenerating a key is not sufficient on its own because keys are effectively free. This
                    OAuth binding is a convenience tool for relay operators, and they can still fine-tune their gate policy
                    in Concierge.
                  </p>
                </div>
              ) : null}
              <p className={selectedOAuthVerification?.proofValue ? "metadata-readonly-value" : "metadata-readonly-value muted"}>
                {selectedOAuthVerification?.proofValue || "No active OAuth proof recorded for this key."}
              </p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshSelectedKeyOAuthStatus(selectedKey)}
                  disabled={!selectedKey.privateKeyHex || isRefreshingSelectedKeyProofs || isStartingOAuth}
                >
                  {isRefreshingSelectedKeyProofs ? "Refreshing..." : "Refresh OAuth status"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleStartOAuthAuthentication(selectedKey)}
                  disabled={!selectedKey.privateKeyHex || isStartingOAuth || isRefreshingSelectedKeyProofs}
                >
                  {isStartingOAuth
                    ? "Opening OAuth..."
                    : selectedOAuthVerification?.status === "verified"
                      ? "Re-authenticate with OAuth"
                      : "Authenticate with OAuth"}
                </button>
              </div>
              <small>
                Last checked {selectedOAuthVerification?.checkedAt ? formatRelativeTime(selectedOAuthVerification.checkedAt) : "never"}
                {selectedOAuthVerification?.verifiedAt ? ` · verified ${formatRelativeTime(selectedOAuthVerification.verifiedAt)}` : ""}
              </small>
            </article>
            {verificationError ? <p className="field-error">{verificationError}</p> : null}
          </>
        ) : null}

        <table className="keypair-table">
          <tbody>
            <KeypairTableRow
              label="Pubkey"
              value={selectedKey.publicKeyHex}
              onCopy={() => void handleCopyKeyValue("Pubkey", selectedKey.publicKeyHex)}
            />
            <KeypairTableRow
              label="Npub"
              value={selectedKey.publicKeyNpub}
              onCopy={() => void handleCopyKeyValue("Npub", selectedKey.publicKeyNpub)}
            />
            <KeypairTableRow
              label="Secret key"
              value={selectedKey.privateKeyHex}
              hidden
              onCopy={() => void handleCopyKeyValue("Secret key", selectedKey.privateKeyHex)}
            />
            <KeypairTableRow
              label="Nsec"
              value={selectedKey.privateKeyNsec}
              hidden
              onCopy={() => void handleCopyKeyValue("Nsec", selectedKey.privateKeyNsec)}
            />
          </tbody>
        </table>
        <p className="muted">
          {selectedKey.source} · {formatRelativeTime(selectedKey.createdAt)}
        </p>

        <form className="metadata-form" onSubmit={(event) => void handleMetadataSubmit(event, selectedKey)}>
          <label className="field-stack">
            <span>Name</span>
            <input
              className="field-input"
              value={selectedMetadataDraft.name}
              onChange={(event) => updateMetadataDraft(selectedKey.publicKeyNpub, { name: event.target.value })}
              placeholder="Display name"
              disabled={isSelectedSavingMetadata || isSelectedUploadingPicture}
            />
          </label>
          <label className="field-stack">
            <span>Picture</span>
            {selectedMetadataDraft.picture ? (
              <img
                className="metadata-picture-preview"
                src={selectedMetadataDraft.picture}
                alt="Profile picture preview"
              />
            ) : null}
            <p className={selectedMetadataDraft.picture ? "metadata-readonly-value" : "metadata-readonly-value muted"}>
              {selectedMetadataDraft.picture || "Upload an image to Blossom"}
            </p>
          </label>
          <label className="field-stack">
            <span>Upload picture</span>
            <input
              className="field-input"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleMetadataPictureUpload(selectedKey, file);
                event.target.value = "";
              }}
              disabled={isSelectedSavingMetadata || isSelectedUploadingPicture}
            />
          </label>
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => updateMetadataDraft(selectedKey.publicKeyNpub, { picture: "" })}
              disabled={
                isSelectedSavingMetadata || isSelectedUploadingPicture || selectedMetadataDraft.picture.length === 0
              }
            >
              Clear picture
            </button>
          </div>
          <label className="field-stack">
            <span>About</span>
            <textarea
              className="note-input"
              value={selectedMetadataDraft.about}
              onChange={(event) => updateMetadataDraft(selectedKey.publicKeyNpub, { about: event.target.value })}
              placeholder="Short profile bio"
              disabled={isSelectedSavingMetadata || isSelectedUploadingPicture}
            />
          </label>
          {selectedMetadataError ? <p className="field-error">{selectedMetadataError}</p> : null}
          <div className="action-row">
            <button
              className="primary-button"
              type="submit"
              disabled={isSelectedSavingMetadata || isSelectedUploadingPicture}
            >
              {isSelectedSavingMetadata ? "Publishing..." : "Publish metadata"}
            </button>
            <span className="thread-pill">
              {isSelectedUploadingPicture ? "Uploading picture" : "Kind 0 metadata"}
            </span>
          </div>
        </form>
      </article>
    ) : null;

  return (
    <section className="panel route-surface route-surface-settings">
      <SettingsSection title="Appearance">
        <article className="feature-card appearance-mode-card">
          <div className="appearance-mode-head">
            <p className="section-label">Theme</p>
          </div>

          <div className="appearance-mode-grid" role="radiogroup" aria-label="Appearance mode">
            {appearanceOptions.map((option) => (
              <label
                key={option.value}
                className={`appearance-mode-option${appearanceMode === option.value ? " is-active" : ""}`}
              >
                <input
                  aria-label={option.label}
                  type="radio"
                  name="appearance-mode"
                  value={option.value}
                  checked={appearanceMode === option.value}
                  onChange={() => setAppearanceMode(option.value)}
                />
                <span className="appearance-mode-label">{option.label}</span>
              </label>
            ))}
          </div>
        </article>
      </SettingsSection>

      <SettingsSection
        title="Keys"
        description="Nostr uses asymmetric keypairs: your private key stays secret and signs events, while your public key identifies you so relays and other clients can verify authorship."
        descriptionDisplay="modal"
        status={activeLocalKey ? "Local key active" : "No local key"}
      >
        {!isNarrowKeysLayout && keysDetailPanel ? (
          <ResizablePanels
            className="keys-layout"
            storageKey="settings-keys"
            defaultPrimarySize={360}
            minPrimarySize={280}
            minSecondarySize={360}
            handleLabel="Resize settings keys panels"
            primary={keysListPanel}
            secondary={keysDetailPanel}
          />
        ) : (
          <div className="keys-layout">
            {keysListPanel}
            {keysDetailPanel}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Relays"
        description={
          <>
            <p className="muted">Relays are the servers that store and forward Nostr events between clients.</p>
            <p className="muted">
              Your client publishes notes, profile updates, and reactions to relays, then reads from relays to
              discover posts and people. The list below controls which relays this browser connects to.
            </p>
          </>
        }
        descriptionDisplay="modal"
        status={health?.relay_name ?? "Relay"}
      >
        <div className="admin-form">
          <form className="relay-list-form" onSubmit={handleAddRelay}>
            <label className="field-stack">
              <span>Relay name</span>
              <input
                className="field-input"
                value={relayDraftName}
                onChange={(event) => setRelayDraftName(event.target.value)}
                placeholder="Mission Mesh"
              />
            </label>
            <label className="field-stack">
              <span>Relay URL</span>
              <input
                className="field-input"
                value={relayDraftURL}
                onChange={(event) => setRelayDraftURL(event.target.value)}
                placeholder="wss://mission.example/relay"
              />
            </label>
            <div className="action-row">
              <button className="primary-button" type="submit">
                Add relay
              </button>
            </div>
          </form>
          {relayListError ? <p className="field-error">{relayListError}</p> : null}
          <div className="admin-record-list relay-card-list">
            {relayList.map((relay) => {
              const relayLabel = relay.name.trim() || relay.url;
              const isPrimaryRelay = relay.url === relayURL;

              return (
                <article key={relay.url} className="mini-card admin-record relay-list-card">
                  <div className="relay-card-main">
                    <strong className="relay-card-title">{relayLabel}</strong>
                    <p className="relay-card-url">{relay.url}</p>
                    <div className="checkbox-grid relay-card-flags">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={relay.inbox}
                          onChange={(event) => handleRelayFlagChange(relay, "inbox", event.target.checked)}
                          aria-label={`${relayLabel} inbox`}
                        />
                        <span>Inbox</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={relay.outbox}
                          onChange={(event) => handleRelayFlagChange(relay, "outbox", event.target.checked)}
                          aria-label={`${relayLabel} outbox`}
                        />
                        <span>Outbox</span>
                      </label>
                    </div>
                  </div>
                  <div className="relay-card-side">
                    {isPrimaryRelay ? (
                      <span className="thread-pill live">Primary</span>
                    ) : (
                      <button
                        className="secondary-button danger-button"
                        type="button"
                        onClick={() => handleRequestRemoveRelay(relay.url, relayLabel)}
                        aria-label={`Remove ${relayLabel}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {relayRemovalTarget
            ? createPortal(
                <div className="thread-modal-backdrop" role="presentation" onClick={() => setRelayRemovalTarget(null)}>
                  <div
                    className="thread-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="relay-removal-title"
                    aria-describedby="relay-removal-description"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="detail-header thread-modal-header">
                      <div className="thread-modal-identity">
                        <div className="marker-participant-meta">
                          <p className="section-label">Relays</p>
                          <h3 id="relay-removal-title">Remove relay?</h3>
                        </div>
                      </div>
                    </div>
                    <div className="thread-modal-body" id="relay-removal-description">
                      <p className="muted">
                        Remove <strong>{relayRemovalTarget.label}</strong> from this browser&apos;s relay list?
                      </p>
                      <p className="muted">This only changes the local relay override and can be added again later.</p>
                      <div className="action-row">
                        <button className="secondary-button" type="button" onClick={() => setRelayRemovalTarget(null)}>
                          Cancel
                        </button>
                        <button
                          className="secondary-button danger-button"
                          type="button"
                          onClick={handleConfirmRemoveRelay}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Admin"
        description={
          hasOperatorPubkey
            ? "Operator governance forms, audit history, relay health checks, and privileged relay controls."
            : undefined
        }
        status={hasOperatorPubkey ? "Operator key detected" : "Locked"}
      >
        {!hasOperatorPubkey ? (
          <article className="feature-card admin-status">
            <p className="section-label">Admin locked</p>
            <h3>Operator pubkey required</h3>
            <p>
              Admin controls open once the current session or connected signer matches the relay operator pubkey.
            </p>
            {relayConnectionIssue ? <p className="field-error">{relayConnectionIssue}</p> : null}
          </article>
        ) : (
          <>
            <article className="feature-card admin-status">
          <p className="section-label">Admin access</p>
          <h3>{adminSession ? "Browser signer verified" : "Verify browser signer"}</h3>
          <p className="muted">
            Governance requests use NIP-98 on every request. The same signer can also authorize relay and
            media requests when no local key is active.
          </p>
          <dl className="metric-list">
            <div>
              <dt>Browser pubkey</dt>
              <dd>{adminSession?.pubkey ?? "Not connected"}</dd>
            </div>
            <div>
              <dt>Admin decision</dt>
              <dd>{adminSession ? `${adminSession.access.decision} · ${adminSession.access.reason}` : "Pending"}</dd>
            </div>
            <div>
              <dt>Standing</dt>
              <dd>{adminSession?.access.standing ?? "Unknown"}</dd>
            </div>
          </dl>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={handleConnectSigner}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : adminSession ? "Reconnect signer" : "Connect signer"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void refreshGovernanceData()}
              disabled={!canAdmin || isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh governance"}
            </button>
          </div>
        </article>

        <article className="feature-card admin-status">
          <p className="section-label">Relay health</p>
          <h3>{health?.relay_name ?? "Synchrono City relay"}</h3>
          <dl className="metric-list">
            <div>
              <dt>Status</dt>
              <dd>{health?.status ?? healthError ?? "Checking relay"}</dd>
            </div>
            <div>
              <dt>Relay URL</dt>
              <dd>{health?.relay_url ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Operator pubkey</dt>
              <dd>{configuredOperatorPubkey}</dd>
            </div>
            <div>
              <dt>Last health timestamp</dt>
              <dd>{health?.timestamp ?? "Pending"}</dd>
            </div>
          </dl>
          {relayConnectionIssue ? <p className="field-error">{relayConnectionIssue}</p> : null}
        </article>

        {adminError ? (
          <article className="feature-card admin-status" role="alert">
            <p className="section-label">Admin status</p>
            <h3>Request blocked</h3>
            <p>{adminError}</p>
          </article>
        ) : null}

        {lastMutation ? (
          <article className="feature-card admin-status">
            <p className="section-label">Last action</p>
            <h3>Recent admin change</h3>
            <p>{lastMutation}</p>
          </article>
        ) : null}

        <div className="admin-grid">
          <article className="feature-card admin-form">
          <p className="section-label">Guest list</p>
          <h3>Allow relay guests</h3>
          <label className="field-stack">
            <span>Subject pubkey</span>
            <input
              className="field-input"
              value={guestPubkey}
              onChange={(event) => setGuestPubkey(event.target.value)}
              placeholder="npub1... or 64-char hex"
              disabled={!canAdmin || isSavingGuest}
            />
          </label>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleGuestListAction("add")}
              disabled={!canAdmin || isSavingGuest}
            >
              {isSavingGuest ? "Saving..." : "Add guest"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleGuestListAction("remove")}
              disabled={!canAdmin || isSavingGuest}
            >
              Remove guest
            </button>
          </div>
          <div className="admin-record-list">
            {guestEntries.length === 0 ? <p className="muted">No guest policy assignments yet.</p> : null}
            {guestEntries.map((entry) => (
              <article key={`guest-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.subject_pubkey}</strong>
                <p>{entry.revoked ? "Revoked" : "Active"} · {entry.scope}</p>
                <small>{entry.created_at ?? "Timestamp unavailable"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="feature-card admin-form">
          <p className="section-label">Blocklist</p>
          <h3>Block relay access</h3>
          <label className="field-stack">
            <span>Subject pubkey</span>
            <input
              className="field-input"
              value={blockPubkeyValue}
              onChange={(event) => setBlockPubkeyValue(event.target.value)}
              placeholder="npub1... or 64-char hex"
              disabled={!canAdmin || isSavingBlock}
            />
          </label>
          <label className="field-stack">
            <span>Reason</span>
            <textarea
              className="note-input"
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="Optional moderation reason"
              disabled={!canAdmin || isSavingBlock}
            />
          </label>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleBlockListAction("block")}
              disabled={!canAdmin || isSavingBlock}
            >
              {isSavingBlock ? "Saving..." : "Block pubkey"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleBlockListAction("unblock")}
              disabled={!canAdmin || isSavingBlock}
            >
              Unblock
            </button>
          </div>
          <div className="admin-record-list">
            {blockEntries.length === 0 ? <p className="muted">No blocked pubkeys.</p> : null}
            {blockEntries.map((entry) => (
              <article key={`block-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.subject_pubkey}</strong>
                <p>{entry.revoked ? "Revoked" : "Blocked"} · {entry.scope}</p>
                <small>{entry.metadata?.reason ?? "No reason attached"}</small>
              </article>
            ))}
          </div>
        </article>
        </div>

        <div className="admin-grid">
          <form className="feature-card admin-form" onSubmit={(event) => void handleStandingSubmit(event, "assign")}>
          <p className="section-label">Standing</p>
          <h3>Assign local role</h3>
          <label className="field-stack">
            <span>Subject pubkey</span>
            <input
              className="field-input"
              value={standingPubkey}
              onChange={(event) => setStandingPubkey(event.target.value)}
              placeholder="npub1... or 64-char hex"
              disabled={!canAdmin || isSavingStanding}
            />
          </label>
          <label className="field-stack">
            <span>Standing</span>
            <select
              className="field-input"
              value={standingValue}
              onChange={(event) => setStandingValue(event.target.value as StandingValue)}
              disabled={!canAdmin || isSavingStanding}
            >
              {validStandings.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>Scope</span>
            <input
              className="field-input"
              value={standingScope}
              onChange={(event) => setStandingScope(event.target.value)}
              placeholder="relay"
              disabled={!canAdmin || isSavingStanding}
            />
          </label>
          <div className="action-row">
            <button className="primary-button" type="submit" disabled={!canAdmin || isSavingStanding}>
              {isSavingStanding ? "Saving..." : "Save standing"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleStandingRevoke()}
              disabled={!canAdmin || isSavingStanding}
            >
              Revoke standing
            </button>
          </div>
          <label className="field-stack">
            <span>Lookup pubkey</span>
            <input
              className="field-input"
              value={standingLookupPubkey}
              onChange={(event) => setStandingLookupPubkey(event.target.value)}
              placeholder="Leave empty for recent standing changes"
              disabled={!canAdmin}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadStandingEntries()}
            disabled={!canAdmin}
          >
            Refresh standing view
          </button>
          <div className="admin-record-list">
            {standingEntries.length === 0 ? <p className="muted">No standing records loaded.</p> : null}
            {standingEntries.map((entry) => (
              <article key={`standing-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.subject_pubkey}</strong>
                <p>{entry.standing} · {entry.scope}</p>
                <small>{entry.revoked ? "Revoked" : "Active"} · {entry.created_at ?? "Timestamp unavailable"}</small>
              </article>
            ))}
          </div>
        </form>

        <form className="feature-card admin-form" onSubmit={(event) => void handleRoomPermissionSubmit(event, "grant")}>
          <p className="section-label">Room permissions</p>
          <h3>Grant room access</h3>
          <label className="field-stack">
            <span>Subject pubkey</span>
            <input
              className="field-input"
              value={roomPubkey}
              onChange={(event) => setRoomPubkey(event.target.value)}
              placeholder="npub1... or 64-char hex"
              disabled={!canAdmin || isSavingRoom}
            />
          </label>
          <label className="field-stack">
            <span>Room ID</span>
            <input
              className="field-input"
              value={roomID}
              onChange={(event) => setRoomID(event.target.value)}
              placeholder="beacon:9q8yyk"
              disabled={!canAdmin || isSavingRoom}
            />
          </label>
          <div className="checkbox-grid">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={roomCanJoin}
                onChange={(event) => setRoomCanJoin(event.target.checked)}
                disabled={!canAdmin || isSavingRoom}
              />
              <span>Can join</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={roomCanPublish}
                onChange={(event) => setRoomCanPublish(event.target.checked)}
                disabled={!canAdmin || isSavingRoom}
              />
              <span>Can publish</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={roomCanSubscribe}
                onChange={(event) => setRoomCanSubscribe(event.target.checked)}
                disabled={!canAdmin || isSavingRoom}
              />
              <span>Can subscribe</span>
            </label>
          </div>
          <div className="action-row">
            <button className="primary-button" type="submit" disabled={!canAdmin || isSavingRoom}>
              {isSavingRoom ? "Saving..." : "Save room permission"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleRoomPermissionRevoke()}
              disabled={!canAdmin || isSavingRoom}
            >
              Revoke room permission
            </button>
          </div>
          <label className="field-stack">
            <span>Lookup room ID</span>
            <input
              className="field-input"
              value={roomLookupID}
              onChange={(event) => setRoomLookupID(event.target.value)}
              placeholder="Leave empty for recent room permissions"
              disabled={!canAdmin}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadRoomEntries()}
            disabled={!canAdmin}
          >
            Refresh room permissions
          </button>
          <div className="admin-record-list">
            {roomEntries.length === 0 ? <p className="muted">No room permissions loaded.</p> : null}
            {roomEntries.map((entry) => (
              <article key={`room-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.subject_pubkey}</strong>
                <p>{entry.room_id}</p>
                <small>
                  join {flag(entry.can_join)} · publish {flag(entry.can_publish)} · subscribe {flag(entry.can_subscribe)} · {entry.revoked ? "revoked" : "active"}
                </small>
              </article>
            ))}
          </div>
        </form>
        </div>

        <div className="admin-grid">
          <article className="feature-card admin-form">
          <p className="section-label">Proof verification</p>
          <h3>Verify OAuth and social proofs</h3>
          <label className="field-stack">
            <span>Subject pubkey</span>
            <input
              className="field-input"
              value={proofPubkey}
              onChange={(event) => setProofPubkey(event.target.value)}
              placeholder="npub1... or 64-char hex"
              disabled={!canAdmin || isSavingProof}
            />
          </label>
          <label className="field-stack">
            <span>Proof type</span>
            <select
              className="field-input"
              value={proofType}
              onChange={(event) => setProofType(event.target.value as ProofTypeValue)}
              disabled={!canAdmin || isSavingProof}
            >
              {validProofTypes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>Proof value</span>
            <input
              className="field-input"
              value={proofValue}
              onChange={(event) => setProofValue(event.target.value)}
              placeholder="github:operator or nostr:trusted-graph"
              disabled={!canAdmin || isSavingProof}
            />
          </label>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleProofAction("verify")}
              disabled={!canAdmin || isSavingProof}
            >
              {isSavingProof ? "Saving..." : "Verify proof"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleProofAction("revoke")}
              disabled={!canAdmin || isSavingProof}
            >
              Revoke proof
            </button>
          </div>
          <div className="admin-record-list">
            {proofEntries.length === 0 ? <p className="muted">No proof verifications recorded.</p> : null}
            {proofEntries.map((entry) => (
              <article key={`proof-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.subject_pubkey}</strong>
                <p>{entry.proof_type} · {entry.proof_value}</p>
                <small>{entry.revoked ? "Revoked" : "Verified"} · {entry.created_at ?? "Timestamp unavailable"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="feature-card admin-form">
          <p className="section-label">Gate stacking</p>
          <h3>Require proofs before publish</h3>
          <label className="field-stack">
            <span>Capability</span>
            <select
              className="field-input"
              value={gateCapability}
              onChange={(event) => setGateCapability(event.target.value as GateCapabilityValue)}
              disabled={!canAdmin || isSavingGate}
            >
              {validGateCapabilities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>Scope</span>
            <input
              className="field-input"
              value={gateScope}
              onChange={(event) => setGateScope(event.target.value)}
              placeholder="relay"
              disabled={!canAdmin || isSavingGate}
            />
          </label>
          <div className="checkbox-grid">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={gateRequireGuest}
                onChange={(event) => setGateRequireGuest(event.target.checked)}
                disabled={!canAdmin || isSavingGate}
              />
              <span>Require guest allowlist</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={gateRequireOAuth}
                onChange={(event) => setGateRequireOAuth(event.target.checked)}
                disabled={!canAdmin || isSavingGate}
              />
              <span>Require OAuth proof</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={gateRequireSocial}
                onChange={(event) => setGateRequireSocial(event.target.checked)}
                disabled={!canAdmin || isSavingGate}
              />
              <span>Require social proof</span>
            </label>
          </div>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleGatePolicyAction("save")}
              disabled={!canAdmin || isSavingGate}
            >
              {isSavingGate ? "Saving..." : "Save gate policy"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleGatePolicyAction("revoke")}
              disabled={!canAdmin || isSavingGate}
            >
              Revoke policy
            </button>
          </div>
          <div className="admin-record-list">
            {gateEntries.length === 0 ? <p className="muted">No gate policies recorded.</p> : null}
            {gateEntries.map((entry) => (
              <article key={`gate-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.capability}</strong>
                <p>
                  {entry.scope} · guest {flag(entry.require_guest)} · proofs {entry.proof_types.join(", ") || "none"}
                </p>
                <small>{entry.revoked ? "Revoked" : "Active"} · {entry.created_at ?? "Timestamp unavailable"}</small>
              </article>
            ))}
          </div>
        </article>
        </div>

        <div className="admin-grid">
          <article className="feature-card admin-form">
          <p className="section-label">Editorial pins</p>
          <h3>Pin relay notes into Pulse</h3>
          <label className="field-stack">
            <span>Geohash</span>
            <input
              className="field-input"
              value={pinGeohash}
              onChange={(event) => setPinGeohash(event.target.value)}
              placeholder="9q8yyk"
              disabled={!canAdmin || isSavingPin}
            />
          </label>
          <label className="field-stack">
            <span>Note ID</span>
            <input
              className="field-input"
              value={pinNoteID}
              onChange={(event) => setPinNoteID(event.target.value)}
              placeholder="note-plaza-pinned"
              disabled={!canAdmin || isSavingPin}
            />
          </label>
          <label className="field-stack">
            <span>Label</span>
            <input
              className="field-input"
              value={pinLabel}
              onChange={(event) => setPinLabel(event.target.value)}
              placeholder="featured"
              disabled={!canAdmin || isSavingPin}
            />
          </label>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleEditorialPinAction("pin")}
              disabled={!canAdmin || isSavingPin}
            >
              {isSavingPin ? "Saving..." : "Pin note"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleEditorialPinAction("unpin")}
              disabled={!canAdmin || isSavingPin}
            >
              Unpin note
            </button>
          </div>
          <div className="admin-record-list">
            {pinEntries.length === 0 ? <p className="muted">No editorial pins recorded.</p> : null}
            {pinEntries.map((entry) => (
              <article key={`pin-${entry.id ?? entry.created_at}`} className="mini-card admin-record">
                <strong>{entry.geohash}</strong>
                <p>{entry.note_id} · {entry.label}</p>
                <small>{entry.revoked ? "Revoked" : "Pinned"} · {entry.created_at ?? "Timestamp unavailable"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="feature-card">
          <p className="section-label">Phase 5 summary</p>
          <h3>Intelligence surface</h3>
          <dl className="metric-list">
            <div>
              <dt>Verified proofs</dt>
              <dd>{proofEntries.filter((entry) => !entry.revoked).length}</dd>
            </div>
            <div>
              <dt>Active gate policies</dt>
              <dd>{gateEntries.filter((entry) => !entry.revoked).length}</dd>
            </div>
            <div>
              <dt>Active editorial pins</dt>
              <dd>{pinEntries.filter((entry) => !entry.revoked).length}</dd>
            </div>
          </dl>
          <p className="muted">
            Proofs and gate policies feed Concierge relay authorization. Editorial pins are reflected in Pulse after refresh.
          </p>
        </article>
        </div>

        <section className="feature-card">
          <div className="detail-header">
            <div>
              <p className="section-label">Audit log</p>
              <h3>Privileged write history</h3>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void refreshGovernanceData()}
              disabled={!canAdmin || isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh audit"}
            </button>
          </div>
          {auditPage.entries.length === 0 ? (
            <p className="muted">
              {canAdmin ? "No audit entries loaded yet." : "Connect an authorized signer to inspect audit history."}
            </p>
          ) : (
            <>
              <div className="note-list">
                {auditPage.entries.map((entry) => (
                  <article key={`${entry.id ?? entry.created_at}-${entry.action}`} className="tile-card audit-entry">
                    <header>
                      <div>
                        <strong>{entry.action}</strong>
                        <p className="tile-kicker">{entry.created_at ?? "Timestamp unavailable"}</p>
                      </div>
                      <span className="thread-pill">{entry.scope}</span>
                    </header>
                    <p>
                      Actor {entry.actor_pubkey}
                      {entry.target_pubkey ? ` -> ${entry.target_pubkey}` : ""}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                      <small>{Object.entries(entry.metadata).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small>
                    ) : (
                      <small>No extra metadata</small>
                    )}
                  </article>
                ))}
              </div>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadMoreAuditEntries()}
                  disabled={!auditPage.next_cursor || isLoadingAuditMore}
                >
                  {isLoadingAuditMore ? "Loading..." : auditPage.next_cursor ? "Load more" : "End of audit"}
                </button>
              </div>
            </>
          )}
        </section>
          </>
        )}
      </SettingsSection>
    </section>
  );
}

type SettingsSectionProps = {
  title: string;
  description?: ReactNode;
  descriptionDisplay?: "inline" | "modal";
  status?: string;
  children: ReactNode;
};

function SettingsSection({
  title,
  description,
  descriptionDisplay = "inline",
  status,
  children
}: SettingsSectionProps) {
  const sectionSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const descriptionTitleID = `${sectionSlug}-settings-description-title`;
  const descriptionBodyID = `${sectionSlug}-settings-description-body`;
  const descriptionPopoverID = `${sectionSlug}-settings-description-popover`;
  const showDescriptionHelp = descriptionDisplay === "modal" && Boolean(description);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const descriptionPopoverRef = useRef<HTMLDivElement | null>(null);

  useDialogEscape(showDescriptionHelp && isDescriptionOpen, () => setIsDescriptionOpen(false));
  useOutsidePress(showDescriptionHelp && isDescriptionOpen, descriptionPopoverRef, () => setIsDescriptionOpen(false));

  return (
    <section className="feature-card settings-section">
      <div className="settings-section-header">
        <div className="settings-section-heading">
          <div className="settings-section-heading-main" ref={descriptionPopoverRef}>
            <p className="section-label">{title}</p>
            <div className="settings-section-title-row">
              <h3>{title}</h3>
              {showDescriptionHelp ? (
                <button
                  className="settings-section-help"
                  type="button"
                  aria-label={isDescriptionOpen ? `Hide ${title} description` : `Show ${title} description`}
                  aria-haspopup="dialog"
                  aria-expanded={isDescriptionOpen}
                  aria-controls={descriptionPopoverID}
                  onClick={() => setIsDescriptionOpen((open) => !open)}
                >
                  ?
                </button>
              ) : null}
            </div>
            {description && !showDescriptionHelp ? (
              <div className="settings-section-description">{renderSettingsSectionDescription(description)}</div>
            ) : null}
            {showDescriptionHelp && isDescriptionOpen && description ? (
              <div
                id={descriptionPopoverID}
                className="settings-section-popover"
                role="dialog"
                aria-labelledby={descriptionTitleID}
                aria-describedby={descriptionBodyID}
              >
                <p className="section-label">Settings</p>
                <h4 id={descriptionTitleID}>{title} description</h4>
                <div className="settings-section-description" id={descriptionBodyID}>
                  {renderSettingsSectionDescription(description)}
                </div>
              </div>
            ) : null}
          </div>
          {status ? (
            <div className="settings-section-meta">
              <span className="thread-pill">{status}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function useDialogEscape(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onClose]);
}

function useOutsidePress(
  enabled: boolean,
  containerRef: { current: HTMLElement | null },
  onClose: () => void
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (containerRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [containerRef, enabled, onClose]);
}

function renderSettingsSectionDescription(description: ReactNode) {
  return typeof description === "string" ? <p className="muted">{description}</p> : description;
}

function flag(value: boolean) {
  return value ? "yes" : "no";
}

function formatAppearanceLabel(appearanceMode: "dark" | "light" | "system") {
  return `${appearanceMode.charAt(0).toUpperCase()}${appearanceMode.slice(1)}`;
}

function formatRelativeTime(timestamp: string) {
  const target = new Date(timestamp).getTime();

  if (!Number.isFinite(target)) {
    return timestamp;
  }

  const deltaSeconds = Math.max(0, Math.round((Date.now() - target) / 1000));

  if (deltaSeconds < 60) {
    return "just now";
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 30) {
    return `${deltaDays}d ago`;
  }

  const deltaMonths = Math.floor(deltaDays / 30);
  if (deltaMonths < 12) {
    return `${deltaMonths}mo ago`;
  }

  const deltaYears = Math.floor(deltaMonths / 12);
  return `${deltaYears}y ago`;
}

function getLocalKeyDisplayName(draft: MetadataDraft, key: LocalKeyring["keys"][number]) {
  const name = draft.name.trim();
  return name || `Key ${key.publicKeyHex.slice(0, 8)}`;
}

function truncateMiddle(value: string, leading = 8, trailing = 8) {
  if (value.length <= leading + trailing) {
    return value;
  }

  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

type KeyAvatarProps = {
  picture: string;
  name: string;
};

function KeyAvatar({ picture, name }: KeyAvatarProps) {
  if (picture.trim()) {
    return <img className="participant-avatar" src={picture} alt={`${name} avatar`} />;
  }

  return (
    <div className="participant-avatar participant-avatar-fallback" aria-hidden="true">
      {name.trim().slice(0, 2).toUpperCase()}
    </div>
  );
}

type KeypairTableRowProps = {
  label: string;
  value: string;
  hidden?: boolean;
  onCopy?: () => void;
};

function KeypairTableRow({ label, value, hidden = false, onCopy }: KeypairTableRowProps) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        <code className={hidden ? "keypair-value keypair-value-secret" : "keypair-value"}>
          {hidden ? maskSecretValue(value) : value}
        </code>
      </td>
      <td className="keypair-copy-cell">
        {onCopy ? (
          <button
            className="copy-icon-button"
            type="button"
            aria-label={`Copy ${label}`}
            onClick={onCopy}
          >
            <CopyIcon />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="5" y="3" width="8" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="3" y="5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function maskSecretValue(value: string) {
  return "*".repeat(Math.max(16, Math.min(value.length, 24)));
}

function getMetadataDraft(drafts: Record<string, MetadataDraft>, publicKeyNpub: string): MetadataDraft {
  return (
    drafts[publicKeyNpub] ?? {
      name: "",
      picture: "",
      about: ""
    }
  );
}

function shouldHydrateMetadataDraft(draft?: MetadataDraft) {
  return !draft || (draft.name.trim() === "" && draft.picture.trim() === "" && draft.about.trim() === "");
}

function buildProfileMetadataContent(draft: MetadataDraft): ProfileMetadataContent {
  const metadata: ProfileMetadataContent = {};
  const name = draft.name.trim();
  const picture = draft.picture.trim();
  const about = draft.about.trim();

  if (name) {
    metadata.name = name;
  }
  if (picture) {
    metadata.picture = picture;
  }
  if (about) {
    metadata.about = about;
  }

  return metadata;
}

function formatAdminError(error: unknown): string {
  if (error instanceof AdminAuthError) {
    return error.message;
  }
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Admin request failed.";
}
