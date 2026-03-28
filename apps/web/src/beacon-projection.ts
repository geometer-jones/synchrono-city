import {
  createEphemeralPlace,
  getPlaceParticipantPubkeys,
  resolveRoomID,
  sortNotesByRecency,
  type CallSession,
  type GeoNote,
  type ParticipantProfile,
  type Place
} from "./data";
import { buildCohortBeaconMetadata, type CohortBeaconMetadata } from "./beacon-metadata";

export type Beacon = {
  geohash: string;
  name: string;
  about: string;
  avatarUrl?: string;
  unread: boolean;
  pinnedNoteId?: string;
  roomID: string;
  cohort?: CohortBeaconMetadata;
};

export type BeaconThread = {
  geohash: string;
  name: string;
  about: string;
  noteCount: number;
  participants: string[];
  unread: boolean;
  activeCall: boolean;
  pinnedNoteId?: string;
  roomID: string;
  avatarUrl?: string;
  cohort?: CohortBeaconMetadata;
};

export type BeaconTile = {
  geohash: string;
  name: string;
  about: string;
  latestNote: string;
  noteCount: number;
  participants: string[];
  roomID: string;
  avatarUrl?: string;
  live: boolean;
  cohort?: CohortBeaconMetadata;
};

export type BeaconProjection = {
  beacons: Beacon[];
  beaconMap: Map<string, Beacon>;
  tiles: BeaconTile[];
  threads: BeaconThread[];
  notesByGeohash: Map<string, GeoNote[]>;
  participantPubkeysByGeohash: Map<string, string[]>;
};

export function buildBeaconProjection(
  places: Place[],
  notes: GeoNote[],
  activeCall: CallSession | null,
  currentPubkey: string,
  profiles: ParticipantProfile[],
  operatorPubkey: string
): BeaconProjection {
  const effectivePlaces =
    activeCall && !places.some((place) => place.geohash === activeCall.geohash)
      ? [createEphemeralPlace(activeCall.geohash), ...places]
      : places;

  const notesByGeohash = new Map<string, GeoNote[]>();
  for (const note of notes) {
    const existing = notesByGeohash.get(note.geohash) ?? [];
    existing.push(note);
    notesByGeohash.set(note.geohash, existing);
  }

  for (const [geohash, geohashNotes] of notesByGeohash.entries()) {
    notesByGeohash.set(geohash, sortNotesByRecency(geohashNotes));
  }

  const profilesByPubkey = new Map(profiles.map((profile) => [profile.pubkey, profile]));
  const participantPubkeysByGeohash = new Map<string, string[]>();
  const beacons: Beacon[] = [];
  const tiles: BeaconTile[] = [];
  const threads: BeaconThread[] = [];

  for (const place of effectivePlaces) {
    const participants = getPlaceParticipantPubkeys(place, activeCall, currentPubkey);
    const sortedNotes = notesByGeohash.get(place.geohash) ?? [];
    const pinnedNote = place.pinnedNoteId ? sortedNotes.find((note) => note.id === place.pinnedNoteId) : undefined;
    const cohort = buildCohortBeaconMetadata(place, pinnedNote, sortedNotes);
    const avatarUrl = resolveBeaconAvatarUrl(place, participants, sortedNotes, profilesByPubkey);
    const name = place.title.trim() || `Beacon ${place.geohash}`;
    const about = resolveBeaconAbout(place);
    const roomID = resolveRoomID(place.geohash, operatorPubkey);
    const live = activeCall?.geohash === place.geohash || participants.length > 0;

    participantPubkeysByGeohash.set(place.geohash, participants);

    const beacon: Beacon = {
      geohash: place.geohash,
      name,
      about,
      avatarUrl,
      unread: place.unread,
      pinnedNoteId: place.pinnedNoteId,
      roomID,
      cohort: cohort ?? undefined
    };

    beacons.push(beacon);
    tiles.push({
      geohash: place.geohash,
      name,
      about,
      latestNote: sortedNotes[0]?.content ?? (live ? "Live call in progress." : "No messages yet."),
      noteCount: sortedNotes.length,
      participants,
      roomID,
      avatarUrl,
      live,
      cohort: cohort ?? undefined
    });
    threads.push({
      geohash: place.geohash,
      name,
      about,
      noteCount: sortedNotes.length,
      participants,
      unread: place.unread,
      activeCall: live,
      pinnedNoteId: place.pinnedNoteId,
      roomID,
      avatarUrl,
      cohort: cohort ?? undefined
    });
  }

  return {
    beacons,
    beaconMap: new Map(beacons.map((beacon) => [beacon.geohash, beacon])),
    tiles,
    threads,
    notesByGeohash,
    participantPubkeysByGeohash
  };
}

function resolveBeaconAbout(place: Place) {
  const candidates = [place.description, place.activitySummary, place.neighborhood];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return `Chosen-place beacon for ${place.geohash}.`;
}

function resolveBeaconAvatarUrl(
  place: Place,
  participants: string[],
  sortedNotes: GeoNote[],
  profilesByPubkey: Map<string, ParticipantProfile>
) {
  const placePicture = place.picture?.trim();
  if (placePicture) {
    return placePicture;
  }

  const candidatePubkeys = [
    ...participants,
    ...sortedNotes.map((note) => note.authorPubkey),
    ...place.occupantPubkeys
  ];

  for (const pubkey of candidatePubkeys) {
    const picture = profilesByPubkey.get(pubkey)?.picture?.trim();
    if (picture) {
      return picture;
    }
  }

  return undefined;
}
