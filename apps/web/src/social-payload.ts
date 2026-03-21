import type {
  CrossRelayFeedItem,
  FeedSegment,
  GeoNote,
  ParticipantProfile,
  Place
} from "./data";

export type BootstrapPayload = {
  relay_name?: string;
  relay_operator_pubkey?: string;
  current_user_pubkey?: string;
  relay_url?: string;
  feed_segments?: FeedSegment[];
  cross_relay_items?: CrossRelayFeedItem[];
  places?: Place[];
  profiles?: ParticipantProfile[];
  notes?: GeoNote[];
};

export type CallIntentPayload = {
  geohash?: string;
  room_id?: string;
  place_title?: string;
  participant_pubkeys?: string[];
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asBoolean(value: unknown) {
  return value === true;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickValue(record: unknown, ...keys: string[]) {
  if (!record || typeof record !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return (record as Record<string, unknown>)[key];
    }
  }

  return undefined;
}

function normalizePlace(place: Place): Place {
  return {
    geohash: asString(pickValue(place, "geohash")),
    title: asString(pickValue(place, "title")),
    neighborhood: asString(pickValue(place, "neighborhood")),
    description: asString(pickValue(place, "description")),
    activitySummary: asString(pickValue(place, "activitySummary", "activity_summary")),
    tags: asStringArray(pickValue(place, "tags")),
    capacity: asNumber(pickValue(place, "capacity")),
    occupantPubkeys: asStringArray(pickValue(place, "occupantPubkeys", "occupant_pubkeys")),
    unread: asBoolean(pickValue(place, "unread")),
    pinnedNoteId: (() => {
      const value = pickValue(place, "pinnedNoteId", "pinned_note_id");
      return value ? asString(value) : undefined;
    })()
  };
}

function normalizeProfile(profile: ParticipantProfile): ParticipantProfile {
  const displayName = asString(pickValue(profile, "displayName", "display_name"));
  const name = asString(pickValue(profile, "name"));
  const picture = asString(pickValue(profile, "picture"));

  return {
    pubkey: asString(pickValue(profile, "pubkey")),
    displayName: displayName || name,
    name: name || undefined,
    picture: picture || undefined,
    role: asString(pickValue(profile, "role")),
    status: asString(pickValue(profile, "status")),
    bio: asString(pickValue(profile, "bio")),
    homeGeohash: (() => {
      const value = pickValue(profile, "homeGeohash", "home_geohash");
      return value ? asString(value) : undefined;
    })(),
    mic: asBoolean(pickValue(profile, "mic")),
    cam: asBoolean(pickValue(profile, "cam")),
    screenshare: asBoolean(pickValue(profile, "screenshare")),
    deafen: asBoolean(pickValue(profile, "deafen"))
  };
}

function normalizeNote(note: GeoNote): GeoNote {
  return {
    id: asString(pickValue(note, "id")),
    geohash: asString(pickValue(note, "geohash")),
    authorPubkey: asString(pickValue(note, "authorPubkey", "author_pubkey")),
    content: asString(pickValue(note, "content")),
    createdAt: asString(pickValue(note, "createdAt", "created_at")),
    replies: asNumber(pickValue(note, "replies"))
  };
}

function normalizeFeedSegment(segment: FeedSegment): FeedSegment {
  return {
    name: asString(segment?.name),
    description: asString(segment?.description)
  };
}

function normalizeCrossRelayItem(item: CrossRelayFeedItem): CrossRelayFeedItem {
  return {
    id: asString(pickValue(item, "id")),
    relayName: asString(pickValue(item, "relayName", "relay_name")),
    relayUrl: asString(pickValue(item, "relayUrl", "relay_url")),
    authorPubkey: asString(pickValue(item, "authorPubkey", "author_pubkey")),
    authorName: asString(pickValue(item, "authorName", "author_name")),
    geohash: asString(pickValue(item, "geohash")),
    placeTitle: asString(pickValue(item, "placeTitle", "place_title")),
    content: asString(pickValue(item, "content")),
    publishedAt: asString(pickValue(item, "publishedAt", "published_at")),
    sourceLabel: asString(pickValue(item, "sourceLabel", "source_label")),
    whyVisible: asString(pickValue(item, "whyVisible", "why_visible"))
  };
}

function filterWithLogging<T>(
  items: T[],
  predicate: (item: T) => boolean,
  entityName: string
): T[] {
  const valid: T[] = [];
  for (const item of items) {
    if (predicate(item)) {
      valid.push(item);
    } else {
      console.warn(`[social-payload] Filtered invalid ${entityName}:`, item);
    }
  }
  return valid;
}

export function normalizeBootstrapPayload(payload: BootstrapPayload) {
  const rawFeedSegments = Array.isArray(payload.feed_segments)
    ? payload.feed_segments.map(normalizeFeedSegment)
    : [];
  const rawCrossRelayItems = Array.isArray(payload.cross_relay_items)
    ? payload.cross_relay_items.map(normalizeCrossRelayItem)
    : [];
  const rawPlaces = Array.isArray(payload.places) ? payload.places.map(normalizePlace) : [];
  const rawProfiles = Array.isArray(payload.profiles)
    ? payload.profiles.map(normalizeProfile)
    : [];
  const rawNotes = Array.isArray(payload.notes) ? payload.notes.map(normalizeNote) : [];

  return {
    relay_name: payload.relay_name,
    relay_operator_pubkey: payload.relay_operator_pubkey,
    current_user_pubkey: asString(payload.current_user_pubkey),
    relay_url: payload.relay_url,
    feed_segments: filterWithLogging(rawFeedSegments, (s) => s.name.length > 0, "feed_segment"),
    cross_relay_items: filterWithLogging(rawCrossRelayItems, (i) => i.id.length > 0, "cross_relay_item"),
    places: filterWithLogging(rawPlaces, (p) => p.geohash.length > 0, "place"),
    profiles: filterWithLogging(rawProfiles, (p) => p.pubkey.length > 0, "profile"),
    notes: filterWithLogging(
      rawNotes,
      (n) => n.id.length > 0 && n.geohash.length > 0 && n.authorPubkey.length > 0,
      "note"
    )
  };
}

export function normalizeCallIntentPayload(payload: CallIntentPayload) {
  return {
    geohash: asString(payload.geohash),
    room_id: asString(payload.room_id),
    place_title: asString(payload.place_title),
    participant_pubkeys: asStringArray(payload.participant_pubkeys)
  };
}
