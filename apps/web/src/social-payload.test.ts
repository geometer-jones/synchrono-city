import { describe, expect, it } from "vitest";

import { normalizeBootstrapPayload, normalizeCallIntentPayload } from "./social-payload";

describe("normalizeBootstrapPayload", () => {
  it("defaults missing collections to empty arrays and nested arrays to safe values", () => {
    const payload = normalizeBootstrapPayload({
      relay_name: "Test Relay",
      relay_operator_pubkey: "npub1operator",
      places: [
        {
          geohash: "9q8yyk",
          title: "Civic plaza",
          neighborhood: "Market steps",
          description: "Test",
          activitySummary: "Busy",
          tags: undefined as unknown as string[],
          capacity: 8,
          occupantPubkeys: undefined as unknown as string[],
          unread: true
        }
      ],
      profiles: undefined,
      notes: undefined,
      feed_segments: undefined,
      cross_relay_items: undefined
    });

    expect(payload.feed_segments).toEqual([]);
    expect(payload.relay_list).toEqual([]);
    expect(payload.cross_relay_items).toEqual([]);
    expect(payload.profiles).toEqual([]);
    expect(payload.notes).toEqual([]);
    expect(payload.places[0]?.tags).toEqual([]);
    expect(payload.places[0]?.occupantPubkeys).toEqual([]);
  });

  it("accepts concierge snake_case fields", () => {
    const payload = normalizeBootstrapPayload({
      current_user_pubkey: "npub1real",
      relay_list: [
        {
          name: "Mission Mesh",
          relay_url: "wss://mission.example",
          inbox: true,
          outbox: false
        } as unknown as never
      ],
      places: [
        {
          geohash: "9q8yyk",
          title: "Civic plaza",
          neighborhood: "Market steps",
          description: "Test",
          activity_summary: "Busy",
          tags: ["assembly"],
          capacity: 8,
          occupant_pubkeys: ["npub1aurora"],
          unread: true,
          pinned_note_id: "note-1"
        } as unknown as never
      ],
      profiles: [
        {
          pubkey: "npub1aurora",
          display_name: "",
          name: "Aurora Vale",
          picture: "https://images.example.test/aurora-vale.png",
          role: "member",
          status: "active",
          bio: "Test",
          home_geohash: "9q8yyk",
          mic: true,
          cam: false,
          screenshare: false,
          deafen: false
        } as unknown as never
      ],
      notes: [
        {
          id: "note-1",
          geohash: "9q8yyk",
          author_pubkey: "npub1aurora",
          content: "Hello",
          created_at: "2026-03-18T18:00:00Z",
          replies: 0
        } as unknown as never
      ],
      cross_relay_items: [
        {
          id: "remote-1",
          relay_name: "Mission Mesh",
          relay_url: "wss://mission.example",
          author_pubkey: "npub1remote",
          author_name: "Remote",
          geohash: "9q8yyk",
          place_title: "Civic plaza",
          content: "Remote note",
          published_at: "2026-03-18T18:05:00Z",
          source_label: "Direct follow",
          why_visible: "Followed relay"
        } as unknown as never
      ]
    });

    expect(payload.current_user_pubkey).toBe("npub1real");
    expect(payload.relay_list[0]).toMatchObject({
      name: "Mission Mesh",
      url: "wss://mission.example",
      inbox: true,
      outbox: false
    });
    expect(payload.places[0]).toMatchObject({
      activitySummary: "Busy",
      occupantPubkeys: ["npub1aurora"],
      pinnedNoteId: "note-1"
    });
    expect(payload.profiles[0]).toMatchObject({
      displayName: "Aurora Vale",
      name: "Aurora Vale",
      picture: "https://images.example.test/aurora-vale.png",
      homeGeohash: "9q8yyk"
    });
    expect(payload.notes[0]).toMatchObject({
      authorPubkey: "npub1aurora",
      createdAt: "2026-03-18T18:00:00Z"
    });
    expect(payload.cross_relay_items[0]).toMatchObject({
      relayName: "Mission Mesh",
      relayUrl: "wss://mission.example",
      sourceLabel: "Direct follow",
      whyVisible: "Followed relay"
    });
  });
});

