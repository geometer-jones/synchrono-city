import { describe, expect, it } from "vitest";
import {
  buildCrossRelayFeedItemsFromNotes,
  buildPulseFeedItems,
  mergeCrossRelayFeedItems,
  type CrossRelayFeedItem,
  formatPlaceHeading,
  type GeoNote,
  isBeaconThreadNote,
  listPulseLocalNotes,
  listNotesForPlace,
  pulseNetworkGeohash,
  pulseNetworkPlaceTitle,
  type ParticipantProfile,
  type Place
} from "./data";

function makePlace(geohash: string, title: string): Place {
  return {
    geohash,
    title,
    neighborhood: "Test neighborhood",
    description: "Test description",
    activitySummary: "Test activity",
    tags: ["test"],
    capacity: 10,
    occupantPubkeys: [],
    unread: false
  };
}

function makeNote(id: string, geohash: string, authorPubkey: string, createdAt: string): GeoNote {
  return {
    id,
    geohash,
    authorPubkey,
    content: `Note content for ${id}`,
    createdAt,
    replies: 0
  };
}

function makeProfile(pubkey: string, displayName: string): ParticipantProfile {
  return {
    pubkey,
    displayName,
    role: "member",
    status: "active",
    bio: "Test bio",
    mic: false,
    cam: false,
    screenshare: false,
    deafen: false
  };
}

function makeCrossRelayItem(
  id: string,
  sourceLabel: "Direct follow" | "Relay list",
  publishedAt: string
): CrossRelayFeedItem {
  return {
    id,
    relayName: `Relay ${id}`,
    relayUrl: `wss://relay-${id}.example`,
    authorPubkey: `npub1${id}`,
    authorName: `Author ${id}`,
    geohash: "9q8yyk",
    placeTitle: "Test place",
    content: `Cross-relay content for ${id}`,
    publishedAt,
    sourceLabel,
    whyVisible: `Why visible for ${id}`
  };
}

