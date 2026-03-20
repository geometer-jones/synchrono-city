import { useAppState } from "../app-state";

export function CallOverlay() {
  const { activeCall, leavePlaceCall, toggleCallControl, toggleCallMinimized } = useAppState();

  if (!activeCall) {
    return null;
  }

  return (
    <aside className={activeCall.minimized ? "call-overlay minimized" : "call-overlay"}>
      <div className="call-overlay-header">
        <div>
          <p className="section-label">Active room</p>
          <h3>
            {activeCall.placeTitle} · {activeCall.geohash}
          </h3>
          <small>{activeCall.roomID}</small>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={toggleCallMinimized}
        >
          {activeCall.minimized ? "Expand" : "Minimize"}
        </button>
      </div>

      {activeCall.minimized ? null : (
        <>
          <div className="call-status-grid">
            <span className={activeCall.transport === "livekit" ? "thread-pill live" : "thread-pill"}>
              {activeCall.transport === "livekit" ? "LiveKit ready" : "Local room intent"}
            </span>
            <span
              className={
                activeCall.connectionState === "connected" ? "thread-pill live" : "thread-pill"
              }
            >
              {activeCall.connectionState === "connected"
                ? "Connected"
                : activeCall.connectionState === "connecting"
                  ? "Connecting"
                  : activeCall.connectionState === "failed"
                    ? "Policy blocked"
                    : "Preview"}
            </span>
            {activeCall.canPublish !== undefined ? (
              <span className={activeCall.canPublish ? "thread-pill live" : "thread-pill"}>
                Publish {activeCall.canPublish ? "allowed" : "blocked"}
              </span>
            ) : null}
            {activeCall.canSubscribe !== undefined ? (
              <span className={activeCall.canSubscribe ? "thread-pill live" : "thread-pill"}>
                Subscribe {activeCall.canSubscribe ? "allowed" : "blocked"}
              </span>
            ) : null}
          </div>
          <p className="muted overlay-status-copy">{activeCall.statusMessage}</p>
          {activeCall.identity || activeCall.liveKitURL || activeCall.expiresAt ? (
            <dl className="call-meta-list">
              {activeCall.identity ? (
                <div>
                  <dt>Identity</dt>
                  <dd>{activeCall.identity}</dd>
                </div>
              ) : null}
              {activeCall.liveKitURL ? (
                <div>
                  <dt>LiveKit URL</dt>
                  <dd>{activeCall.liveKitURL}</dd>
                </div>
              ) : null}
              {activeCall.expiresAt ? (
                <div>
                  <dt>Token expiry</dt>
                  <dd>{activeCall.expiresAt}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="call-indicators">
            <span className={activeCall.mic ? "thread-pill live" : "thread-pill"}>Mic {activeCall.mic ? "on" : "off"}</span>
            <span className={activeCall.cam ? "thread-pill live" : "thread-pill"}>Cam {activeCall.cam ? "on" : "off"}</span>
            <span className={activeCall.screenshare ? "thread-pill live" : "thread-pill"}>
              Share {activeCall.screenshare ? "on" : "off"}
            </span>
            <span className={activeCall.deafen ? "thread-pill" : "thread-pill live"}>
              Deafen {activeCall.deafen ? "on" : "off"}
            </span>
          </div>

          <div className="call-controls">
            <button className="secondary-button" type="button" onClick={() => toggleCallControl("mic")}>
              Toggle mic
            </button>
            <button className="secondary-button" type="button" onClick={() => toggleCallControl("cam")}>
              Toggle cam
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => toggleCallControl("screenshare")}
            >
              Toggle share
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => toggleCallControl("deafen")}
            >
              Toggle deafen
            </button>
            <button className="primary-button" type="button" onClick={leavePlaceCall}>
              Leave room
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
