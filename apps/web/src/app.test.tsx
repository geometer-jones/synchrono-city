import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppShell } from "./routes/app-shell";
import { ChatsRoute } from "./routes/chats-route";
import { PulseRoute } from "./routes/pulse-route";
import { SettingsRoute } from "./routes/settings-route";
import { WorldRoute } from "./routes/world-route";

function renderRoute(entry: string, childPath: string | undefined, element: React.JSX.Element) {
  const childRoute = childPath ? { path: childPath, element } : { index: true, element };
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [childRoute]
      }
    ],
    { initialEntries: [entry] }
  );

  render(<RouterProvider router={router} />);
}

describe("app shell", () => {
  it("renders the world route with roadmap content", () => {
    renderRoute("/", undefined, <WorldRoute />);

    expect(
      screen.getByRole("heading", { name: /map-native coordination for sovereign communities/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /relay health score/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate story export/i })).toBeInTheDocument();
  });

  it("renders the chats route", () => {
    renderRoute("/chats", "chats", <ChatsRoute />);

    expect(screen.getByRole("heading", { name: /place-scoped note stacks/i })).toBeInTheDocument();
  });

  it("renders the pulse route", () => {
    renderRoute("/pulse", "pulse", <PulseRoute />);

    expect(screen.getByRole("heading", { name: /relay feed projection/i })).toBeInTheDocument();
  });

  it("renders the settings route", () => {
    renderRoute("/settings", "settings", <SettingsRoute />);

    expect(screen.getByRole("heading", { name: /relay admin/i })).toBeInTheDocument();
  });
});
