export const relayOperatorPubkey = "npub1operator";
export const relayName = "Synchrono City Local";
export const relayURL = "ws://localhost:8080";
export const currentUserPubkey = "npub1scout";

export type ParticipantProfile = {
  pubkey: string;
  displayName: string;
  name?: string;
  picture?: string;
  role: string;
  status: string;
  bio: string;
  homeGeohash?: string;
  mic: boolean;
  cam: boolean;
  screenshare: boolean;
  deafen: boolean;
};

export type Place = {
  geohash: string;
  title: string;
  neighborhood: string;
  description: string;
  activitySummary: string;
  tags: string[];
  capacity: number;
  occupantPubkeys: string[];
  unread: boolean;
  pinnedNoteId?: string;
};

export type GeoThread = {
  geohash: string;
  title: string;
  summary: string;
  noteCount: number;
  participants: string[];
  unread: boolean;
  activeCall: boolean;
  pinnedNoteId?: string;
  roomID: string;
};

export type GeoNote = {
  id: string;
  geohash: string;
  authorPubkey: string;
  content: string;
  createdAt: string;
  replies: number;
};

export type FeedSegment = {
  name: string;
  description: string;
};

export type CrossRelayFeedItem = {
  id: string;
  relayName: string;
  relayUrl: string;
  authorPubkey: string;
  authorName: string;
  geohash: string;
  placeTitle: string;
  content: string;
  publishedAt: string;
  sourceLabel: string;
  whyVisible: string;
};

export type PulseFeedItem = {
  id: string;
  lane: "Following" | "Local" | "For You";
  kind: "local_note" | "cross_relay";
  relayName: string;
  relayUrl: string;
  authorPubkey: string;
  authorName: string;
  geohash: string;
  placeTitle: string;
  content: string;
  publishedAt: string;
  sourceLabel: string;
  whyVisible: string;
  local: boolean;
  noteId?: string;
};

export type RelaySynthesis = {
  id: string;
  geohash: string;
  placeTitle: string;
  summary: string;
  generatedAt: string;
  sourceNoteIds: string[];
  participantPubkeys: string[];
};

export type PlaceTile = {
  geohash: string;
  title: string;
  latestNote: string;
  noteCount: number;
  participants: string[];
  roomID: string;
};

export type CallSession = {
  geohash: string;
  roomID: string;
  placeTitle: string;
  participantPubkeys: string[];
  participantStates: Array<{
    pubkey: string;
    mic: boolean;
    cam: boolean;
    screenshare: boolean;
  }>;
  transport: "local" | "livekit";
  connectionState: "local_preview" | "connecting" | "connected" | "failed";
  statusMessage: string;
  identity?: string;
  liveKitURL?: string;
  expiresAt?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  mic: boolean;
  cam: boolean;
  screenshare: boolean;
  deafen: boolean;
  minimized: boolean;
};

export function createFallbackCurrentUser(pubkey = currentUserPubkey): ParticipantProfile {
  return {
    pubkey,
    displayName: "Current session",
    name: "Current session",
    role: "No relay profile loaded",
    status: "This client has not received a participant profile yet.",
    bio: "",
    mic: false,
    cam: false,
    screenshare: false,
    deafen: false
  };
}

export function createFallbackParticipantProfile(pubkey: string): ParticipantProfile {
  return {
    pubkey,
    displayName: "",
    role: "Participant",
    status: "LiveKit participant metadata is unavailable.",
    bio: "",
    mic: false,
    cam: false,
    screenshare: false,
    deafen: false
  };
}

export function resolveRoomID(geohash: string, operatorPubkey = relayOperatorPubkey) {
  return `geo:${operatorPubkey}:${geohash}`;
}

export function compareDescendingTimestamps(left?: string, right?: string) {
  if (left && right) {
    return right.localeCompare(left);
  }
  if (right) {
    return 1;
  }
  if (left) {
    return -1;
  }
  return 0;
}

export function createEphemeralPlace(geohash: string): Place {
  return {
    geohash,
    title: `Field tile ${geohash}`,
    neighborhood: "Ad hoc presence",
    description: "No operator-defined place exists for this tile yet.",
    activitySummary: "Presence was set directly from a map click.",
    tags: ["ad-hoc", "geohash7"],
    capacity: 8,
    occupantPubkeys: [],
    unread: false
  };
}

