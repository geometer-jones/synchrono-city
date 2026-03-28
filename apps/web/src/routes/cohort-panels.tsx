import { useState } from "react";

import type { CohortBeaconMetadata } from "../beacon-metadata";
import type { GeoNote, ParticipantProfile } from "../data";

type CohortBeaconPanelProps = {
  metadata: CohortBeaconMetadata;
  pinnedNote?: GeoNote;
  pinnedAuthor?: ParticipantProfile;
  participantCount: number;
};

type CohortHostControlsProps = {
  roomID: string;
  participants: ParticipantProfile[];
  onSetSpeakerMode: (pubkey: string, mode: "speaker" | "listener") => Promise<void>;
};

export function CohortBeaconPanel({
  metadata,
  pinnedNote,
  pinnedAuthor,
  participantCount
}: CohortBeaconPanelProps) {
  return (
    <section className="feature-card cohort-panel">
      <div className="detail-header">
        <div>
          <p className="section-label">Cohort beacon</p>
          <h3>{metadata.curriculumLabel ?? "Local cohort"}</h3>
        </div>
        <div className="route-header-meta cohort-panel-pills">
          <span className="thread-pill">Cohort</span>
          {metadata.levelLabel ? <span className="thread-pill">{metadata.levelLabel}</span> : null}
          {metadata.hybrid ? <span className="thread-pill">Hybrid</span> : null}
          {metadata.weekLabel ? <span className="thread-pill live">{metadata.weekLabel}</span> : null}
          <span className="thread-pill">{participantCount} present</span>
        </div>
      </div>

      <div className="feature-grid cohort-panel-grid">
        <article className="mini-card">
          <strong>Who it is for</strong>
          <p>{metadata.levelLabel ? `${metadata.levelLabel} first-timers.` : "Curious locals who are early."}</p>
        </article>
        <article className="mini-card">
          <strong>Current concept</strong>
          <p>{metadata.currentConcept ?? "Pinned note sets the current focus."}</p>
        </article>
        <article className="mini-card">
          <strong>Next session</strong>
          <p>{metadata.nextSession ?? "Use the pinned note to set the next session."}</p>
        </article>
        <article className="mini-card">
          <strong>Join posture</strong>
          <p>{metadata.joinPosture}</p>
        </article>
      </div>

      {metadata.prompt ? (
        <article className="mini-card cohort-panel-prompt">
          <strong>Tiny exercise</strong>
          <p>{metadata.prompt}</p>
        </article>
      ) : null}

      {metadata.artifact ? (
        <article className="mini-card cohort-panel-artifact">
          <strong>Current artifact</strong>
          <a className="secondary-link" href={metadata.artifact.url} target="_blank" rel="noreferrer">
            {metadata.artifact.label}
          </a>
        </article>
      ) : null}

      {metadata.recentArtifacts.length > 0 ? (
        <div className="tile-list cohort-panel-artifacts">
          {metadata.recentArtifacts.map((artifact) => (
            <article key={artifact.url} className="tile-card pulse-card">
              <header>
                <div>
                  <strong>{artifact.label}</strong>
                  <p className="tile-kicker">{artifact.createdAt}</p>
                </div>
              </header>
              <a className="secondary-link" href={artifact.url} target="_blank" rel="noreferrer">
                Open artifact
              </a>
            </article>
          ))}
        </div>
      ) : null}

      {pinnedNote ? (
        <article className="mini-card cohort-panel-memory">
          <strong>Shared memory</strong>
          <p>{metadata.summary ?? pinnedNote.content}</p>
          <small>{pinnedAuthor?.displayName ?? pinnedAuthor?.name ?? pinnedNote.authorPubkey}</small>
        </article>
      ) : null}
    </section>
  );
}

export function CohortHostControls({ roomID, participants, onSetSpeakerMode }: CohortHostControlsProps) {
  const [savingByPubkey, setSavingByPubkey] = useState<Record<string, "speaker" | "listener" | undefined>>({});

  async function handleClick(pubkey: string, mode: "speaker" | "listener") {
    setSavingByPubkey((current) => ({ ...current, [pubkey]: mode }));
    try {
      await onSetSpeakerMode(pubkey, mode);
    } finally {
      setSavingByPubkey((current) => ({ ...current, [pubkey]: undefined }));
    }
  }

  return (
    <section className="feature-card cohort-host-controls">
      <div className="detail-header">
        <div>
          <p className="section-label">Host controls</p>
          <h3>Live room moderation</h3>
        </div>
        <span className="thread-pill">{roomID}</span>
      </div>

      {participants.length === 0 ? <p className="muted">No one else is connected to this room right now.</p> : null}

      <div className="admin-record-list">
        {participants.map((participant) => {
          const savingMode = savingByPubkey[participant.pubkey];

          return (
            <article key={participant.pubkey} className="mini-card admin-record cohort-host-record">
              <strong>{participant.displayName || participant.name || participant.pubkey}</strong>
              <p>{participant.role || "Participant"}</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleClick(participant.pubkey, "listener")}
                  disabled={Boolean(savingMode)}
                >
                  {savingMode === "listener" ? "Saving..." : "Listener only"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleClick(participant.pubkey, "speaker")}
                  disabled={Boolean(savingMode)}
                >
                  {savingMode === "speaker" ? "Saving..." : "Allow mic/cam"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
