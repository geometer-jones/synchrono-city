import { normalizePublicKeyNpub } from "./nostr-utils";

export const relayOperatorPubkey = "npub1operator";
export const relayName = "Synchrono City Local";
export const relayURL = "ws://localhost:8080";
export const currentUserPubkey = "npub1scout";
export const pulseNetworkGeohash = "pulse-network";
export const pulseNetworkPlaceTitle = "Wider network";
export const pulseFeedPageSize = 30;

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
  createdAt?: string;
  picture?: string;
  ownerPubkey?: string;
  memberPubkeys?: string[];
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

export type ChatThread = {
  id: string;
  kind: "dm" | "group_dm";
  title: string;
  summary: string;
  participants: string[];
  unread: boolean;
  activeCall: boolean;
};

export type GeoNote = {
  id: string;
  geohash: string;
  authorPubkey: string;
  content: string;
  createdAt: string;
  replies: number;
  replyTargetId?: string;
  rootNoteId?: string;
  taggedPubkeys?: string[];
  reactions?: GeoNoteReaction[];
};

export type GeoNoteReaction = {
  emoji: string;
  count: number;
};

export type RelayListEntry = {
  url: string;
  name: string;
  inbox: boolean;
  outbox: boolean;
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
  zapCount?: number;
  engagementScore?: number;
  followGraphScore?: number;
  followerCount?: number;
};

export type PulseFeedItem = {
  id: string;
  lane: "Following" | "For You";
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
  postCount: number;
  posts: {
    id: string;
    content: string;
    publishedAt: string;
  }[];
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

export type CallMediaStream = {
  id: string;
  pubkey: string;
  source: "camera" | "screen_share";
  isLocal: boolean;
  track: {
    attach: (element: HTMLMediaElement) => HTMLMediaElement;
    detach: (element: HTMLMediaElement) => HTMLMediaElement;
  };
};

export type CallParticipantState = {
  pubkey: string;
  mic: boolean;
  cam: boolean;
  screenshare: boolean;
  isSpeaking: boolean;
};

export type CallSession = {
  geohash: string;
  roomID: string;
  placeTitle: string;
  startedAt?: string;
  participantPubkeys: string[];
  participantStates: CallParticipantState[];
  mediaStreams: CallMediaStream[];
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

export function isConnectedLiveKitCall(activeCall: CallSession | null | undefined): activeCall is CallSession {
  return activeCall?.transport === "livekit" && activeCall.connectionState === "connected";
}

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

export function resolveRoomID(geohash: string, _operatorPubkey = relayOperatorPubkey) {
  return `beacon:${geohash}`;
}

export function compareDescendingTimestamps(left?: string, right?: string) {
  const leftTime = parseTimestamp(left);
  const rightTime = parseTimestamp(right);

  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (rightTime != null && leftTime == null) {
    return 1;
  }
  if (leftTime != null && rightTime == null) {
    return -1;
  }
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

export function createDefaultRelayListEntry(relayNameValue = relayName, relayURLValue = relayURL): RelayListEntry {
  const normalizedURL = relayURLValue.trim();

  return {
    url: normalizedURL,
    name: relayNameValue.trim() || normalizedURL,
    inbox: true,
    outbox: true
  };
}

export function createEphemeralPlace(geohash: string): Place {
  return {
    geohash,
    title: `Field tile ${geohash}`,
    neighborhood: "Ad hoc presence",
    description: "No operator-defined place exists for this tile yet.",
    activitySummary: "Presence was set directly from a map click.",
    picture: undefined,
    tags: ["ad-hoc", "geohash8"],
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

export function sortNotesChronologically(notes: GeoNote[]) {
  return [...notes].sort((left, right) => compareAscendingTimestamps(left.createdAt, right.createdAt));
}

export function listNotesForPlace(notes: GeoNote[], geohash: string) {
  return sortNotesByRecency(notes.filter((note) => note.geohash === geohash));
}

function compareAscendingTimestamps(left?: string, right?: string) {
  const leftTime = parseTimestamp(left);
  const rightTime = parseTimestamp(right);

  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime != null && rightTime == null) {
    return -1;
  }
  if (leftTime == null && rightTime != null) {
    return 1;
  }
  if (left && right) {
    return left.localeCompare(right);
  }
  if (left) {
    return -1;
  }
  if (right) {
    return 1;
  }
  return 0;
}

function parseTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
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
  const connectedActiveCall = isConnectedLiveKitCall(activeCall) ? activeCall : null;
  const participants = [...place.occupantPubkeys];
  if (connectedActiveCall?.geohash === place.geohash) {
    for (const pubkey of connectedActiveCall.participantPubkeys) {
      if (!participants.includes(pubkey)) {
        participants.push(pubkey);
      }
    }
  }
  if (connectedActiveCall?.geohash === place.geohash && !participants.includes(currentPubkey)) {
    participants.push(currentPubkey);
  }
  return participants;
}

export function buildGeoThreads(
  places: Place[],
  notes: GeoNote[],
  activeCall: CallSession | null,
  currentPubkey: string,
  operatorPubkey = relayOperatorPubkey
) {
  const connectedActiveCall = isConnectedLiveKitCall(activeCall) ? activeCall : null;
  const effectivePlaces =
    connectedActiveCall && !places.some((place) => place.geohash === connectedActiveCall.geohash)
      ? [createEphemeralPlace(connectedActiveCall.geohash), ...places]
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
      participants: getPlaceParticipantPubkeys(place, connectedActiveCall, currentPubkey),
      unread: place.unread,
      activeCall: connectedActiveCall?.geohash === place.geohash || place.occupantPubkeys.length > 0,
      pinnedNoteId: place.pinnedNoteId,
      roomID: resolveRoomID(place.geohash, operatorPubkey)
    };
  });
}

