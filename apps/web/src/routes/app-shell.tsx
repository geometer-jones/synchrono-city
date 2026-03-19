import { NavLink, Outlet } from "react-router-dom";

import { AppStateProvider, useAppState } from "../app-state";
import { CallOverlay } from "../components/call-overlay";

const navItems = [
  { to: "/app", label: "World", end: true },
  { to: "/app/chats", label: "Chats" },
  { to: "/app/pulse", label: "Pulse" },
  { to: "/app/settings", label: "Settings" }
];

export function AppShell() {
  return (
    <AppStateProvider>
      <AppShellLayout />
    </AppStateProvider>
  );
}

function AppShellLayout() {
  const { activeCall, sceneHealth } = useAppState();

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Synchrono City</p>
          <h1>Map-native coordination for sovereign communities.</h1>
          <p className="hero-copy">
            Phase 2 adds application-defined places, live geo-chat notes, profile context,
            and geohash-scoped room intent on top of the existing client shell.
          </p>
        </div>
        <div className="status-panel">
          <span className="status-pill">Roadmap: Phase 2</span>
          <dl className="metric-list">
            <div>
              <dt>Live tiles</dt>
              <dd>{sceneHealth.activeTiles} application-defined places</dd>
            </div>
            <div>
              <dt>Media room</dt>
              <dd>{activeCall ? activeCall.roomID : "No active room joined"}</dd>
            </div>
            <div>
              <dt>Open seats</dt>
              <dd>{sceneHealth.openSeats} seats before place capacity fills</dd>
            </div>
          </dl>
        </div>
      </header>

      <nav className="top-nav" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Outlet />
      </main>

      <CallOverlay />
    </div>
  );
}