export function formatPlaceHeading(title: string, geohash: string) {
  const trimmedTitle = title.trim();
  const trimmedGeohash = geohash.trim();

  if (!trimmedTitle) {
    return trimmedGeohash;
  }

  if (trimmedTitle === trimmedGeohash || trimmedTitle === `Field tile ${trimmedGeohash}`) {
    return trimmedGeohash;
  }

  return `${trimmedTitle} · ${trimmedGeohash}`;
}

export function sortNotesByRecency(notes: GeoNote[]) {
  return [...notes].sort((left, right) => compareDescendingTimestamps(left.createdAt, right.createdAt));
}

export function listNotesForPlace(notes: GeoNote[], geohash: string) {
  return sortNotesByRecency(notes.filter((note) => note.geohash === geohash));
}

function ensureSentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildRelaySyntheses(places: Place[], notes: GeoNote[]): RelaySynthesis[] {
  return places
    .map((place) => {
      const placeNotes = listNotesForPlace(notes, place.geohash);
      const activitySignals = placeNotes.length + place.occupantPubkeys.length;

      if (placeNotes.length === 0 || activitySignals < 3) {
        return null;
      }

      const citedNotes = placeNotes.slice(0, 2);
      const summaryParts = [ensureSentence(place.activitySummary)];

      if (citedNotes[0]) {
        summaryParts.push(`Latest note: ${ensureSentence(citedNotes[0].content)}`);
      }
      if (citedNotes[1]) {
        summaryParts.push(`Also tracking: ${ensureSentence(citedNotes[1].content)}`);
      }

      return {
        id: `synthesis-${place.geohash}`,
        geohash: place.geohash,
        placeTitle: place.title,
        summary: summaryParts.filter(Boolean).join(" "),
        generatedAt: citedNotes[0].createdAt,
        sourceNoteIds: citedNotes.map((note) => note.id),
        participantPubkeys: [...place.occupantPubkeys]
      } satisfies RelaySynthesis;
    })
    .filter((entry): entry is RelaySynthesis => Boolean(entry))
    .sort((left, right) => compareDescendingTimestamps(left.generatedAt, right.generatedAt));
}

export function buildParticipantMap(profiles: ParticipantProfile[]) {
  return new Map(profiles.map((profile) => [profile.pubkey, profile]));
}

export function buildPlaceMap(places: Place[]) {
  return new Map(places.map((place) => [place.geohash, place]));
}

