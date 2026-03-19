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
