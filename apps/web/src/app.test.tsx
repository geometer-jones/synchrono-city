import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppShell } from "./routes/app-shell";
import { ChatsRoute } from "./routes/chats-route";
import { PulseRoute } from "./routes/pulse-route";
import { SettingsRoute } from "./routes/settings-route";
import { SplashRoute } from "./routes/splash-route";
import { WorldRoute } from "./routes/world-route";

function renderRouter(entry: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<SplashRoute />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<WorldRoute />} />
          <Route path="chats" element={<ChatsRoute />} />
          <Route path="pulse" element={<PulseRoute />} />
          <Route path="settings" element={<SettingsRoute />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

describe("app shell", () => {
  it("renders the splash route", () => {
    renderRouter("/");

    expect(screen.getByRole("button", { name: /enter the city/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /host your own/i })).toBeInTheDocument();
  });

  it("renders the world route with place metadata", () => {
    renderRouter("/app");

    expect(
      screen.getByRole("heading", { name: /map-native coordination for sovereign communities/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /world places/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /civic plaza · 9q8yyk/i })).toBeInTheDocument();
  });

  it("joins a geohash-scoped room from world and shows the global call overlay", async () => {
    const { user } = renderRouter("/app");

    await user.click(screen.getAllByRole("button", { name: /join room/i })[0]);

    expect((await screen.findAllByText(/geo:npub1operator:9q8yyk/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /leave room/i })).toBeInTheDocument();
  });

  it("publishes a place note from chats and exposes it in pulse", async () => {
    const { user } = renderRouter("/app/chats?geohash=9q8yyk");

    await user.type(screen.getByPlaceholderText(/add a place note for everyone in this tile/i), "Meet at the fountain in five.");
    await user.click(screen.getByRole("button", { name: /publish note/i }));

    expect(await screen.findByText(/meet at the fountain in five\./i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /open in pulse/i })[0]);

    expect(await screen.findByRole("heading", { name: /relay feed projection/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/meet at the fountain in five\./i)).length).toBeGreaterThan(0);
  });

  it("opens a participant profile in pulse", async () => {
    const { user } = renderRouter("/app/chats?geohash=9q8yym");

    await user.click(screen.getByRole("button", { name: /view profile/i }));

    expect(await screen.findByRole("heading", { name: /relay feed projection/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /mika hart/i })).toBeInTheDocument();
  });

  it("renders the settings route", () => {
    renderRouter("/app/settings");

    expect(screen.getByRole("heading", { name: /relay admin/i })).toBeInTheDocument();
  });
});
