import { useEffect, useState } from "react";
import { NavLink, Outlet, useSearchParams } from "react-router-dom";

import { AppStateProvider } from "../app-state";
import { CallOverlay } from "../components/call-overlay";
import { ErrorBoundary } from "../components/error-boundary";
import { useNarrowViewport } from "../hooks/use-viewport";

const navItems = [
  { to: "/app", label: "World", end: true },
  { to: "/app/chats", label: "Chats" },
  { to: "/app/pulse", label: "Pulse" },
  { to: "/app/settings", label: "Settings" }
];

export type AppShellOutletContext = {
  mobileChatsResetToken: number;
};

export function AppShell() {
  return (
    <AppStateProvider>
      <AppShellLayout />
    </AppStateProvider>
  );
}

function AppShellLayout() {
  const [searchParams] = useSearchParams();
  const isNarrowViewport = useNarrowViewport();
  const [rememberedBeaconGeohash, setRememberedBeaconGeohash] = useState(() => searchParams.get("beacon") ?? "");
  const [mobileChatsResetToken, setMobileChatsResetToken] = useState(0);

  useEffect(() => {
    const selectedBeaconGeohash = searchParams.get("beacon");
    if (selectedBeaconGeohash) {
      setRememberedBeaconGeohash(selectedBeaconGeohash);
    }
  }, [searchParams]);

  const preservedSearch = rememberedBeaconGeohash ? `?beacon=${encodeURIComponent(rememberedBeaconGeohash)}` : "";
  const resolveNavSearch = (pathname: string) => {
    if (isNarrowViewport && (pathname === "/app" || pathname === "/app/chats")) {
      return "";
    }

    return preservedSearch;
  };

  function handleNavItemClick(pathname: string) {
    if (isNarrowViewport && pathname === "/app/chats") {
      setMobileChatsResetToken((current) => current + 1);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-brand">
          <h1 className="app-bar-title">Synchrono.City</h1>
        </div>
        <nav className="app-nav app-nav-desktop" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={{
                pathname: item.to,
                search: resolveNavSearch(item.to)
              }}
              onClick={() => handleNavItemClick(item.to)}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="content">
        <ErrorBoundary>
          <Outlet context={{ mobileChatsResetToken } satisfies AppShellOutletContext} />
        </ErrorBoundary>
      </main>

      <div className="app-bottom-chrome">
        <CallOverlay />

        <nav className="app-nav app-nav-mobile" aria-label="Primary mobile">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={{
                pathname: item.to,
                search: resolveNavSearch(item.to)
              }}
              onClick={() => handleNavItemClick(item.to)}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