export function buildChatThreads(): ChatThread[] {
  return [];
}

export function buildPlaceTiles(
  places: Place[],
  notes: GeoNote[],
  activeCall: CallSession | null,
  currentPubkey: string,
  operatorPubkey = relayOperatorPubkey
) {
  const connectedActiveCall = isConnectedLiveKitCall(activeCall) ? activeCall : null;
  const effectivePlaces =
    connectedActiveCall && !places.some((place) => place.geohash === connectedActiveCall.geohash)
      ? [createEphemeralPlace(connectedActiveCall.geohash), ...places]
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
      participants: getPlaceParticipantPubkeys(place, connectedActiveCall, currentPubkey),
      roomID: resolveRoomID(place.geohash, operatorPubkey)
    };
  });
}

export function listRecentNotes(notes: GeoNote[]) {
  return sortNotesByRecency(notes);
}

function normalizeGeohashKey(geohash: string) {
  return geohash.trim().toLowerCase();
}

function buildBeaconGeohashSet(places: Place[]) {
  return new Set(places.map((place) => normalizeGeohashKey(place.geohash)).filter(Boolean));
}

export function isBeaconThreadNote(note: GeoNote, places: Place[]) {
  const normalizedGeohash = normalizeGeohashKey(note.geohash);
  if (!normalizedGeohash) {
    return false;
  }

  return buildBeaconGeohashSet(places).has(normalizedGeohash);
}

export function listPulseLocalNotes(places: Place[], notes: GeoNote[]) {
  const beaconGeohashes = buildBeaconGeohashSet(places);

  return listRecentNotes(notes).filter((note) => !beaconGeohashes.has(normalizeGeohashKey(note.geohash)));
}

export function listNotesByAuthor(notes: GeoNote[], pubkey: string) {
  return sortNotesByRecency(notes.filter((note) => note.authorPubkey === pubkey));
}

export function buildCrossRelayFeedItemsFromNotes(
  relay: Pick<RelayListEntry, "name" | "url">,
  notes: GeoNote[],
  places: Place[],
  profiles: ParticipantProfile[],
  options?: Partial<Pick<CrossRelayFeedItem, "sourceLabel" | "whyVisible">>
) {
  const relayLabel = relay.name.trim() || relay.url.trim();
  const relayUrl = relay.url.trim();
  const placesByGeohash = buildPlaceMap(places);
  const profilesByPubkey = buildParticipantMap(profiles);

  return sortNotesByRecency(notes).map((note) => ({
    id: note.id,
    relayName: relayLabel,
    relayUrl,
    authorPubkey: note.authorPubkey,
    authorName: profilesByPubkey.get(note.authorPubkey)?.displayName ?? note.authorPubkey,
    geohash: note.geohash,
    placeTitle:
      note.geohash === pulseNetworkGeohash
        ? pulseNetworkPlaceTitle
        : placesByGeohash.get(note.geohash)?.title ?? note.geohash,
    content: note.content,
    publishedAt: note.createdAt,
    sourceLabel: options?.sourceLabel ?? "Relay list",
    whyVisible: options?.whyVisible ?? "Fetched live from a configured relay."
  }));
}

export function mergeCrossRelayFeedItems(...collections: CrossRelayFeedItem[][]) {
  const merged: CrossRelayFeedItem[] = [];
  const seenIDs = new Set<string>();
  const seenFallbackKeys = new Set<string>();

  for (const collection of collections) {
    for (const item of collection) {
      const normalizedID = item.id.trim();
      const fallbackKey = [
        item.relayUrl,
        item.authorPubkey,
        item.geohash,
        item.publishedAt,
        item.content
      ].join("\u0000");

      if (normalizedID && seenIDs.has(normalizedID)) {
        continue;
      }
      if (seenFallbackKeys.has(fallbackKey)) {
        continue;
      }

      if (normalizedID) {
        seenIDs.add(normalizedID);
      }
      seenFallbackKeys.add(fallbackKey);
      merged.push(item);
    }
  }

  return merged.sort((left, right) => compareDescendingTimestamps(left.publishedAt, right.publishedAt));
}

