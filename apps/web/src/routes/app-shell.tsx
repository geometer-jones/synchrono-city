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
      <header className="app-bar">
        <div className="app-bar-brand">
          <p className="eyebrow">Synchrono City</p>
          <strong>Map-native coordination for sovereign communities.</strong>
          <p className="muted app-bar-copy">
            World stays map-first. Governance, media, and intelligence stay inside the same shell.
          </p>
        </div>
        <nav className="app-nav app-nav-desktop" aria-label="Primary">
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
        <div className="app-bar-status">
          <span className="status-pill status-pill-live">Roadmap: Phase 5</span>
          <span className="status-pill">{sceneHealth.activeTiles} live tiles</span>
          <span className="status-pill">{sceneHealth.openSeats} open seats</span>
          <span className={activeCall ? "status-pill status-pill-live" : "status-pill"}>
            {activeCall ? activeCall.geohash : "No active room"}
          </span>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="app-nav app-nav-mobile" aria-label="Primary mobile">
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

      <CallOverlay />
    </div>
  );
}