describe("buildPulseFeedItems", () => {
  it("returns empty array when given empty inputs", () => {
    const result = buildPulseFeedItems([]);
    expect(result).toEqual([]);
  });

  it("maps cross-relay items with Direct follow to Following lane", () => {
    const remoteItems = [makeCrossRelayItem("remote-1", "Direct follow", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems(remoteItems);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pulse-remote-remote-1",
      lane: "Following"
    });
  });

  it("maps cross-relay items with Relay list to For You lane", () => {
    const remoteItems = [makeCrossRelayItem("remote-1", "Relay list", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems(remoteItems);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      lane: "For You"
    });
  });

  it("maps relay-list items by followed authors into the Following lane", () => {
    const remoteItems = [makeCrossRelayItem("remote-1", "Relay list", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems(remoteItems, ["npub1remote-1"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      lane: "Following"
    });
  });

  it("sorts items by publishedAt descending", () => {
    const remoteItems = [
      makeCrossRelayItem("remote-new", "Relay list", "2026-03-18T19:00:00Z"),
      makeCrossRelayItem("remote-mid", "Relay list", "2026-03-18T18:00:00Z"),
      makeCrossRelayItem("remote-old", "Relay list", "2026-03-18T17:00:00Z")
    ];

    const result = buildPulseFeedItems(remoteItems);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("pulse-remote-remote-new"); // 19:00
    expect(result[1].id).toBe("pulse-remote-remote-mid"); // 18:00
    expect(result[2].id).toBe("pulse-remote-remote-old"); // 17:00
  });

  it("collapses bursty posts from the same author, relay, and place into one feed item", () => {
    const remoteItems = [
      {
        ...makeCrossRelayItem("remote-new", "Relay list", "2026-03-18T19:00:00Z"),
        relayName: "Mission Mesh",
        relayUrl: "wss://mission-mesh.example/relay",
        authorPubkey: "npub1shared",
        authorName: "Shared Author",
        geohash: "9q8yyk",
        placeTitle: "Civic plaza",
        content: "Latest burst update"
      },
      {
        ...makeCrossRelayItem("remote-mid", "Relay list", "2026-03-18T18:30:00Z"),
        relayName: "Mission Mesh",
        relayUrl: "wss://mission-mesh.example/relay",
        authorPubkey: "npub1shared",
        authorName: "Shared Author",
        geohash: "9q8yyk",
        placeTitle: "Civic plaza",
        content: "Earlier burst update"
      },
      {
        ...makeCrossRelayItem("remote-old", "Relay list", "2026-03-18T16:30:00Z"),
        relayName: "Mission Mesh",
        relayUrl: "wss://mission-mesh.example/relay",
        authorPubkey: "npub1shared",
        authorName: "Shared Author",
        geohash: "9q8yyk",
        placeTitle: "Civic plaza",
        content: "Separate older update"
      }
    ];

    const result = buildPulseFeedItems(remoteItems);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "pulse-remote-remote-new",
      content: "Latest burst update",
      postCount: 2
    });
    expect(result[0].posts.map((post) => post.id)).toEqual(["remote-new", "remote-mid"]);
    expect(result[1]).toMatchObject({
      id: "pulse-remote-remote-old",
      postCount: 1
    });
  });

  it("ranks each 30-item lane batch by summed ranking signals without letting older batches jump ahead", () => {
    const remoteItems = Array.from({ length: 31 }, (_, index) => ({
      ...makeCrossRelayItem(`ranked-${index + 1}`, "Relay list", `2026-03-18T${String(19 - Math.floor(index / 60)).padStart(2, "0")}:${String(59 - index).padStart(2, "0")}:00Z`),
      authorPubkey: `npub1ranked${index + 1}`,
      authorName: `Ranked ${index + 1}`,
      zapCount: 0,
      engagementScore: 0,
      followGraphScore: 0,
      followerCount: 0
    }));

    remoteItems[0] = {
      ...remoteItems[0],
      id: "low-signal-newest",
      publishedAt: "2026-03-18T19:30:00Z",
      authorPubkey: "npub1newest",
      authorName: "Newest"
    };
    remoteItems[1] = {
      ...remoteItems[1],
      id: "high-signal-within-batch",
      publishedAt: "2026-03-18T19:29:00Z",
      authorPubkey: "npub1highsignal",
      authorName: "High Signal",
      zapCount: 10,
      engagementScore: 5,
      followGraphScore: 4,
      followerCount: 20
    };
    remoteItems[30] = {
      ...remoteItems[30],
      id: "older-batch-superstar",
      publishedAt: "2026-03-18T18:59:00Z",
      authorPubkey: "npub1olderbatch",
      authorName: "Older Batch",
      zapCount: 100,
      engagementScore: 100,
      followGraphScore: 100,
      followerCount: 100
    };

    const result = buildPulseFeedItems(remoteItems);

    expect(result[0]?.id).toBe("pulse-remote-high-signal-within-batch");
    expect(result.slice(0, 30).map((item) => item.id)).not.toContain("pulse-remote-older-batch-superstar");
    expect(result[30]?.id).toBe("pulse-remote-older-batch-superstar");
  });

  it("does not throw when a feed item is missing publishedAt", () => {
    const remoteItems = [
      {
        ...makeCrossRelayItem("remote-missing", "Relay list", "2026-03-18T18:00:00Z"),
        publishedAt: undefined as unknown as string
      },
      makeCrossRelayItem("remote-present", "Relay list", "2026-03-18T19:00:00Z")
    ];

    expect(() => buildPulseFeedItems(remoteItems)).not.toThrow();
    expect(buildPulseFeedItems(remoteItems)[0].id).toBe("pulse-remote-remote-present");
  });

  it("preserves cross-relay item provenance", () => {
    const remoteItems = [
      {
        id: "provenance-test",
        relayName: "Mission Mesh",
        relayUrl: "wss://mission-mesh.example/relay",
        authorPubkey: "npub1tala",
        authorName: "Tala North",
        geohash: "9q8yyk",
        placeTitle: "Civic plaza",
        content: "Test content with provenance",
        publishedAt: "2026-03-18T18:00:00Z",
        sourceLabel: "Direct follow",
        whyVisible: "Followed author on configured relay"
      }
    ];

    const result = buildPulseFeedItems(remoteItems);

    expect(result[0]).toMatchObject({
      relayName: "Mission Mesh",
      relayUrl: "wss://mission-mesh.example/relay",
      sourceLabel: "Direct follow",
      whyVisible: "Followed author on configured relay"
    });
  });
});

