import { describe, expect, it } from "vitest";
import {
  buildPulseFeedItems,
  type CrossRelayFeedItem,
  formatPlaceHeading,
  type GeoNote,
  type ParticipantProfile,
  type Place,
  type PulseFeedItem
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
    const result = buildPulseFeedItems([], [], [], []);
    expect(result).toEqual([]);
  });

  it("maps local notes to Local lane with local=true", () => {
    const places = [makePlace("9q8yyk", "Civic plaza")];
    const notes = [makeNote("note-1", "9q8yyk", "npub1test", "2026-03-18T18:00:00Z")];
    const profiles = [makeProfile("npub1test", "Test Author")];

    const result = buildPulseFeedItems(places, notes, profiles, []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pulse-local-note-1",
      lane: "Local",
      kind: "local_note",
      local: true,
      noteId: "note-1",
      authorName: "Test Author",
      placeTitle: "Civic plaza"
    });
  });

  it("maps cross-relay items with Direct follow to Following lane", () => {
    const remoteItems = [makeCrossRelayItem("remote-1", "Direct follow", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems([], [], [], remoteItems);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pulse-remote-remote-1",
      lane: "Following",
      kind: "cross_relay",
      local: false
    });
  });

  it("maps cross-relay items with Relay list to For You lane", () => {
    const remoteItems = [makeCrossRelayItem("remote-1", "Relay list", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems([], [], [], remoteItems);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      lane: "For You",
      kind: "cross_relay",
      local: false
    });
  });

  it("sorts merged items by publishedAt descending", () => {
    const notes = [makeNote("note-old", "9q8yyk", "npub1a", "2026-03-18T17:00:00Z")];
    const remoteItems = [
      makeCrossRelayItem("remote-new", "Direct follow", "2026-03-18T19:00:00Z"),
      makeCrossRelayItem("remote-mid", "Relay list", "2026-03-18T18:00:00Z")
    ];

    const result = buildPulseFeedItems([], notes, [], remoteItems);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("pulse-remote-remote-new"); // 19:00
    expect(result[1].id).toBe("pulse-remote-remote-mid"); // 18:00
    expect(result[2].id).toBe("pulse-local-note-old"); // 17:00
  });

  it("does not throw when a feed item is missing publishedAt", () => {
    const remoteItems = [
      {
        ...makeCrossRelayItem("remote-missing", "Relay list", "2026-03-18T18:00:00Z"),
        publishedAt: undefined as unknown as string
      },
      makeCrossRelayItem("remote-present", "Direct follow", "2026-03-18T19:00:00Z")
    ];

    expect(() => buildPulseFeedItems([], [], [], remoteItems)).not.toThrow();
    expect(buildPulseFeedItems([], [], [], remoteItems)[0].id).toBe("pulse-remote-remote-present");
  });

  it("falls back to pubkey when profile is missing", () => {
    const notes = [makeNote("note-1", "9q8yyk", "npub1unknown", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems([], notes, [], []);

    expect(result[0].authorName).toBe("npub1unknown");
  });

  it("falls back to geohash when place is missing", () => {
    const notes = [makeNote("note-1", "9q8xyz", "npub1test", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems([], notes, [], []);

    expect(result[0].placeTitle).toBe("9q8xyz");
  });

  it("uses custom relay name and URL for local items", () => {
    const notes = [makeNote("note-1", "9q8yyk", "npub1test", "2026-03-18T18:00:00Z")];

    const result = buildPulseFeedItems([], notes, [], [], "Custom Relay", "wss://custom.example");

    expect(result[0].relayName).toBe("Custom Relay");
    expect(result[0].relayUrl).toBe("wss://custom.example");
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

    const result = buildPulseFeedItems([], [], [], remoteItems);

    expect(result[0]).toMatchObject({
      relayName: "Mission Mesh",
      relayUrl: "wss://mission-mesh.example/relay",
      sourceLabel: "Direct follow",
      whyVisible: "Followed author on configured relay"
    });
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
