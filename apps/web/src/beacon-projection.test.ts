import { describe, expect, it } from "vitest";

import { buildBeaconProjection } from "./beacon-projection";
import type { CallSession, ParticipantProfile, Place } from "./data";

const basePlaces: Place[] = [
  {
    geohash: "9q8yyk12",
    title: "SFV Founders",
    neighborhood: "Valley",
    description: "",
    activitySummary: "Low-pressure founder calls.",
    ownerPubkey: "npub1scout",
    memberPubkeys: ["npub1scout"],
    tags: ["beacon", "cohort", "curriculum:zero-to-hero", "level:beginner", "hybrid"],
    capacity: 8,
    occupantPubkeys: ["npub1aurora"],
    unread: false,
    pinnedNoteId: "note-1"
  }
];

const baseProfiles: ParticipantProfile[] = [
  {
    pubkey: "npub1aurora",
    displayName: "Aurora Vale",
    name: "Aurora Vale",
    picture: "https://images.example.test/aurora.png",
    role: "Founder",
    status: "",
    bio: "",
    mic: true,
    cam: false,
    screenshare: false,
    deafen: false
  }
];

describe("buildBeaconProjection", () => {
  it("projects beacon metadata and avatar-first tiles from place data", () => {
    const projection = buildBeaconProjection(
      basePlaces,
      [
        {
          id: "note-1",
          geohash: "9q8yyk12",
          authorPubkey: "npub1aurora",
          content: [
            "Week: 1/4",
            "Concept: Vectors",
            "Next: Thursday 7pm",
            "Artifact: Shared notes https://example.com/week-1"
          ].join("\n"),
          createdAt: "2026-03-22T20:00:00Z",
          replies: 0
        }
      ],
      null,
      "npub1scout",
      baseProfiles,
      "npub1operator"
    );

    expect(projection.beacons[0]).toMatchObject({
      geohash: "9q8yyk12",
      name: "SFV Founders",
      about: "Low-pressure founder calls.",
      avatarUrl: "https://images.example.test/aurora.png",
      roomID: "beacon:9q8yyk12",
      cohort: {
        curriculumLabel: "Zero to Hero",
        levelLabel: "Beginner",
        weekLabel: "Week 1 of 4",
        currentConcept: "Vectors"
      }
    });
    expect(projection.tiles[0]).toMatchObject({
      geohash: "9q8yyk12",
      name: "SFV Founders",
      latestNote: "Week: 1/4\nConcept: Vectors\nNext: Thursday 7pm\nArtifact: Shared notes https://example.com/week-1",
      live: true
    });
    expect(projection.threads[0]).toMatchObject({
      ownerPubkey: "npub1scout",
      memberPubkeys: ["npub1scout"]
    });
  });

  it("injects an ephemeral beacon for a connected call geohash that is not in bootstrap places", () => {
    const activeCall: CallSession = {
      geohash: "9q8yyk34",
      roomID: "beacon:9q8yyk34",
      placeTitle: "Ad hoc beacon",
      participantPubkeys: ["npub1scout"],
      participantStates: [],
      mediaStreams: [],
      transport: "livekit",
      connectionState: "connected",
      statusMessage: "Connected",
      mic: false,
      cam: false,
      screenshare: false,
      deafen: false,
      minimized: false
    };

    const projection = buildBeaconProjection(basePlaces, [], activeCall, "npub1scout", baseProfiles, "npub1operator");
    const ephemeralBeacon = projection.beaconMap.get("9q8yyk34");

    expect(ephemeralBeacon).toBeDefined();
    expect(ephemeralBeacon?.roomID).toBe("beacon:9q8yyk34");
    expect(projection.participantPubkeysByGeohash.get("9q8yyk34")).toEqual(["npub1scout"]);
  });
});