describe("buildCrossRelayFeedItemsFromNotes", () => {
  it("maps queried relay notes into cross-relay feed items with relay provenance", () => {
    const relay = {
      name: "Mission Mesh",
      url: "wss://mission-mesh.example/relay"
    };
    const places = [makePlace("9q8yyk", "Civic plaza")];
    const profiles = [makeProfile("npub1test", "Test Author")];
    const notes = [makeNote("event-1", "9q8yyk", "npub1test", "2026-03-18T18:00:00Z")];

    expect(buildCrossRelayFeedItemsFromNotes(relay, notes, places, profiles)).toEqual([
      {
        id: "event-1",
        relayName: "Mission Mesh",
        relayUrl: "wss://mission-mesh.example/relay",
        authorPubkey: "npub1test",
        authorName: "Test Author",
        geohash: "9q8yyk",
        placeTitle: "Civic plaza",
        content: "Note content for event-1",
        publishedAt: "2026-03-18T18:00:00Z",
        sourceLabel: "Relay list",
        whyVisible: "Fetched live from a configured relay."
      }
    ]);
  });

  it("labels non-geotagged remote notes as wider-network items", () => {
    const relay = {
      name: "Mission Mesh",
      url: "wss://mission-mesh.example/relay"
    };
    const profiles = [makeProfile("npub1test", "Test Author")];
    const notes = [makeNote("event-1", pulseNetworkGeohash, "npub1test", "2026-03-18T18:00:00Z")];

    expect(buildCrossRelayFeedItemsFromNotes(relay, notes, [], profiles)).toEqual([
      expect.objectContaining({
        geohash: pulseNetworkGeohash,
        placeTitle: pulseNetworkPlaceTitle
      })
    ]);
  });
});

describe("mergeCrossRelayFeedItems", () => {
  it("deduplicates mirrored relay notes by event id and keeps the newest items first", () => {
    const original = makeCrossRelayItem("event-1", "Relay list", "2026-03-18T18:00:00Z");
    const mirrored = {
      ...makeCrossRelayItem("event-1", "Relay list", "2026-03-18T18:00:00Z"),
      relayName: "Fallback relay",
      relayUrl: "wss://fallback.example"
    };
    const newer = makeCrossRelayItem("event-2", "Direct follow", "2026-03-18T19:00:00Z");

    expect(mergeCrossRelayFeedItems([original], [mirrored, newer])).toEqual([newer, original]);
  });
});

describe("formatPlaceHeading", () => {
  it("prints the geohash once for fallback field tiles", () => {
    expect(formatPlaceHeading("Field tile 9q8yyk", "9q8yyk")).toBe("9q8yyk");
  });

  it("keeps named places paired with their geohash", () => {
    expect(formatPlaceHeading("Civic plaza", "9q8yyk")).toBe("Civic plaza · 9q8yyk");
  });
});

describe("listNotesForPlace", () => {
  it("sorts mixed-precision ISO timestamps by actual recency", () => {
    const notes = [
      makeNote("note-seconds", "9q8yyk", "npub1test", "2026-03-18T18:30:00Z"),
      makeNote("note-millis", "9q8yyk", "npub1test", "2026-03-18T18:30:00.123Z")
    ];

    expect(listNotesForPlace(notes, "9q8yyk").map((note) => note.id)).toEqual([
      "note-millis",
      "note-seconds"
    ]);
  });
});

describe("Pulse note boundaries", () => {
  it("identifies notes tied to known beacons", () => {
    const places = [makePlace("9q8yyk", "Civic plaza")];

    expect(isBeaconThreadNote(makeNote("note-1", "9q8yyk", "npub1test", "2026-03-18T18:00:00Z"), places)).toBe(true);
    expect(isBeaconThreadNote(makeNote("note-2", "9q8zzz", "npub1test", "2026-03-18T18:00:00Z"), places)).toBe(false);
  });

  it("keeps only non-beacon local notes in Pulse selectors", () => {
    const places = [makePlace("9q8yyk", "Civic plaza")];
    const notes = [
      makeNote("beacon-note", "9q8yyk", "npub1test", "2026-03-18T18:00:00Z"),
      makeNote("public-note", "9q8zzz", "npub1test", "2026-03-18T19:00:00Z")
    ];

    expect(listPulseLocalNotes(places, notes).map((note) => note.id)).toEqual(["public-note"]);
  });
});
