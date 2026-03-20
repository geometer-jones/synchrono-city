import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  AdminAuthError,
  addToGuestList,
  assignStanding,
  blockPubkey,
  connectAdminSigner,
  fetchAuditLog,
  fetchBlocklist,
  fetchGuestList,
  fetchRoomPermissions,
  fetchStanding,
  grantRoomPermission,
  removeFromGuestList,
  unblockPubkey,
  revokeRoomPermission,
  revokeStanding,
  type AdminAccessDecision,
  type AuditEntry,
  type Paginated,
  type PolicyAssignment,
  type RoomPermission,
  type StandingRecord,
  type StandingValue,
  validStandings
} from "../admin-client";
import { ApiError, apiFetch } from "../api";
import { useAppState } from "../app-state";
import { showToast } from "../toast";

const adminCapabilities = [
  "Roles and standing management",
  "Guest list and blocklist control",
  "Room-level permissions",
  "Privileged audit history"
] as const;

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

const defaultStanding = "member";

export function SettingsRoute() {
  const { activeCall, currentUser, listThreads, places, relayOperatorPubkey, sceneHealth } = useAppState();
  const [health, setHealth] = useState<RelayHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [lastMutation, setLastMutation] = useState<string | null>(null);

  const [guestEntries, setGuestEntries] = useState<PolicyAssignment[]>([]);
  const [blockEntries, setBlockEntries] = useState<PolicyAssignment[]>([]);
  const [standingEntries, setStandingEntries] = useState<StandingRecord[]>([]);
  const [roomEntries, setRoomEntries] = useState<RoomPermission[]>([]);
  const [auditPage, setAuditPage] = useState<Paginated<AuditEntry>>({ entries: [] });

  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingGuest, setIsSavingGuest] = useState(false);
  const [isSavingBlock, setIsSavingBlock] = useState(false);
  const [isSavingStanding, setIsSavingStanding] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
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

  const threads = listThreads();
  const occupiedSeats = places.reduce((total, place) => total + place.occupantPubkeys.length, 0);
  const canAdmin = adminSession?.access.decision === "allow";

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

  async function refreshGovernanceData() {
    const generation = ++refreshGenerationRef.current;
    setIsRefreshing(true);
    try {
      const [guestList, blocklist, standings, roomPermissions, audit] = await Promise.all([
        fetchGuestList(),
        fetchBlocklist(),
        fetchStanding(standingLookupPubkey || undefined),
        fetchRoomPermissions({ roomID: roomLookupID || undefined, limit: 20 }),
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
      await refreshGovernanceData();
    } catch (error) {
      setAdminError(formatAdminError(error));
    } finally {
      setIsSavingRoom(false);
    }
  }

  return (
    <section className="panel">
      <p className="section-label">Settings</p>
      <div className="detail-header">
        <div>
          <h2>Relay Governance</h2>
          <p className="muted">
            Phase 3 operator controls for roles, policy, room access, and privileged audit review.
          </p>
        </div>
        <span className={health?.status === "ok" ? "status-pill status-pill-live" : "status-pill"}>
          {health?.status === "ok" ? "Relay healthy" : healthError ?? "Checking relay"}
        </span>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <p className="section-label">Relay identity</p>
          <h3>{health?.relay_name ?? "Synchrono City relay"}</h3>
          <dl className="metric-list">
            <div>
              <dt>Relay URL</dt>
              <dd>{health?.relay_url ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Operator pubkey</dt>
              <dd>{health?.operator_pubkey ?? relayOperatorPubkey}</dd>
            </div>
            <div>
              <dt>Last health timestamp</dt>
              <dd>{health?.timestamp ?? "Pending"}</dd>
            </div>
          </dl>
        </article>

        <article className="feature-card">
          <p className="section-label">Signer</p>
          <h3>{adminSession ? "Admin verified" : "Connect admin signer"}</h3>
          <p className="muted">
            Governance requests are signed in-browser with NIP-98 on every request.
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
      </div>

      <div className="scene-health">
        <article>
          <span>{sceneHealth.healthScore}</span>
          <p>Health score</p>
          <small>Scene health from place activity and occupancy.</small>
        </article>
        <article>
          <span>{occupiedSeats}</span>
          <p>Occupied seats</p>
          <small>Current occupants across application-defined places.</small>
        </article>
        <article>
          <span>{threads.length}</span>
          <p>Tracked threads</p>
          <small>Geo-chat threads visible to the client.</small>
        </article>
      </div>

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

      <div className="feature-grid">
        <article className="feature-card">
          <p className="section-label">Governance surface</p>
          <h3>Phase 3 controls</h3>
          <ul className="capability-list">
            {adminCapabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </article>

        <article className="feature-card">
          <p className="section-label">Current session</p>
          <h3>{currentUser.displayName}</h3>
          <dl className="metric-list">
            <div>
              <dt>Signed-in pubkey</dt>
              <dd>{currentUser.pubkey}</dd>
            </div>
            <div>
              <dt>Active room</dt>
              <dd>{activeCall?.roomID ?? "No active room joined"}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{currentUser.role}</dd>
            </div>
          </dl>
        </article>
      </div>

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
              placeholder="geo:npub1operator:9q8yyk"
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
    </section>
  );
}

function flag(value: boolean) {
  return value ? "yes" : "no";
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
