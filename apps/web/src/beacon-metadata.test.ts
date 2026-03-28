import { describe, expect, it } from "vitest";

import { buildCohortBeaconMetadata, isCohortPlace } from "./beacon-metadata";
import type { GeoNote, Place } from "./data";

const cohortPlace: Place = {
  geohash: "9q8yyk12",
  title: "Neural Nets Zero to Hero",
  neighborhood: "North Hollywood",
  description: "Weekly hybrid cohort.",
  activitySummary: "Beginner-safe room.",
  tags: ["beacon", "cohort", "curriculum:zero-to-hero", "level:beginner", "hybrid"],
  capacity: 12,
  occupantPubkeys: [],
  unread: false,
  pinnedNoteId: "note-week-2"
};

const pinnedNote: GeoNote = {
  id: "note-week-2",
  geohash: "9q8yyk12",
  authorPubkey: "npub1host",
  content: [
    "Week: 2/4",
    "Concept: Micrograd and backprop",
    "Next: Tuesday 7pm at the east table",
    "Prompt: Build a one-neuron notebook",
    "Artifact: Shared notebook https://example.com/week-2",
    "Join: Join muted first. Ask questions when the host opens the floor."
  ].join("\n"),
  createdAt: "2026-03-27T19:00:00Z",
  replies: 0
};

describe("beacon metadata", () => {
  it("recognizes cohort beacons from tags", () => {
    expect(isCohortPlace(cohortPlace)).toBe(true);
    expect(
      isCohortPlace({
        ...cohortPlace,
        tags: ["beacon"]
      })
    ).toBe(false);
  });

  it("derives cohort summary from tags and pinned note conventions", () => {
    const metadata = buildCohortBeaconMetadata(cohortPlace, pinnedNote, [
      pinnedNote,
      {
        id: "note-week-1",
        geohash: "9q8yyk12",
        authorPubkey: "npub1host",
        content: "Week 1 recap https://example.com/week-1",
        createdAt: "2026-03-20T19:00:00Z",
        replies: 0
      }
    ]);

    expect(metadata).toMatchObject({
      curriculum: "zero-to-hero",
      curriculumLabel: "Zero to Hero",
      level: "beginner",
      levelLabel: "Beginner",
      hybrid: true,
      weekLabel: "Week 2 of 4",
      weekIndex: 2,
      weekCount: 4,
      currentConcept: "Micrograd and backprop",
      nextSession: "Tuesday 7pm at the east table",
      prompt: "Build a one-neuron notebook",
      joinPosture: "Join muted first. Ask questions when the host opens the floor."
    });
    expect(metadata?.artifact).toMatchObject({
      url: "https://example.com/week-2",
      label: "Shared notebook"
    });
    expect(metadata?.recentArtifacts).toHaveLength(1);
    expect(metadata?.recentArtifacts[0]).toMatchObject({
      url: "https://example.com/week-1"
    });
  });

  it("keeps plain beacons plain", () => {
    const metadata = buildCohortBeaconMetadata(
      {
        ...cohortPlace,
        tags: ["beacon"],
        pinnedNoteId: undefined
      },
      undefined,
      []
    );

    expect(metadata).toBeNull();
  });
});