export function buildNoteMap(notes: GeoNote[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

export function getPlaceParticipantPubkeys(
  place: Place,
  activeCall: CallSession | null,
  currentPubkey: string
) {
  const participants = [...place.occupantPubkeys];
  if (activeCall?.geohash === place.geohash) {
    for (const pubkey of activeCall.participantPubkeys) {
      if (!participants.includes(pubkey)) {
        participants.push(pubkey);
      }
    }
  }
  if (activeCall?.geohash === place.geohash && !participants.includes(currentPubkey)) {
    participants.push(currentPubkey);
  }
  return participants;
}

export function buildThreads(
  places: Place[],
  notes: GeoNote[],
  activeCall: CallSession | null,
  currentPubkey: string,
  operatorPubkey = relayOperatorPubkey
) {
  const effectivePlaces =
    activeCall && !places.some((place) => place.geohash === activeCall.geohash)
      ? [createEphemeralPlace(activeCall.geohash), ...places]
      : places;

  // Pre-group notes by geohash to avoid O(n*m) filtering per place
  const notesByGeohash = new Map<string, GeoNote[]>();
  for (const note of notes) {
    const existing = notesByGeohash.get(note.geohash) ?? [];
    existing.push(note);
    notesByGeohash.set(note.geohash, existing);
  }

  return effectivePlaces.map((place) => {
    const placeNotes = notesByGeohash.get(place.geohash) ?? [];
    const sortedPlaceNotes = sortNotesByRecency(placeNotes);
    return {
      geohash: place.geohash,
      title: place.title,
      summary: place.activitySummary,
      noteCount: sortedPlaceNotes.length,
      participants: getPlaceParticipantPubkeys(place, activeCall, currentPubkey),
      unread: place.unread,
      activeCall: activeCall?.geohash === place.geohash || place.occupantPubkeys.length > 0,
      pinnedNoteId: place.pinnedNoteId,
      roomID: resolveRoomID(place.geohash, operatorPubkey)
    };
  });
}

export function buildPlaceTiles(
  places: Place[],
  notes: GeoNote[],
  activeCall: CallSession | null,
  currentPubkey: string,
  operatorPubkey = relayOperatorPubkey
) {
  const effectivePlaces =
    activeCall && !places.some((place) => place.geohash === activeCall.geohash)
      ? [createEphemeralPlace(activeCall.geohash), ...places]
      : places;

  // Pre-group notes by geohash to avoid O(n*m) filtering per place
  const notesByGeohash = new Map<string, GeoNote[]>();
  for (const note of notes) {
    const existing = notesByGeohash.get(note.geohash) ?? [];
    existing.push(note);
    notesByGeohash.set(note.geohash, existing);
  }

  return effectivePlaces.map((place) => {
    const placeNotes = notesByGeohash.get(place.geohash) ?? [];
    const sortedPlaceNotes = sortNotesByRecency(placeNotes);
    return {
      geohash: place.geohash,
      title: place.title,
      latestNote: sortedPlaceNotes[0]?.content ?? "Room is occupied without a note.",
      noteCount: sortedPlaceNotes.length,
      participants: getPlaceParticipantPubkeys(place, activeCall, currentPubkey),
      roomID: resolveRoomID(place.geohash, operatorPubkey)
    };
  });
}

export function listRecentNotes(notes: GeoNote[]) {
  return sortNotesByRecency(notes);
}

export function listNotesByAuthor(notes: GeoNote[], pubkey: string) {
  return sortNotesByRecency(notes.filter((note) => note.authorPubkey === pubkey));
}

export function buildPulseFeedItems(
  places: Place[],
  notes: GeoNote[],
  profiles: ParticipantProfile[],
  remoteItems: CrossRelayFeedItem[],
  localRelayName = relayName,
  localRelayUrl = relayURL
) {
  const placesByGeohash = buildPlaceMap(places);
  const profilesByPubkey = buildParticipantMap(profiles);

  const localItems: PulseFeedItem[] = listRecentNotes(notes).map((note) => ({
    id: `pulse-local-${note.id}`,
    lane: "Local",
    kind: "local_note",
    relayName: localRelayName,
    relayUrl: localRelayUrl,
    authorPubkey: note.authorPubkey,
    authorName: profilesByPubkey.get(note.authorPubkey)?.displayName ?? note.authorPubkey,
    geohash: note.geohash,
    placeTitle: placesByGeohash.get(note.geohash)?.title ?? note.geohash,
    content: note.content,
    publishedAt: note.createdAt,
    sourceLabel: "Local relay",
    whyVisible: "Published on the active relay and merged with followed and discovered relay context.",
    local: true,
    noteId: note.id
  }));

  const crossRelayFeed: PulseFeedItem[] = remoteItems.map((item) => ({
    id: `pulse-remote-${item.id}`,
    lane: item.sourceLabel === "Direct follow" ? "Following" : "For You",
    kind: "cross_relay",
    relayName: item.relayName,
    relayUrl: item.relayUrl,
    authorPubkey: item.authorPubkey,
    authorName: item.authorName,
    geohash: item.geohash,
    placeTitle: item.placeTitle,
    content: item.content,
    publishedAt: item.publishedAt,
    sourceLabel: item.sourceLabel,
    whyVisible: item.whyVisible,
    local: false
  }));

  return [...localItems, ...crossRelayFeed].sort((left, right) =>
    compareDescendingTimestamps(left.publishedAt, right.publishedAt)
  );
}

export function buildStoryExport(
  places: Place[],
  notes: GeoNote[],
  profiles: ParticipantProfile[],
  activeCall: CallSession | null,
  currentPubkey: string,
  operatorPubkey = relayOperatorPubkey
) {
  const profilesByPubkey = buildParticipantMap(profiles);

  return buildPlaceTiles(places, notes, activeCall, currentPubkey, operatorPubkey)
    .map((tile) => {
      const participants = tile.participants
        .map((pubkey) => profilesByPubkey.get(pubkey)?.displayName ?? pubkey)
        .join(", ");

      return (
        `# ${tile.geohash} · ${tile.title}\n` +
        `Room: ${tile.roomID}\n` +
        `Latest note: ${tile.latestNote}\n` +
        `Notes: ${tile.noteCount}\n` +
        `Participants: ${participants}`
      );
    })
    .join("\n\n");
}

export function getSceneHealthStats(places: Place[], notes: GeoNote[]) {
  const activeTiles = places.length;
  const openSeats = places.reduce(
    (total, place) => total + Math.max(0, place.capacity - place.occupantPubkeys.length),
    0
  );
  const healthScore = 60 + activeTiles * 4 + Math.min(12, notes.length);

  return {
    healthScore,
    activeTiles,
    openSeats
  };
}
