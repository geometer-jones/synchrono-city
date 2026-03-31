import type {
  CrossRelayFeedItem,
  FeedSegment,
  GeoNote,
  GeoNoteReaction,
  ParticipantProfile,
  Place,
  RelayListEntry
} from "./data";

export type BootstrapPayload = {
  relay_name?: string;
  relay_operator_pubkey?: string;
  current_user_pubkey?: string;
  relay_url?: string;
  relay_list?: RelayListEntry[];
  feed_segments?: FeedSegment[];
  cross_relay_items?: CrossRelayFeedItem[];
  places?: Place[];
  profiles?: ParticipantProfile[];
  notes?: GeoNote[];
};

export type CreateBeaconResponsePayload = {
  created?: boolean;
  beacon?: Place;
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

function asReactionArray(value: unknown): GeoNoteReaction[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const reactions = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const emoji = asString((entry as Record<string, unknown>).emoji).trim();
    const count = asNumber((entry as Record<string, unknown>).count);
    if (!emoji || count <= 0) {
      return [];
    }

    return [{ emoji, count }];
  });

  return reactions.length > 0 ? reactions : undefined;
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

export function normalizePlacePayload(place: Place): Place {
  const ownerPubkey = asString(pickValue(place, "ownerPubkey", "owner_pubkey"));

  return {
    geohash: asString(pickValue(place, "geohash")),
    title: asString(pickValue(place, "title")),
    neighborhood: asString(pickValue(place, "neighborhood")),
    description: asString(pickValue(place, "description")),
    activitySummary: asString(pickValue(place, "activitySummary", "activity_summary")),
    createdAt: (() => {
      const value = pickValue(place, "createdAt", "created_at");
      return value ? asString(value) : undefined;
    })(),
    picture: (() => {
      const value = pickValue(place, "picture", "pic");
      return value ? asString(value) : undefined;
    })(),
    ownerPubkey: ownerPubkey || undefined,
    memberPubkeys: (() => {
      const value = asStringArray(pickValue(place, "memberPubkeys", "member_pubkeys"));
      return value.length > 0 ? value : undefined;
    })(),
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

export function normalizeGeoNotePayload(note: GeoNote): GeoNote {
  return {
    id: asString(pickValue(note, "id")),
    geohash: asString(pickValue(note, "geohash")),
    authorPubkey: asString(pickValue(note, "authorPubkey", "author_pubkey")),
    content: asString(pickValue(note, "content")),
    createdAt: asString(pickValue(note, "createdAt", "created_at")),
    replies: asNumber(pickValue(note, "replies")),
    replyTargetId: (() => {
      const value = pickValue(note, "replyTargetId", "reply_target_id");
      return value ? asString(value) : undefined;
    })(),
    rootNoteId: (() => {
      const value = pickValue(note, "rootNoteId", "root_note_id");
      return value ? asString(value) : undefined;
    })(),
    taggedPubkeys: (() => {
      const value = asStringArray(pickValue(note, "taggedPubkeys", "tagged_pubkeys"));
      return value.length > 0 ? value : undefined;
    })(),
    reactions: asReactionArray(pickValue(note, "reactions"))
  };
}

export function isValidGeoNote(note: GeoNote) {
  return note.id.length > 0 && note.geohash.length > 0 && note.authorPubkey.length > 0;
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

function normalizeRelayListEntry(entry: RelayListEntry): RelayListEntry {
  return {
    url: asString(pickValue(entry, "url", "relay_url")),
    name: asString(pickValue(entry, "name")),
    inbox: asBoolean(pickValue(entry, "inbox")),
    outbox: asBoolean(pickValue(entry, "outbox"))
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
  const rawRelayList = Array.isArray(payload.relay_list) ? payload.relay_list.map(normalizeRelayListEntry) : [];
  const rawCrossRelayItems = Array.isArray(payload.cross_relay_items)
    ? payload.cross_relay_items.map(normalizeCrossRelayItem)
    : [];
  const rawPlaces = Array.isArray(payload.places) ? payload.places.map(normalizePlacePayload) : [];
  const rawProfiles = Array.isArray(payload.profiles)
    ? payload.profiles.map(normalizeProfile)
    : [];
  const rawNotes = Array.isArray(payload.notes) ? payload.notes.map(normalizeGeoNotePayload) : [];

  return {
    relay_name: payload.relay_name,
    relay_operator_pubkey: payload.relay_operator_pubkey,
    current_user_pubkey: asString(payload.current_user_pubkey),
    relay_url: payload.relay_url,
    relay_list: filterWithLogging(rawRelayList, (relay) => relay.url.length > 0, "relay_list_entry"),
    feed_segments: filterWithLogging(rawFeedSegments, (s) => s.name.length > 0, "feed_segment"),
    cross_relay_items: filterWithLogging(rawCrossRelayItems, (i) => i.id.length > 0, "cross_relay_item"),
    places: filterWithLogging(rawPlaces, (p) => p.geohash.length > 0, "place"),
    profiles: filterWithLogging(rawProfiles, (p) => p.pubkey.length > 0, "profile"),
    notes: filterWithLogging(
      rawNotes,
      isValidGeoNote,
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

export function normalizeCreateBeaconResponsePayload(payload: CreateBeaconResponsePayload) {
  return {
    created: payload.created === true,
    beacon: payload.beacon ? normalizePlacePayload(payload.beacon) : null
  };
}