export function buildPulseFeedItems(
  remoteItems: CrossRelayFeedItem[],
  followedPubkeys: string[] = []
) {
  const followedPubkeySet = new Set(
    followedPubkeys
      .map((pubkey) => normalizePublicKeyNpub(pubkey).trim())
      .filter(Boolean)
  );
  const laneTaggedItems = remoteItems
    .map((item) => ({
      ...item,
      lane:
        item.sourceLabel === "Direct follow" ||
        followedPubkeySet.has(normalizePublicKeyNpub(item.authorPubkey).trim())
          ? ("Following" as const)
          : ("For You" as const)
    }))
    .sort((left, right) => compareDescendingTimestamps(left.publishedAt, right.publishedAt));
  const aggregatedGroups = buildPulseFeedGroups(laneTaggedItems);
  return rankPulseFeedGroups(aggregatedGroups).map((group) => buildPulseFeedItem(group));
}

const pulseAggregationWindowMs = 45 * 60 * 1000;

function buildPulseFeedGroups(items: Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>) {
  const groups: Array<Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>> = [];
  let currentGroup: Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }> = [];

  for (const item of items) {
    if (currentGroup.length === 0 || shouldAggregatePulseFeedItem(currentGroup[0], item)) {
      currentGroup.push(item);
      continue;
    }

    groups.push(currentGroup);
    currentGroup = [item];
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function shouldAggregatePulseFeedItem(
  anchor: CrossRelayFeedItem & { lane: PulseFeedItem["lane"] },
  candidate: CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }
) {
  if (
    anchor.lane !== candidate.lane ||
    anchor.relayUrl !== candidate.relayUrl ||
    anchor.authorPubkey !== candidate.authorPubkey ||
    anchor.geohash !== candidate.geohash
  ) {
    return false;
  }

  const anchorTimestamp = parseTimestamp(anchor.publishedAt);
  const candidateTimestamp = parseTimestamp(candidate.publishedAt);
  if (anchorTimestamp == null || candidateTimestamp == null) {
    return false;
  }

  return Math.abs(anchorTimestamp - candidateTimestamp) <= pulseAggregationWindowMs;
}

function rankPulseFeedGroups(
  groups: Array<Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>>
) {
  const rankedGroups: Array<Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>> = [];
  const lanes: PulseFeedItem["lane"][] = ["For You", "Following"];

  for (const lane of lanes) {
    const laneGroups = groups.filter((group) => group[0]?.lane === lane);

    for (let index = 0; index < laneGroups.length; index += pulseFeedPageSize) {
      const batch = laneGroups.slice(index, index + pulseFeedPageSize);
      batch.sort(comparePulseFeedGroupRanking);
      rankedGroups.push(...batch);
    }
  }

  return rankedGroups;
}

function comparePulseFeedGroupRanking(
  left: Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>,
  right: Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>
) {
  const scoreDifference = computePulseFeedGroupScore(right) - computePulseFeedGroupScore(left);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const publishedAtComparison = compareDescendingTimestamps(left[0]?.publishedAt, right[0]?.publishedAt);
  if (publishedAtComparison !== 0) {
    return publishedAtComparison;
  }

  return (left[0]?.id ?? "").localeCompare(right[0]?.id ?? "");
}

function computePulseFeedGroupScore(group: Array<CrossRelayFeedItem & { lane: PulseFeedItem["lane"] }>) {
  return group.reduce(
    (total, item) =>
      total +
      (item.zapCount ?? 0) +
      (item.engagementScore ?? 0) +
      (item.followGraphScore ?? 0) +
      (item.followerCount ?? 0),
    0
  );
}

function buildPulseFeedItem(group: (CrossRelayFeedItem & { lane: PulseFeedItem["lane"] })[]): PulseFeedItem {
  const latestItem = group[0];

  return {
    id: `pulse-remote-${latestItem.id}`,
    lane: latestItem.lane,
    relayName: latestItem.relayName,
    relayUrl: latestItem.relayUrl,
    authorPubkey: latestItem.authorPubkey,
    authorName: latestItem.authorName,
    geohash: latestItem.geohash,
    placeTitle: latestItem.placeTitle,
    content: latestItem.content,
    publishedAt: latestItem.publishedAt,
    sourceLabel: latestItem.sourceLabel,
    whyVisible: latestItem.whyVisible,
    postCount: group.length,
    posts: group.map((item) => ({
      id: item.id,
      content: item.content,
      publishedAt: item.publishedAt
    }))
  };
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
