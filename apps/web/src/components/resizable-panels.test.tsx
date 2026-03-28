import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResizablePanels } from "./resizable-panels";

function mockRect(width: number, height = 720): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({})
  } as DOMRect;
}

describe("ResizablePanels", () => {
  const originalLocalStorage = window.localStorage;

  beforeEach(() => {
    document.body.className = "";
    const storage = new Map<string, string>();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        }
      }
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => mockRect(1000));
  });

  afterEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
    vi.restoreAllMocks();
  });

  it("loads a persisted panel width from localStorage", () => {
    window.localStorage.setItem("synchrono-city.resizable-panels.world.v1", "420");

    const { container } = render(
      <ResizablePanels
        className="test-panels"
        storageKey="world"
        defaultPrimarySize={320}
        minPrimarySize={240}
        minSecondarySize={300}
        handleLabel="Resize world panels"
        primary={<div>Map</div>}
        secondary={<aside>Chat</aside>}
      />
    );

    expect(container.querySelector(".test-panels")).toHaveStyle({
      gridTemplateColumns: "420px 8px minmax(300px, 1fr)"
    });
    expect(screen.getByRole("separator", { name: "Resize world panels" })).toHaveAttribute("aria-valuenow", "420");
  });

  it("stores the resized width from keyboard resizing and restores it on the next mount", async () => {
    const { container, unmount } = render(
      <ResizablePanels
        className="test-panels"
        storageKey="chats"
        defaultPrimarySize={320}
        minPrimarySize={240}
        minSecondarySize={300}
        handleLabel="Resize chats panels"
        primary={<div>Threads</div>}
        secondary={<aside>Detail</aside>}
      />
    );

    const separator = screen.getByRole("separator", { name: "Resize chats panels" });

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "ArrowRight" });

    await waitFor(() => {
      expect(container.querySelector(".test-panels")).toHaveStyle({
        gridTemplateColumns: "392px 8px minmax(300px, 1fr)"
      });
    });

    expect(window.localStorage.getItem("synchrono-city.resizable-panels.chats.v1")).toBe("392");
    expect(document.body).not.toHaveClass("is-resizing-panels");

    unmount();

    const { container: nextContainer } = render(
      <ResizablePanels
        className="test-panels"
        storageKey="chats"
        defaultPrimarySize={320}
        minPrimarySize={240}
        minSecondarySize={300}
        handleLabel="Resize chats panels"
        primary={<div>Threads</div>}
        secondary={<aside>Detail</aside>}
      />
    );

    expect(nextContainer.querySelector(".test-panels")).toHaveStyle({
      gridTemplateColumns: "392px 8px minmax(300px, 1fr)"
    });
  });
});
