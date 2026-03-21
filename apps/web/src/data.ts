export const relayOperatorPubkey = "npub1operator";
export const currentUserPubkey = "npub1scout";

// Seed data below is a fallback copy of Concierge's seed data.
// Used when the bootstrap API is unavailable (offline/test mode).
// Keep in sync with apps/concierge/internal/social/service.go seed data.

export type ParticipantProfile = {
  pubkey: string;
  displayName: string;
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

export const seedProfiles: ParticipantProfile[] = [
  {
    pubkey: currentUserPubkey,
    displayName: "Field Scout",
    role: "Local member",
    status: "Posting place notes and stepping into nearby rooms.",
    bio: "Tracks live place state, adds operator-facing notes, and joins calls when coordination shifts.",
    mic: true,
    cam: false,
    screenshare: false,
    deafen: false
  },
  {
    pubkey: "npub1aurora",
    displayName: "Aurora Vale",
    role: "Tenant organizer",
    status: "Coordinating arrival updates from the east stairs.",
    bio: "Runs block-level organizing threads and keeps the sunset meetups on schedule.",
    homeGeohash: "9q8yyk",
    mic: true,
    cam: false,
    screenshare: false,
    deafen: false
  },
  {
    pubkey: "npub1jules",
    displayName: "Jules Mercer",
    role: "Neighborhood volunteer",
    status: "Sharing supply counts and street-level accessibility notes.",
    bio: "Tracks turnout and accessibility changes for public gatherings.",
    homeGeohash: "9q8yyk",
    mic: true,
    cam: true,
    screenshare: false,
    deafen: false
  },
  {
    pubkey: "npub1sol",
    displayName: "Sol Marin",
    role: "Event host",
    status: "Pinned on the plaza room and routing newcomers.",
    bio: "Hosts pop-up conversations and keeps the plaza room active.",
    homeGeohash: "9q8yyk",
    mic: false,
    cam: true,
    screenshare: true,
    deafen: false
  },
  {
    pubkey: "npub1mika",
    displayName: "Mika Hart",
    role: "Venue lead",
    status: "Moving the afterparty indoors and updating room logistics.",
    bio: "Coordinates venue operations when activity shifts between tiles.",
    homeGeohash: "9q8yym",
    mic: true,
    cam: false,
    screenshare: false,
    deafen: true
  },
  {
    pubkey: "npub1river",
    displayName: "River Stone",
    role: "Audio host",
    status: "Keeping the room open for late arrivals.",
    bio: "Maintains lightweight audio rooms after the public note stack slows down.",
    homeGeohash: "9q8yyt",
    mic: true,
    cam: false,
    screenshare: false,
    deafen: false
  },
  {
    pubkey: "npub1nox",
    displayName: "Nox Reed",
    role: "Field reporter",
    status: "Watching for overflow from the next tile over.",
    bio: "Posts quick context notes when gatherings spill into nearby blocks.",
    homeGeohash: "9q8yyt",
    mic: false,
    cam: false,
    screenshare: false,
    deafen: false
  }
];

export const seedPlaces: Place[] = [
  {
    geohash: "9q8yyk",
    title: "Civic plaza",
    neighborhood: "Market steps",
    description:
      "A public square for turnout coordination, accessibility updates, and live town-hall spillover.",
    activitySummary: "Tenant organizing thread with a pinned logistics note and a live room.",
    tags: ["assembly", "accessibility", "civic"],
    capacity: 8,
    occupantPubkeys: ["npub1aurora", "npub1jules", "npub1sol"],
    unread: true,
    pinnedNoteId: "note-plaza-pinned"
  },
  {
    geohash: "9q8yym",
    title: "Warehouse annex",
    neighborhood: "Harbor side",
    description:
      "An indoor fallback place for venue logistics, check-in flow, and overflow audio coordination.",
    activitySummary: "The venue lead moved the afterparty indoors and is guiding arrivals.",
    tags: ["venue", "logistics", "overflow"],
    capacity: 6,
    occupantPubkeys: ["npub1mika"],
    unread: false
  },
  {
    geohash: "9q8yyt",
    title: "Audio fallback",
    neighborhood: "Transit corridor",
    description:
      "A low-friction audio place that stays open even when note traffic drops to zero.",
    activitySummary: "Late arrivals are using the room as a rendezvous channel.",
    tags: ["audio", "late-night", "fallback"],
    capacity: 6,
    occupantPubkeys: ["npub1river", "npub1nox"],
    unread: true
  }
];

export const seedNotes: GeoNote[] = [
  {
    id: "note-plaza-pinned",
    geohash: "9q8yyk",
    authorPubkey: "npub1aurora",
    content: "Sunset meetup is shifting to the east stairs.",
    createdAt: "2026-03-18T18:20:00Z",
    replies: 4
  },
  {
    id: "note-plaza-access",
    geohash: "9q8yyk",
    authorPubkey: "npub1jules",
    content: "North gate is clear again. Wheelchair route is the left ramp.",
    createdAt: "2026-03-18T18:08:00Z",
    replies: 2
  },
  {
    id: "note-plaza-stream",
    geohash: "9q8yyk",
    authorPubkey: "npub1sol",
    content: "Screenshare is live for anyone still walking over.",
    createdAt: "2026-03-18T17:58:00Z",
    replies: 1
  },
  {
    id: "note-annex-move",
    geohash: "9q8yym",
    authorPubkey: "npub1mika",
    content: "Afterparty moved indoors. Audio room is live.",
    createdAt: "2026-03-18T18:15:00Z",
    replies: 3
  },
  {
    id: "note-annex-checkin",
    geohash: "9q8yym",
    authorPubkey: "npub1mika",
    content: "Check in at the alley entrance. Capacity is stable for now.",
    createdAt: "2026-03-18T17:50:00Z",
    replies: 0
  },
  {
    id: "note-audio-rollcall",
    geohash: "9q8yyt",
    authorPubkey: "npub1river",
    content: "No new notes, but the room is still occupied.",
    createdAt: "2026-03-18T18:05:00Z",
    replies: 1
  }
];

export const feedSegments: FeedSegment[] = [
  { name: "Following", description: "Explainable projection of followed authors." },
  { name: "Local", description: "Public events carried by the active relay." },
  { name: "For You", description: "Concierge-produced merge across relays and follows." }
];

export function resolveRoomID(geohash: string, operatorPubkey = relayOperatorPubkey) {
  return `geo:${operatorPubkey}:${geohash}`;
}

export function createEphemeralPlace(geohash: string): Place {
  return {
    geohash,
    title: `Field tile ${geohash}`,
    neighborhood: "Ad hoc presence",
    description: "No operator-defined place exists for this tile yet.",
    activitySummary: "Presence was set directly from a map click.",
    tags: ["ad-hoc", "geohash6"],
    capacity: 8,
    occupantPubkeys: [],
    unread: false
  };
}

export function sortNotesByRecency(notes: GeoNote[]) {
  return [...notes].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
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
