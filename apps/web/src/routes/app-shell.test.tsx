import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../styles.css";
import { AppShell } from "./app-shell";

vi.mock("../app-state", () => ({
  AppStateProvider: ({ children }: { children: ReactNode }) => children
}));

vi.mock("../components/call-overlay", () => ({
  CallOverlay: () => null
}));

function findMediaRule(conditionText: string) {
  for (const styleSheet of Array.from(document.styleSheets)) {
    const cssRules = Array.from(styleSheet.cssRules);

    for (const rule of cssRules) {
      if (rule instanceof CSSMediaRule && rule.conditionText === conditionText) {
        return rule;
      }
    }
  }

  return null;
}

function findNestedStyleRule(mediaRule: CSSMediaRule, selectorText: string) {
  for (const rule of Array.from(mediaRule.cssRules)) {
    if (rule instanceof CSSStyleRule && rule.selectorText === selectorText) {
      return rule;
    }
  }

  return null;
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="route-location">{`${location.pathname}${location.search}`}</div>;
}

function PulseRouteFixture() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate("/app/pulse?profile=npub1pulse")}>
        Open profile
      </button>
      <LocationProbe />
    </>
  );
}

describe("AppShell", () => {
  it("does not reserve a layout box for bottom chrome when the mobile tab bar is absent", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<div data-testid="route-content">world</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const bottomChrome = container.querySelector(".app-bottom-chrome");

    expect(bottomChrome).not.toBeNull();
    expect(getComputedStyle(bottomChrome as Element).display).toBe("contents");
  });

  it("keeps the shell full width and moves narrow-screen inset spacing to the bottom chrome", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<div data-testid="route-content">world</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const narrowRule = findMediaRule("(max-width: 860px)");

    expect(narrowRule).not.toBeNull();

    const appShellRule = findNestedStyleRule(narrowRule as CSSMediaRule, ".app-shell");
    const bottomChromeRule = findNestedStyleRule(narrowRule as CSSMediaRule, ".app-bottom-chrome");

    expect(appShellRule).not.toBeNull();
    expect(bottomChromeRule).not.toBeNull();
    expect(appShellRule?.style.getPropertyValue("width")).toBe("100%");
    expect(appShellRule?.style.getPropertyValue("max-width")).toBe("100%");
    expect(appShellRule?.style.getPropertyValue("padding-bottom")).toBe("0");
    expect(bottomChromeRule?.style.getPropertyValue("display")).toBe("grid");
    expect(bottomChromeRule?.style.getPropertyValue("padding")).toBe("0 var(--shell-chrome-padding-inline) 12px");
  });

  it("tightens the mobile nav spacing for very narrow screens", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<div data-testid="route-content">world</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const veryNarrowRule = findMediaRule("(max-width: 480px)");

    expect(veryNarrowRule).not.toBeNull();

    const mobileNavRule = findNestedStyleRule(veryNarrowRule as CSSMediaRule, ".app-nav-mobile");
    const mobileNavLinkRule = findNestedStyleRule(veryNarrowRule as CSSMediaRule, ".app-nav-mobile .nav-link");

    expect(mobileNavRule).not.toBeNull();
    expect(mobileNavLinkRule).not.toBeNull();
    expect(mobileNavRule?.style.getPropertyValue("gap")).toBe("6px");
    expect(mobileNavRule?.style.getPropertyValue("padding")).toBe("8px");
    expect(mobileNavLinkRule?.style.getPropertyValue("padding")).toBe("8px 6px");
    expect(mobileNavLinkRule?.style.getPropertyValue("font-size")).toBe("0.84rem");
  });

  it("preserves the selected beacon when switching tabs", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route
              index
              element={
                <>
                  <div>world</div>
                  <LocationProbe />
                </>
              }
            />
            <Route
              path="chats"
              element={
                <>
                  <div>chats</div>
                  <LocationProbe />
                </>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("route-location")).toHaveTextContent("/app?beacon=9q8yyk12");

    await user.click(screen.getAllByRole("link", { name: "Chats" })[0]);
    expect(screen.getByTestId("route-location")).toHaveTextContent("/app/chats?beacon=9q8yyk12");

    await user.click(screen.getAllByRole("link", { name: "World" })[0]);
    expect(screen.getByTestId("route-location")).toHaveTextContent("/app?beacon=9q8yyk12");
  });

  it("keeps the remembered beacon even when another tab replaces its own query string", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route
              index
              element={
                <>
                  <div>world</div>
                  <LocationProbe />
                </>
              }
            />
            <Route path="pulse" element={<PulseRouteFixture />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getAllByRole("link", { name: "Pulse" })[0]);
    expect(screen.getByTestId("route-location")).toHaveTextContent("/app/pulse?beacon=9q8yyk12");

    await user.click(screen.getByRole("button", { name: "Open profile" }));
    expect(screen.getByTestId("route-location")).toHaveTextContent("/app/pulse?profile=npub1pulse");

    await user.click(screen.getAllByRole("link", { name: "World" })[0]);
    expect(screen.getByTestId("route-location")).toHaveTextContent("/app?beacon=9q8yyk12");
  });
});