describe("normalizeCallIntentPayload", () => {
  it("defaults missing participant arrays to an empty array", () => {
    const payload = normalizeCallIntentPayload({
      geohash: "9q8yyk",
      room_id: "geo:npub1operator:9q8yyk",
      place_title: "Civic plaza",
      participant_pubkeys: undefined
    });

    expect(payload.participant_pubkeys).toEqual([]);
  });
});

describe("normalizeBootstrapPayload filtering", () => {
  it("filters places with empty geohash", () => {
    const payload = normalizeBootstrapPayload({
      places: [
        { geohash: "9q8yyk", title: "Valid" },
        { geohash: "", title: "Invalid" },
        { geohash: null, title: "Also Invalid" } as unknown as { geohash: string }
      ] as unknown as never[]
    });

    expect(payload.places).toHaveLength(1);
    expect(payload.places[0]?.title).toBe("Valid");
  });

  it("filters profiles with empty pubkey", () => {
    const payload = normalizeBootstrapPayload({
      profiles: [
        { pubkey: "npub1valid", displayName: "Valid" },
        { pubkey: "", displayName: "Invalid" },
        { pubkey: undefined, displayName: "Also Invalid" } as unknown as { pubkey: string }
      ] as unknown as never[]
    });

    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles[0]?.displayName).toBe("Valid");
  });

  it("filters notes missing required fields", () => {
    const payload = normalizeBootstrapPayload({
      notes: [
        { id: "note-1", geohash: "9q8yyk", authorPubkey: "npub1valid" },
        { id: "note-2", geohash: "", authorPubkey: "npub1valid" },
        { id: "note-3", geohash: "9q8yyk", authorPubkey: "" },
        { id: "", geohash: "9q8yyk", authorPubkey: "npub1valid" }
      ] as unknown as never[]
    });

    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]?.id).toBe("note-1");
  });

  it("filters feed segments with empty name", () => {
    const payload = normalizeBootstrapPayload({
      feed_segments: [
        { name: "Following", description: "Valid" },
        { name: "", description: "Invalid" }
      ]
    });

    expect(payload.feed_segments).toHaveLength(1);
    expect(payload.feed_segments[0]?.name).toBe("Following");
  });

  it("filters cross-relay items with empty id", () => {
    const payload = normalizeBootstrapPayload({
      cross_relay_items: [
        { id: "remote-1", relayName: "Valid" },
        { id: "", relayName: "Invalid" }
      ] as unknown as never[]
    });

    expect(payload.cross_relay_items).toHaveLength(1);
    expect(payload.cross_relay_items[0]?.relayName).toBe("Valid");
  });

  it("filters relay-list entries with empty urls", () => {
    const payload = normalizeBootstrapPayload({
      relay_list: [
        { name: "Valid", relay_url: "wss://valid.example", inbox: true, outbox: true } as unknown as never,
        { name: "Invalid", relay_url: "", inbox: true, outbox: false } as unknown as never
      ]
    });

    expect(payload.relay_list).toHaveLength(1);
    expect(payload.relay_list[0]?.name).toBe("Valid");
  });

  it("returns empty arrays when payload is completely empty", () => {
    const payload = normalizeBootstrapPayload({});

    expect(payload.places).toEqual([]);
    expect(payload.profiles).toEqual([]);
    expect(payload.notes).toEqual([]);
    expect(payload.feed_segments).toEqual([]);
    expect(payload.relay_list).toEqual([]);
    expect(payload.cross_relay_items).toEqual([]);
    expect(payload.relay_name).toBeUndefined();
    expect(payload.relay_operator_pubkey).toBeUndefined();
    expect(payload.current_user_pubkey).toBe("");
  });
});
