import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mapboxMocks = vi.hoisted(() => {
  const instances: Array<{
    addLayer: ReturnType<typeof vi.fn>;
    addSource: ReturnType<typeof vi.fn>;
    easeTo: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    getBounds: ReturnType<typeof vi.fn>;
    getCanvas: ReturnType<typeof vi.fn>;
    getCanvasContainer: ReturnType<typeof vi.fn>;
    getCenter: ReturnType<typeof vi.fn>;
    getLayer: ReturnType<typeof vi.fn>;
    getZoom: ReturnType<typeof vi.fn>;
    getSource: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    project: ReturnType<typeof vi.fn>;
    queryRenderedFeatures: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }> = [];

  const Map = vi.fn().mockImplementation(() => {
    const layers = new Set<string>();
    const sources = new globalThis.Map<
      string,
      {
        setData: ReturnType<typeof vi.fn>;
      }
    >();
    const canvas = {
      style: { cursor: "" },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      removeEventListener: vi.fn()
    };
    const canvasContainer = {
      dispatchEvent: vi.fn()
    };

    const instance = {
      addLayer: vi.fn((layer: { id: string }) => {
        layers.add(layer.id);
      }),
      addSource: vi.fn((id: string) => {
        sources.set(id, {
          setData: vi.fn()
        });
      }),
      easeTo: vi.fn(),
      fitBounds: vi.fn(),
      getBounds: vi.fn(() => ({
        getEast: vi.fn(() => -122.1),
        getNorth: vi.fn(() => 37.9),
        getSouth: vi.fn(() => 37.7),
        getWest: vi.fn(() => -122.5)
      })),
      getCanvas: vi.fn(() => canvas),
      getCanvasContainer: vi.fn(() => canvasContainer),
      getCenter: vi.fn(() => ({ lng: -122.4194, lat: 37.7749 })),
      getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
      getZoom: vi.fn(() => 11.5),
      getSource: vi.fn((id: string) => sources.get(id)),
      on: vi.fn((event: string, layerOrHandler: string | (() => void), handler?: () => void) => {
        if (event === "load" && typeof layerOrHandler === "function") {
          queueMicrotask(() => {
            layerOrHandler();
          });
        }

        return handler;
      }),
      project: vi.fn(() => ({ x: 120, y: 160 })),
      queryRenderedFeatures: vi.fn(() => []),
      remove: vi.fn()
    };

    instances.push(instance);
    return instance;
  });

  class LngLatBounds {
    extend = vi.fn();
  }

  return {
    instances,
    LngLatBounds,
    Map
  };
});

vi.mock("mapbox-gl", () => ({
  default: {
    Map: mapboxMocks.Map,
    LngLatBounds: mapboxMocks.LngLatBounds,
    accessToken: ""
  }
}));

function createLocalStorageMock() {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => {
      storage.clear();
    }),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    get length() {
      return storage.size;
    }
  };
}

