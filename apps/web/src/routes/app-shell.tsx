import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "World", end: true },
  { to: "/chats", label: "Chats" },
  { to: "/pulse", label: "Pulse" },
  { to: "/settings", label: "Settings" }
];

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Synchrono City</p>
          <h1>Map-native coordination for sovereign communities.</h1>
          <p className="hero-copy">
            Phase 1 focuses on the first runnable client shell, World MVP, and the
            Concierge boundary that owns policy decisions.
          </p>
        </div>
        <div className="status-panel">
          <span className="status-pill">Roadmap: Phase 1</span>
          <dl className="metric-list">
            <div>
              <dt>Relay Surface</dt>
              <dd>Single operator deployment</dd>
            </div>
            <div>
              <dt>Media</dt>
              <dd>Geohash-scoped room model</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>Concierge as source of truth</dd>
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
    </div>
  );
}