describe("MapPreview", () => {
  beforeEach(() => {
    vi.resetModules();
    mapboxMocks.instances.length = 0;
    mapboxMocks.Map.mockClear();
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "test-token");
    vi.stubEnv("VITE_MAPBOX_STYLE_URL", "mapbox://styles/test/style");

    const localStorageMock = createLocalStorageMock();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("keeps the same map instance when the selection handler changes", async () => {
    const { MapPreview } = await import("./map-preview");
    const initialSelectTile = vi.fn();
    const nextSelectTile = vi.fn();
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    const { rerender } = render(<MapPreview tiles={tiles} onSelectTile={initialSelectTile} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    mapInstance.easeTo.mockClear();

    rerender(<MapPreview tiles={tiles} selectedGeohash="9q8yyk" onSelectTile={nextSelectTile} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const backgroundClickRegistration = mapInstance.on.mock.calls.find(
      ([event, layerOrHandler]) => event === "click" && typeof layerOrHandler === "function"
    );

    expect(backgroundClickRegistration).toBeDefined();

    const backgroundClickHandler = backgroundClickRegistration?.[1] as (event: {
      lngLat: { lat: number; lng: number };
      point: object;
    }) => void;

    backgroundClickHandler({
      lngLat: { lat: 37.7749, lng: -122.4194 },
      point: {}
    });

    expect(initialSelectTile).not.toHaveBeenCalled();
    expect(nextSelectTile).toHaveBeenCalledTimes(1);
    const clickedGeohash = nextSelectTile.mock.calls[0]?.[0];
    expect(clickedGeohash).toHaveLength(8);

    mapInstance.easeTo.mockClear();
    rerender(<MapPreview tiles={tiles} selectedGeohash={clickedGeohash} onSelectTile={nextSelectTile} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });
  });

  it("recenters the viewport when a place is selected", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    const { rerender } = render(<MapPreview tiles={tiles} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    mapInstance.easeTo.mockClear();

    rerender(<MapPreview tiles={tiles} selectedGeohash="9q8yyk" />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    expect(mapInstance.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: expect.any(Array),
        duration: 320,
        essential: true
      })
    );
  });

  it("recenters the selected place again when the focus request changes", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    const { rerender } = render(<MapPreview tiles={tiles} selectedGeohash="9q8yyk" />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];

    await waitFor(() => {
      expect(mapInstance.easeTo).toHaveBeenCalledTimes(1);
    });

    mapInstance.easeTo.mockClear();

    rerender(<MapPreview tiles={tiles} selectedGeohash="9q8yyk" focusRequestKey="focus-1" />);

    await waitFor(() => {
      expect(mapInstance.easeTo).toHaveBeenCalledTimes(1);
    });

    expect(mapInstance.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: expect.any(Array),
        duration: 320,
        essential: true
      })
    );
  });

  it("does not fit the viewport after a background click creates the first visible tile", async () => {
    const { MapPreview } = await import("./map-preview");
    const onSelectTile = vi.fn();
    const { rerender } = render(<MapPreview tiles={[]} onSelectTile={onSelectTile} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    const backgroundClickRegistration = mapInstance.on.mock.calls.find(
      ([event, layerOrHandler]) => event === "click" && typeof layerOrHandler === "function"
    );

    expect(backgroundClickRegistration).toBeDefined();

    const backgroundClickHandler = backgroundClickRegistration?.[1] as (event: {
      lngLat: { lat: number; lng: number };
      point: object;
    }) => void;

    mapInstance.fitBounds.mockClear();

    backgroundClickHandler({
      lngLat: { lat: 37.7749, lng: -122.4194 },
      point: {}
    });

    const clickedGeohash = onSelectTile.mock.calls[0]?.[0] as string;
    rerender(
      <MapPreview
        tiles={[
          {
            geohash: clickedGeohash,
            title: "Selected place",
            roomID: `geo:npub1operator:${clickedGeohash}`,
            latestNote: "",
            noteCount: 0,
            participants: ["npub1aurora"]
          }
        ]}
        selectedGeohash={clickedGeohash}
        activeGeohash={clickedGeohash}
        onSelectTile={onSelectTile}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("restores the saved map viewport on mount", async () => {
    window.localStorage.setItem(
      "synchrono-city.world-map.viewport.v1",
      JSON.stringify({
        center: [-73.9857, 40.7484],
        zoom: 13.25,
        bounds: {
          west: -74.01,
          south: 40.73,
          east: -73.96,
          north: 40.76
        }
      })
    );

    const { MapPreview } = await import("./map-preview");
    render(
      <MapPreview
        tiles={[
          {
            geohash: "dr5ru7k2",
            title: "Midtown",
            roomID: "geo:npub1operator:dr5ru7k2",
            latestNote: "Meet at the plaza.",
            noteCount: 1,
            participants: ["npub1aurora"]
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    expect(mapboxMocks.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-73.9857, 40.7484],
        zoom: 13.25
      })
    );

    const mapInstance = mapboxMocks.instances[0];
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
  });

  it("persists the current map viewport after movement", async () => {
    const { MapPreview } = await import("./map-preview");
    render(<MapPreview tiles={[]} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    mapInstance.getCenter.mockReturnValue({ lng: -73.9857, lat: 40.7484 });
    mapInstance.getZoom.mockReturnValue(13.25);
    mapInstance.getBounds.mockReturnValue({
      getEast: () => -73.96,
      getNorth: () => 40.76,
      getSouth: () => 40.73,
      getWest: () => -74.01
    });

    const moveEndRegistration = mapInstance.on.mock.calls.find(
      ([event, layerOrHandler]) => event === "moveend" && typeof layerOrHandler === "function"
    );

    expect(moveEndRegistration).toBeDefined();

    const moveEndHandler = moveEndRegistration?.[1] as () => void;
    moveEndHandler();

    expect(JSON.parse(window.localStorage.getItem("synchrono-city.world-map.viewport.v1") ?? "null")).toEqual({
      center: [-73.9857, 40.7484],
      zoom: 13.25,
      bounds: {
        west: -74.01,
        south: 40.73,
        east: -73.96,
        north: 40.76
      }
    });
  });

  it("routes background clicks through the dedicated background selection handler", async () => {
    const { MapPreview } = await import("./map-preview");
    const onSelectTile = vi.fn();
    const onBackgroundSelectTile = vi.fn();

    render(
      <MapPreview
        tiles={[]}
        onSelectTile={onSelectTile}
        onBackgroundSelectTile={onBackgroundSelectTile}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    const backgroundClickRegistration = mapInstance.on.mock.calls.find(
      ([event, layerOrHandler]) => event === "click" && typeof layerOrHandler === "function"
    );

    expect(backgroundClickRegistration).toBeDefined();

    const backgroundClickHandler = backgroundClickRegistration?.[1] as (event: {
      lngLat: { lat: number; lng: number };
      point: object;
    }) => void;

    backgroundClickHandler({
      lngLat: { lat: 37.7749, lng: -122.4194 },
      point: {}
    });

    expect(onBackgroundSelectTile).toHaveBeenCalledTimes(1);
    expect(onBackgroundSelectTile.mock.calls[0]?.[0]).toHaveLength(8);
    expect(onSelectTile).not.toHaveBeenCalled();
  });

  it("keeps the same map instance when rerendered with equivalent tile data", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    const { rerender } = render(<MapPreview tiles={tiles} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    const nextTiles = tiles.map((tile) => ({
      ...tile,
      participants: [...tile.participants]
    }));

    rerender(<MapPreview tiles={nextTiles} selectedGeohash="9q8yyk" />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    expect(mapInstance.remove).not.toHaveBeenCalled();
  });

  it("renders a newly created beacon marker even before it has notes or participants", async () => {
    const { MapPreview } = await import("./map-preview");

    render(
      <MapPreview
        tiles={[
          {
            geohash: "9q8yyk34",
            title: "Lantern Point",
            roomID: "geo:npub1operator:9q8yyk34",
            latestNote: "",
            noteCount: 0,
            participants: []
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const marker = screen.getByRole("button", {
      name: /lantern point 9q8yyk34 has 0 notes and 0 live participants/i
    });

    expect(marker).toBeInTheDocument();
  });

  it("forwards wheel zoom from markers and marker cards to the map container", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    const { container, getByText } = render(
      <MapPreview
        tiles={tiles}
        markerCards={[
          {
            geohash: "9q8yyk",
            content: <article>Marker details</article>
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapContainer = container.querySelector(".mapbox-canvas");
    const marker = container.querySelector(".tile-marker");
    const markerCard = getByText("Marker details").closest(".marker-card-anchor");

    expect(mapContainer).not.toBeNull();
    expect(marker).not.toBeNull();
    expect(markerCard).not.toBeNull();

    const mapInstance = mapboxMocks.instances[0];
    const canvasContainer = mapInstance.getCanvasContainer();
    const canvas = mapInstance.getCanvas();
    const dispatchEventSpy = vi.spyOn(canvasContainer, "dispatchEvent");
    const rootDispatchEventSpy = vi.spyOn(mapContainer!, "dispatchEvent");
    const canvasDispatchEventSpy = vi.spyOn(canvas, "dispatchEvent");

    fireEvent.wheel(marker!, {
      deltaY: -120,
      clientX: 25,
      clientY: 40
    });

    fireEvent.wheel(markerCard!, {
      deltaY: 120,
      clientX: 30,
      clientY: 45
    });

    expect(dispatchEventSpy).toHaveBeenCalledTimes(2);
    expect(rootDispatchEventSpy).not.toHaveBeenCalled();
    expect(canvasDispatchEventSpy).not.toHaveBeenCalled();

    const markerWheelEvent = dispatchEventSpy.mock.calls[0]?.[0] as WheelEvent;
    expect(markerWheelEvent).toBeInstanceOf(WheelEvent);
    expect(markerWheelEvent.deltaY).toBe(-120);

    const cardWheelEvent = dispatchEventSpy.mock.calls[1]?.[0] as WheelEvent;
    expect(cardWheelEvent).toBeInstanceOf(WheelEvent);
    expect(cardWheelEvent.deltaY).toBe(120);
  });

  it("does not forward wheel zoom when marker card content can scroll", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    render(
      <MapPreview
        tiles={tiles}
        markerCards={[
          {
            geohash: "9q8yyk",
            content: (
              <article>
                <div data-testid="scroll-region" style={{ maxHeight: "48px", overflowY: "auto" }}>
                  Marker details repeated. Marker details repeated. Marker details repeated. Marker details repeated.
                </div>
              </article>
            )
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const mapInstance = mapboxMocks.instances[0];
    const canvasContainer = mapInstance.getCanvasContainer();
    const dispatchEventSpy = vi.spyOn(canvasContainer, "dispatchEvent");
    const scrollRegion = screen.getByTestId("scroll-region");

    Object.defineProperty(scrollRegion, "clientHeight", {
      configurable: true,
      value: 48
    });
    Object.defineProperty(scrollRegion, "scrollHeight", {
      configurable: true,
      value: 144
    });
    Object.defineProperty(scrollRegion, "scrollTop", {
      configurable: true,
      writable: true,
      value: 24
    });

    fireEvent.wheel(scrollRegion, {
      deltaY: 120,
      clientX: 30,
      clientY: 45
    });

    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  it("selects a marker geohash on pointer down without double-firing on click", async () => {
    const { MapPreview } = await import("./map-preview");
    const onSelectTile = vi.fn();
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      }
    ];

    render(<MapPreview tiles={tiles} onSelectTile={onSelectTile} />);

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const marker = screen.getByRole("button", {
      name: /civic plaza 9q8yyk has 3 notes and 1 live participants/i
    });

    fireEvent.pointerDown(marker, {
      button: 0,
      pointerType: "mouse"
    });
    fireEvent.click(marker, {
      detail: 1
    });

    expect(onSelectTile).toHaveBeenCalledTimes(1);
    expect(onSelectTile).toHaveBeenCalledWith("9q8yyk");
  });

  it("raises the clicked place pair without demoting other card stacks", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      },
      {
        geohash: "9q8yym",
        title: "Warehouse Annex",
        roomID: "geo:npub1operator:9q8yym",
        latestNote: "Doors are open.",
        noteCount: 2,
        participants: ["npub1mika"]
      },
      {
        geohash: "9q8yyt",
        title: "Audio Fallback",
        roomID: "geo:npub1operator:9q8yyt",
        latestNote: "Channel check.",
        noteCount: 1,
        participants: ["npub1soren"]
      }
    ];

    render(
      <MapPreview
        tiles={tiles}
        markerCards={[
          {
            geohash: "9q8yyk",
            ariaLabel: "Marker card Civic Plaza",
            content: <article>Civic Plaza details</article>
          },
          {
            geohash: "9q8yym",
            ariaLabel: "Marker card Warehouse Annex",
            content: <article>Warehouse Annex details</article>
          },
          {
            geohash: "9q8yyt",
            ariaLabel: "Marker card Audio Fallback",
            content: <article>Audio Fallback details</article>
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const civicMarker = screen.getByRole("button", {
      name: /civic plaza 9q8yyk has 3 notes and 1 live participants/i
    });
    const warehouseMarker = screen.getByRole("button", {
      name: /warehouse annex 9q8yym has 2 notes and 1 live participants/i
    });
    const audioMarker = screen.getByRole("button", {
      name: /audio fallback 9q8yyt has 1 notes and 1 live participants/i
    });
    const civicCardElement = screen.getByLabelText(/marker card civic plaza/i);
    const warehouseCardElement = screen.getByLabelText(/marker card warehouse annex/i);
    const audioCardElement = screen.getByLabelText(/marker card audio fallback/i);
    const civicCard = civicCardElement.closest(".marker-card-anchor");
    const warehouseCard = warehouseCardElement.closest(".marker-card-anchor");
    const audioCard = audioCardElement.closest(".marker-card-anchor");

    expect(civicCard).not.toBeNull();
    expect(warehouseCard).not.toBeNull();
    expect(audioCard).not.toBeNull();

    fireEvent.pointerDown(civicMarker);

    expect(civicMarker).toHaveStyle({ zIndex: "12" });
    expect(civicCard).toHaveStyle({ zIndex: "11" });
    expect(warehouseMarker).toHaveStyle({ zIndex: "6" });
    expect(warehouseCard).toHaveStyle({ zIndex: "5" });
    expect(audioMarker).toHaveStyle({ zIndex: "9" });
    expect(audioCard).toHaveStyle({ zIndex: "8" });

    fireEvent.pointerDown(warehouseCardElement);

    expect(civicMarker).toHaveStyle({ zIndex: "12" });
    expect(civicCard).toHaveStyle({ zIndex: "11" });
    expect(warehouseMarker).toHaveStyle({ zIndex: "15" });
    expect(warehouseCard).toHaveStyle({ zIndex: "14" });
    expect(audioMarker).toHaveStyle({ zIndex: "9" });
    expect(audioCard).toHaveStyle({ zIndex: "8" });

    fireEvent.pointerDown(warehouseMarker);

    expect(civicMarker).toHaveStyle({ zIndex: "12" });
    expect(civicCard).toHaveStyle({ zIndex: "11" });
    expect(warehouseMarker).toHaveStyle({ zIndex: "15" });
    expect(warehouseCard).toHaveStyle({ zIndex: "14" });
    expect(audioMarker).toHaveStyle({ zIndex: "9" });
    expect(audioCard).toHaveStyle({ zIndex: "8" });
  });

  it("raises the selected place pair when selection comes from props", async () => {
    const { MapPreview } = await import("./map-preview");
    const tiles = [
      {
        geohash: "9q8yyk",
        title: "Civic Plaza",
        roomID: "geo:npub1operator:9q8yyk",
        latestNote: "Meet at the fountain.",
        noteCount: 3,
        participants: ["npub1aurora"]
      },
      {
        geohash: "9q8yym",
        title: "Warehouse Annex",
        roomID: "geo:npub1operator:9q8yym",
        latestNote: "Doors are open.",
        noteCount: 2,
        participants: ["npub1mika"]
      }
    ];

    const { rerender } = render(
      <MapPreview
        tiles={tiles}
        markerCards={[
          {
            geohash: "9q8yyk",
            ariaLabel: "Marker card Civic Plaza",
            content: <article>Civic Plaza details</article>
          },
          {
            geohash: "9q8yym",
            ariaLabel: "Marker card Warehouse Annex",
            content: <article>Warehouse Annex details</article>
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(mapboxMocks.Map).toHaveBeenCalledTimes(1);
    });

    const civicMarker = screen.getByRole("button", {
      name: /civic plaza 9q8yyk has 3 notes and 1 live participants/i
    });
    const warehouseMarker = screen.getByRole("button", {
      name: /warehouse annex 9q8yym has 2 notes and 1 live participants/i
    });
    const civicCard = screen.getByLabelText(/marker card civic plaza/i).closest(".marker-card-anchor");
    const warehouseCard = screen.getByLabelText(/marker card warehouse annex/i).closest(".marker-card-anchor");

    expect(civicCard).not.toBeNull();
    expect(warehouseCard).not.toBeNull();

    rerender(
      <MapPreview
        tiles={tiles}
        selectedGeohash="9q8yyk"
        markerCards={[
          {
            geohash: "9q8yyk",
            ariaLabel: "Marker card Civic Plaza",
            content: <article>Civic Plaza details</article>
          },
          {
            geohash: "9q8yym",
            ariaLabel: "Marker card Warehouse Annex",
            content: <article>Warehouse Annex details</article>
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(civicMarker).toHaveStyle({ zIndex: "10" });
    });

    expect(civicCard).toHaveStyle({ zIndex: "8" });
    expect(warehouseMarker).toHaveStyle({ zIndex: "6" });
    expect(warehouseCard).toHaveStyle({ zIndex: "5" });
  });
});
