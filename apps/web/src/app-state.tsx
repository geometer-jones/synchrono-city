import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";

import { ApiError, apiFetch } from "./api";
import {
  buildBeaconProjection,
  type Beacon,
  type BeaconThread,
  type BeaconTile
} from "./beacon-projection";
import { getActiveLocalKey, loadStoredLocalKeyring } from "./key-manager";
import {
  buildPulseFeedItems,
  buildRelaySyntheses,
  buildChatThreads,
  buildGeoThreads,
  buildNoteMap,
  buildParticipantMap,
  buildPlaceMap,
  buildPlaceTiles,
  buildStoryExport,
  compareDescendingTimestamps,
  type CallMediaStream,
  createDefaultRelayListEntry,
  createFallbackCurrentUser,
  createFallbackParticipantProfile,
  createEphemeralPlace,
  currentUserPubkey as defaultCurrentUserPubkey,
  getSceneHealthStats,
  listNotesByAuthor,
  listNotesForPlace,
  listRecentNotes,
  relayName as defaultRelayName,
  relayOperatorPubkey as defaultRelayOperatorPubkey,
  relayURL as defaultRelayURL,
  resolveRoomID,
  type CallSession,
  type CrossRelayFeedItem,
  type FeedSegment,
  type GeoNote,
  type ParticipantProfile,
  type Place,
  type PulseFeedItem,
  type RelayListEntry,
  type RelaySynthesis
} from "./data";
import {
  connectLiveKitSession,
  type LiveKitMediaStreamState,
  type LiveKitPermissionState,
  type LiveKitParticipantState,
  type LiveKitSession
} from "./livekit-session";
import { hasNostrSigner, MediaAuthError, requestLiveKitToken, uploadBlossomFile } from "./media-client";
import {
  publishBeaconDefinition,
  publishGeoNote,
  publishGeoReaction,
  queryBeaconDefinitions,
  queryGeoNotes,
  queryProfileMetadata
} from "./nostr";
import {
  isValidGeoNote,
  normalizeGeoNotePayload,
  normalizeBootstrapPayload,
  normalizeCallIntentPayload,
  type BootstrapPayload,
  type CallIntentPayload
} from "./social-payload";
import { normalizePublicKeyNpub } from "./nostr-utils";
import { showToast } from "./toast";

type CallControl = "mic" | "cam" | "screenshare" | "deafen";

type PlaceMediaAsset = {
  id: string;
  geohash: string;
  url: string;
  mimeType: string;
  sha256: string;
  size: number;
  fileName: string;
  uploadedAt: string;
  uploadedByPubkey: string;
};

type LocalProfileMetadata = {
  name: string;
  picture: string;
  about: string;
};

type AppStateValue = {
  currentUser: ParticipantProfile;
  currentSessionSource: "bootstrap" | "local";
  relayName: string;
  relayOperatorPubkey: string;
  relayURL: string;
  relayList: RelayListEntry[];
  feedSegments: FeedSegment[];
  crossRelayItems: CrossRelayFeedItem[];
  pulseFeedItems: PulseFeedItem[];
  relaySyntheses: RelaySynthesis[];
  places: Place[];
  beacons: Beacon[];
  profiles: ParticipantProfile[];
  notes: GeoNote[];
  activeCall: CallSession | null;
  listPlaceMedia: (geohash: string) => PlaceMediaAsset[];
  getPlace: (geohash: string) => Place | undefined;
  getBeacon: (geohash: string) => Beacon | undefined;
  getProfile: (pubkey: string) => ParticipantProfile | undefined;
  getNote: (noteID: string) => GeoNote | undefined;
  getPlaceParticipants: (geohash: string) => ParticipantProfile[];
  getBeaconParticipants: (geohash: string) => ParticipantProfile[];
  listPlaceTiles: () => ReturnType<typeof buildPlaceTiles>;
  listGeoThreads: () => ReturnType<typeof buildGeoThreads>;
  listBeaconTiles: () => BeaconTile[];
  listBeaconThreads: () => BeaconThread[];
  listChatThreads: () => ReturnType<typeof buildChatThreads>;
  listNotesForPlace: (geohash: string) => GeoNote[];
  listNotesForBeacon: (geohash: string) => GeoNote[];
  listRecentNotes: () => GeoNote[];
  listNotesByAuthor: (pubkey: string) => GeoNote[];
  buildStoryExport: () => string;
  sceneHealth: ReturnType<typeof getSceneHealthStats>;
  setLocalCurrentUserPubkey: (pubkey: string | null) => void;
  setProfileMetadata: (pubkey: string, metadata: { name: string; picture: string; about: string }) => void;
  addRelayListEntry: (entry: { name: string; url: string }) => RelayListEntry;
  removeRelayListEntry: (url: string) => void;
  refreshSocialBootstrap: () => Promise<void>;
  refreshPlaceNotesFromRelay: (geohash: string) => Promise<void>;
  uploadBeaconPicture: (file: File, signal?: AbortSignal) => Promise<string>;
  createBeacon: (
    geohash: string,
    details: { name: string; picture: string; about: string; tags: string[] }
  ) => Promise<{ beacon: Place; created: boolean }>;
  createPlaceNote: (geohash: string, content: string, options?: { replyTo?: GeoNote }) => GeoNote | null;
  reactToPlaceNote: (noteID: string, emoji: string) => void;
  uploadPlaceMedia: (geohash: string, file: File, signal?: AbortSignal) => Promise<PlaceMediaAsset | null>;
  joinBeaconCall: (geohash: string) => void;
  joinPlaceCall: (geohash: string) => void;
  leaveBeaconCall: () => void;
  leavePlaceCall: () => void;
  toggleCallControl: (control: CallControl) => void;
  toggleCallMinimized: () => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);
const relayListStorageKey = "synchrono-city.relay-list-overrides.v1";

type RelayListOverrides = {
  added: RelayListEntry[];
  removed: string[];
};

const emptyRelayListOverrides: RelayListOverrides = {
  added: [],
  removed: []
};

export function AppStateProvider({ children }: PropsWithChildren) {
  const [relayName, setRelayName] = useState(defaultRelayName);
  const [relayOperatorPubkey, setRelayOperatorPubkey] = useState(defaultRelayOperatorPubkey);
  const [relayURL, setRelayURL] = useState(defaultRelayURL);
  const [relayBootstrapState, setRelayBootstrapState] = useState<RelayListEntry[]>([
    createDefaultRelayListEntry(defaultRelayName, defaultRelayURL)
  ]);
  const [relayListOverrides, setRelayListOverrides] = useState<RelayListOverrides>(() => loadRelayListOverrides());
  const [bootstrapCurrentUserPubkey, setBootstrapCurrentUserPubkey] = useState(defaultCurrentUserPubkey);
  const [currentUserPubkeyOverride, setCurrentUserPubkeyOverride] = useState<string | null>(
    () => getActiveLocalKey(loadStoredLocalKeyring())?.publicKeyNpub ?? null
  );
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [placesState, setPlacesState] = useState<Place[]>([]);
  const [relayBeaconPlacesState, setRelayBeaconPlacesState] = useState<Place[]>([]);
  const [profilesState, setProfilesState] = useState<ParticipantProfile[]>([]);
  const [localProfileMetadataState, setLocalProfileMetadataState] = useState<Record<string, LocalProfileMetadata>>({});
  const [notesState, setNotesState] = useState<GeoNote[]>([]);
  const [feedSegmentsState, setFeedSegmentsState] = useState<FeedSegment[]>([]);
  const [crossRelayItemsState, setCrossRelayItemsState] = useState<CrossRelayFeedItem[]>([]);
  const [placeMediaState, setPlaceMediaState] = useState<PlaceMediaAsset[]>([]);
  const activeCallRequestRef = useRef(0);
  const liveKitSessionRef = useRef<LiveKitSession | null>(null);
  const requestedProfileMetadataPubkeysRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    void apiFetch<BootstrapPayload>("/api/v1/social/bootstrap")
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const normalizedPayload = normalizeBootstrapPayload(payload);
        const nextRelayName = normalizedPayload.relay_name || defaultRelayName;
        const nextRelayURL = normalizedPayload.relay_url || defaultRelayURL;

        startTransition(() => {
          setRelayName(nextRelayName);
          setRelayOperatorPubkey(normalizedPayload.relay_operator_pubkey || defaultRelayOperatorPubkey);
          setRelayURL(nextRelayURL);
          setRelayBootstrapState(
            normalizedPayload.relay_list.length > 0
              ? normalizedPayload.relay_list
              : [createDefaultRelayListEntry(nextRelayName, nextRelayURL)]
          );
          setBootstrapCurrentUserPubkey(normalizedPayload.current_user_pubkey || defaultCurrentUserPubkey);
          setFeedSegmentsState(normalizedPayload.feed_segments);
          setCrossRelayItemsState(normalizedPayload.cross_relay_items);
          setPlacesState(normalizedPayload.places);
          setProfilesState(normalizedPayload.profiles);
          setNotesState(normalizedPayload.notes);
        });
      })
      .catch(() => {
        showToast("Unable to connect to server.", "error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      liveKitSessionRef.current?.disconnect();
      liveKitSessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestedProfileMetadataPubkeysRef.current.clear();
    setLocalProfileMetadataState({});
  }, [relayURL]);

  useEffect(() => {
    if (currentUserPubkeyOverride) {
      return;
    }

    const nostr = window.nostr;
    if (!nostr || typeof nostr.getPublicKey !== "function") {
      return;
    }

    let cancelled = false;

    void nostr.getPublicKey()
      .then((pubkey) => {
        if (cancelled) {
          return;
        }

        const normalizedPubkey = normalizePublicKeyNpub(pubkey).trim();
        if (!normalizedPubkey) {
          return;
        }

        setCurrentUserPubkeyOverride(normalizedPubkey);
      })
      .catch(() => {
        // Keep bootstrap identity when the signer pubkey is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserPubkeyOverride]);

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      return;
    }

    let cancelled = false;
    setRelayBeaconPlacesState([]);

    void queryBeaconDefinitions(relayURL)
      .then((relayBeacons) => {
        if (cancelled || relayBeacons.length === 0) {
          return;
        }

        setRelayBeaconPlacesState((current) => mergeRelayBeaconPlaces(current, relayBeacons));
      })
      .catch(() => {
        // Keep bootstrap places when the relay query is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [relayURL]);

  useEffect(() => {
    const localKeyring = loadStoredLocalKeyring();

    if (localKeyring.keys.length === 0) {
      return;
    }

    let cancelled = false;

    void queryProfileMetadata(
      relayURL,
      localKeyring.keys.map((key) => key.publicKeyNpub)
    )
      .then((metadataByPubkey) => {
        if (cancelled) {
          return;
        }

        setLocalProfileMetadataState((current) => {
          const nextEntries = { ...current };

          for (const key of localKeyring.keys) {
            const metadata = metadataByPubkey.get(key.publicKeyNpub);
            if (!metadata) {
              continue;
            }

            nextEntries[key.publicKeyNpub] = {
              name: metadata.name ?? "",
              picture: metadata.picture ?? "",
              about: metadata.about ?? ""
            };
          }

          return nextEntries;
        });
      })
      .catch(() => {
        // Keep bootstrap profile data when the relay query is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserPubkeyOverride, relayURL]);

  useEffect(() => {
    const pendingPubkeys = collectProfileMetadataTargets(notesState, activeCall).filter((pubkey) => {
      if (requestedProfileMetadataPubkeysRef.current.has(pubkey)) {
        return false;
      }

      return shouldQueryProfileMetadata(profilesState, localProfileMetadataState, pubkey);
    });

    if (pendingPubkeys.length === 0) {
      return;
    }

    pendingPubkeys.forEach((pubkey) => requestedProfileMetadataPubkeysRef.current.add(pubkey));

    let cancelled = false;

    void queryProfileMetadata(relayURL, pendingPubkeys)
      .then((metadataByPubkey) => {
        if (cancelled || metadataByPubkey.size === 0) {
          return;
        }

        setLocalProfileMetadataState((current) => {
          const nextEntries = { ...current };

          for (const [pubkey, metadata] of metadataByPubkey.entries()) {
            const normalizedName = metadata.name?.trim() ?? "";
            const normalizedPicture = metadata.picture?.trim() ?? "";
            const normalizedAbout = metadata.about?.trim() ?? "";

            if (!normalizedName && !normalizedPicture && !normalizedAbout) {
              continue;
            }

            nextEntries[pubkey] = {
              name: normalizedName,
              picture: normalizedPicture,
              about: normalizedAbout
            };
          }

          return nextEntries;
        });
      })
      .catch(() => {
        // Keep bootstrap profile data when the relay query is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [activeCall, localProfileMetadataState, notesState, profilesState, relayURL]);

  const effectiveCurrentUserPubkey =
    currentUserPubkeyOverride?.trim() || bootstrapCurrentUserPubkey.trim() || defaultCurrentUserPubkey;
  const effectivePlaces = useMemo(
    () => mergeRelayBeaconPlaces(placesState, relayBeaconPlacesState),
    [placesState, relayBeaconPlacesState]
  );
  const effectiveProfiles = useMemo(
    () => mergeLocalProfileMetadata(profilesState, localProfileMetadataState),
    [localProfileMetadataState, profilesState]
  );
  const effectiveNotes = notesState;
  const effectiveFeedSegments = feedSegmentsState;
  const effectiveCrossRelayItems = crossRelayItemsState;
  const relayListState = useMemo(
    () => mergeRelayListEntries(relayBootstrapState, relayListOverrides, relayName, relayURL),
    [relayBootstrapState, relayListOverrides, relayName, relayURL]
  );

  const placeMap = useMemo(() => buildPlaceMap(effectivePlaces), [effectivePlaces]);
  const profileMap = useMemo(() => buildParticipantMap(effectiveProfiles), [effectiveProfiles]);
  const noteMap = useMemo(() => buildNoteMap(effectiveNotes), [effectiveNotes]);
  const relaySyntheses = useMemo(
    () => buildRelaySyntheses(effectivePlaces, effectiveNotes),
    [effectivePlaces, effectiveNotes]
  );
  const beaconProjection = useMemo(
    () =>
      buildBeaconProjection(
        effectivePlaces,
        effectiveNotes,
        activeCall,
        effectiveCurrentUserPubkey,
        effectiveProfiles,
        relayOperatorPubkey
      ),
    [activeCall, effectiveCurrentUserPubkey, effectiveNotes, effectivePlaces, effectiveProfiles, relayOperatorPubkey]
  );
  const pulseFeedItems = useMemo(
    () =>
      buildPulseFeedItems(
        effectivePlaces,
        effectiveNotes,
        effectiveProfiles,
        effectiveCrossRelayItems,
        relayName,
        relayURL
      ),
    [effectiveCrossRelayItems, effectiveNotes, effectivePlaces, effectiveProfiles, relayName, relayURL]
  );

  const currentUser =
    profileMap.get(effectiveCurrentUserPubkey) ?? createFallbackCurrentUser(effectiveCurrentUserPubkey);
  const sceneHealth = useMemo(
    () => getSceneHealthStats(effectivePlaces, effectiveNotes),
    [effectivePlaces, effectiveNotes]
  );

  function disconnectLiveKitSession() {
    liveKitSessionRef.current?.disconnect();
    liveKitSessionRef.current = null;
  }

  function syncLiveKitParticipants(
    roomID: string,
    geohash: string,
    participants: LiveKitParticipantState[]
  ) {
    setActiveCall((current) => {
      if (!current || current.roomID !== roomID || current.geohash !== geohash) {
        return current;
      }

      const localParticipant = participants.find((participant) => participant.isLocal);

      return {
        ...current,
        participantPubkeys: participants.map((participant) => participant.identity),
        participantStates: participants.map((participant) => ({
          pubkey: participant.identity,
          mic: participant.mic,
          cam: participant.cam,
          screenshare: participant.screenshare
        })),
        mic: localParticipant?.mic ?? current.mic,
        cam: localParticipant?.cam ?? current.cam,
        screenshare: localParticipant?.screenshare ?? current.screenshare
      };
    });
  }

  function syncLiveKitMediaStreams(roomID: string, geohash: string, streams: LiveKitMediaStreamState[]) {
    setActiveCall((current) => {
      if (!current || current.roomID !== roomID || current.geohash !== geohash) {
        return current;
      }

      return {
        ...current,
        mediaStreams: streams.map<CallMediaStream>((stream) => ({
          id: stream.id,
          pubkey: stream.participantIdentity,
          source: stream.source,
          isLocal: stream.isLocal,
          track: stream.track
        }))
      };
    });
  }

  const value = useMemo<AppStateValue>(() => {
    const listParticipantProfiles = (geohash: string) => {
      const participants = beaconProjection.participantPubkeysByGeohash.get(geohash);
      if (!participants) {
        return [];
      }

      const participantStates =
        activeCall?.geohash === geohash
          ? new Map(activeCall.participantStates.map((participant) => [participant.pubkey, participant]))
          : new Map<string, { pubkey: string; mic: boolean; cam: boolean; screenshare: boolean }>();

      return participants.map((pubkey) => {
        const profile = profileMap.get(pubkey) ?? createFallbackParticipantProfile(pubkey);
        const liveState = participantStates.get(pubkey);

        return {
          ...profile,
          mic: liveState?.mic ?? profile.mic,
          cam: liveState?.cam ?? profile.cam,
          screenshare: liveState?.screenshare ?? profile.screenshare
        };
      });
    };

    function leaveBeaconCall() {
      activeCallRequestRef.current += 1;
      disconnectLiveKitSession();
      setActiveCall(null);
    }

    function joinBeaconCall(geohash: string) {
      const place = placeMap.get(geohash) ?? createEphemeralPlace(geohash);

      disconnectLiveKitSession();
      setActiveCall(null);

      const requestID = activeCallRequestRef.current + 1;
      activeCallRequestRef.current = requestID;

      const applyIntent = (
        roomID: string,
        placeTitle: string,
        participantPubkeys: string[],
        overrides?: Partial<CallSession>
      ) => {
        setActiveCall((current) => ({
          geohash,
          roomID,
          placeTitle,
          startedAt:
            overrides?.startedAt ??
            (current?.geohash === geohash ? current.startedAt : new Date().toISOString()),
          participantPubkeys,
          participantStates: participantPubkeys.map((pubkey) => {
            const profile =
              profileMap.get(pubkey) ??
              (pubkey === effectiveCurrentUserPubkey ? currentUser : createFallbackParticipantProfile(pubkey));

            return {
              pubkey,
              mic: profile.mic,
              cam: profile.cam,
              screenshare: profile.screenshare
            };
          }),
          mediaStreams: overrides?.mediaStreams ?? [],
          transport: overrides?.transport ?? current?.transport ?? "local",
          connectionState: overrides?.connectionState ?? current?.connectionState ?? "local_preview",
          statusMessage:
            overrides?.statusMessage ??
            current?.statusMessage ??
            "Room intent resolved locally.",
          identity: overrides?.identity ?? current?.identity,
          liveKitURL: overrides?.liveKitURL ?? current?.liveKitURL,
          expiresAt: overrides?.expiresAt ?? current?.expiresAt,
          canPublish: overrides?.canPublish ?? current?.canPublish,
          canSubscribe: overrides?.canSubscribe ?? current?.canSubscribe,
          mic: current?.geohash === geohash ? current.mic : currentUser.mic,
          cam: current?.geohash === geohash ? current.cam : currentUser.cam,
          screenshare: current?.geohash === geohash ? current.screenshare : currentUser.screenshare,
          deafen: current?.geohash === geohash ? current.deafen : currentUser.deafen,
          minimized: false
        }));
      };

      const applyIfCurrent = (
        roomID: string,
        placeTitle: string,
        participantPubkeys: string[],
        overrides?: Partial<CallSession>
      ) => {
        if (requestID !== activeCallRequestRef.current) {
          return;
        }
        applyIntent(roomID, placeTitle, participantPubkeys, overrides);
      };

      const fallbackParticipants = place.occupantPubkeys.includes(effectiveCurrentUserPubkey)
        ? place.occupantPubkeys
        : [effectiveCurrentUserPubkey, ...place.occupantPubkeys];
      const fallbackRoomID = resolveRoomID(geohash, relayOperatorPubkey);
      const activeLocalKey = getActiveLocalKey(loadStoredLocalKeyring());
      const mediaSigningOptions = activeLocalKey?.privateKeyHex
        ? {
            privateKeyHex: activeLocalKey.privateKeyHex,
            publicKeyHex: activeLocalKey.publicKeyHex
          }
        : undefined;
      const signerAvailable = Boolean(mediaSigningOptions) || hasNostrSigner();

      if (!signerAvailable) {
        applyIntent(fallbackRoomID, place.title, fallbackParticipants, {
          transport: "local",
          connectionState: "local_preview",
          statusMessage: "Signer required for LiveKit media. Room intent stays local."
        });
      }

      const intentPromise =
        import.meta.env.MODE === "test"
          ? Promise.resolve<CallIntentPayload>({
              geohash,
              room_id: fallbackRoomID,
              place_title: place.title,
              participant_pubkeys: fallbackParticipants
            })
          : apiFetch<CallIntentPayload>("/api/v1/social/call-intent", {
              method: "POST",
              body: JSON.stringify({
                geohash,
                pubkey: effectiveCurrentUserPubkey
              })
            }).catch((error) => {
              if (!(error instanceof ApiError) || error.status >= 500) {
                showToast("Using fallback room. Server unavailable.", "info");
              }
              return {
                geohash,
                room_id: fallbackRoomID,
                place_title: place.title,
                participant_pubkeys: fallbackParticipants
              };
            });

      void intentPromise.then(async (payload) => {
        const normalizedPayload = normalizeCallIntentPayload(payload);
        const roomID = normalizedPayload.room_id || fallbackRoomID;
        const placeTitle = place.title || normalizedPayload.place_title || `Field tile ${geohash}`;
        const participantPubkeys =
          normalizedPayload.participant_pubkeys.length > 0
            ? normalizedPayload.participant_pubkeys
            : fallbackParticipants;

        if (!signerAvailable) {
          applyIfCurrent(roomID, placeTitle, participantPubkeys, {
            transport: "local",
            connectionState: "local_preview",
            statusMessage: "Signer required for LiveKit media. Room intent stays local."
          });
          return;
        }

        try {
          const tokenResponse = await requestLiveKitToken(roomID, mediaSigningOptions);
          const initialCanPublish = tokenResponse.token.grants.can_publish;
          const initialCanSubscribe = tokenResponse.token.grants.can_subscribe;
          applyIfCurrent(roomID, placeTitle, participantPubkeys, {
            transport: "livekit",
            connectionState: "connecting",
            statusMessage: resolveLiveKitStatusMessage(
              "connecting",
              initialCanPublish,
              "Connecting to LiveKit room."
            ),
            identity: tokenResponse.token.identity,
            liveKitURL: tokenResponse.token.livekit_url,
            expiresAt: tokenResponse.token.expires_at,
            canPublish: initialCanPublish,
            canSubscribe: initialCanSubscribe
          });

          const session = await connectLiveKitSession({
            url: tokenResponse.token.livekit_url,
            token: tokenResponse.token.token,
            onParticipantsChanged: (participants) => {
              if (requestID !== activeCallRequestRef.current) {
                return;
              }
              syncLiveKitParticipants(roomID, geohash, participants);
            },
            onMediaStreamsChanged: (streams) => {
              if (requestID !== activeCallRequestRef.current) {
                return;
              }
              syncLiveKitMediaStreams(roomID, geohash, streams);
            },
            onConnectionStatus: (status, message) => {
              if (requestID !== activeCallRequestRef.current) {
                return;
              }

              const nextConnectionState =
                status === "connected"
                  ? "connected"
                  : status === "reconnecting"
                    ? "connecting"
                    : status === "disconnected"
                      ? "failed"
                      : "connecting";

              setActiveCall((current) =>
                current && current.roomID === roomID
                  ? {
                      ...current,
                      transport: status === "connected" ? "livekit" : current.transport,
                      connectionState: nextConnectionState,
                      statusMessage: resolveLiveKitStatusMessage(
                        nextConnectionState,
                        current.canPublish,
                        message
                      )
                    }
                  : current
              );
            },
            onPermissionsChanged: (permissions: LiveKitPermissionState) => {
              if (requestID !== activeCallRequestRef.current) {
                return;
              }

              setActiveCall((current) =>
                current && current.roomID === roomID
                  ? {
                      ...current,
                      canPublish: permissions.canPublish,
                      canSubscribe: permissions.canSubscribe,
                      statusMessage: resolveLiveKitStatusMessage(
                        current.connectionState,
                        permissions.canPublish,
                        current.statusMessage,
                        current.canPublish
                      )
                    }
                  : current
              );
            }
          });

          if (requestID !== activeCallRequestRef.current) {
            session.disconnect();
            return;
          }

          liveKitSessionRef.current = session;
          session.setDeafenEnabled(currentUser.deafen);

          try {
            if (tokenResponse.token.grants.can_publish) {
              if (currentUser.mic) {
                await session.setMicrophoneEnabled(true);
              }
              if (currentUser.cam) {
                await session.setCameraEnabled(true);
              }
            }
          } catch (mediaError) {
            showToast(
              mediaError instanceof Error
                ? mediaError.message
                : "Connected to room, but media device setup failed.",
              "error"
            );
          }
        } catch (error) {
          disconnectLiveKitSession();
          const message =
            error instanceof MediaAuthError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Media temporarily unavailable.";

          if (requestID !== activeCallRequestRef.current) {
            return;
          }

          setActiveCall(null);
          showToast(message, "info");
        }
      });
    }

    return {
      currentUser,
      currentSessionSource: currentUserPubkeyOverride ? "local" : "bootstrap",
      relayName,
      relayOperatorPubkey,
      relayURL,
      relayList: relayListState,
      feedSegments: effectiveFeedSegments,
      crossRelayItems: effectiveCrossRelayItems,
      pulseFeedItems,
      relaySyntheses,
      places: effectivePlaces,
      beacons: beaconProjection.beacons,
      profiles: effectiveProfiles,
      notes: effectiveNotes,
      activeCall,
      listPlaceMedia: (geohash) =>
        placeMediaState
          .filter((asset) => asset.geohash === geohash)
          .sort((left, right) => compareDescendingTimestamps(left.uploadedAt, right.uploadedAt)),
      getPlace: (geohash) =>
        placeMap.get(geohash) ??
        (activeCall?.geohash === geohash ? createEphemeralPlace(geohash) : undefined),
      getBeacon: (geohash) => beaconProjection.beaconMap.get(geohash),
      getProfile: (pubkey) => profileMap.get(pubkey),
      getNote: (noteID) => noteMap.get(noteID),
      getPlaceParticipants: listParticipantProfiles,
      getBeaconParticipants: listParticipantProfiles,
      listPlaceTiles: () =>
        beaconProjection.tiles.map((tile) => ({
          geohash: tile.geohash,
          title: tile.name,
          latestNote: tile.latestNote,
          noteCount: tile.noteCount,
          participants: tile.participants,
          roomID: tile.roomID
        })),
      listGeoThreads: () =>
        beaconProjection.threads.map((thread) => ({
          geohash: thread.geohash,
          title: thread.name,
          summary: thread.about,
          noteCount: thread.noteCount,
          participants: thread.participants,
          unread: thread.unread,
          activeCall: thread.activeCall,
          pinnedNoteId: thread.pinnedNoteId,
          roomID: thread.roomID
        })),
      listBeaconTiles: () => beaconProjection.tiles,
      listBeaconThreads: () => beaconProjection.threads,
      listChatThreads: () => buildChatThreads(),
      listNotesForPlace: (geohash) => listNotesForPlace(effectiveNotes, geohash),
      listNotesForBeacon: (geohash) => beaconProjection.notesByGeohash.get(geohash) ?? [],
      listRecentNotes: () => listRecentNotes(effectiveNotes),
      listNotesByAuthor: (pubkey) => listNotesByAuthor(effectiveNotes, pubkey),
      buildStoryExport: () =>
        buildStoryExport(
          effectivePlaces,
          effectiveNotes,
          effectiveProfiles,
          activeCall,
          effectiveCurrentUserPubkey,
          relayOperatorPubkey
        ),
      sceneHealth,
      setLocalCurrentUserPubkey: (pubkey) => {
        const nextPubkey = pubkey?.trim() || null;
        setCurrentUserPubkeyOverride(nextPubkey);
      },
      setProfileMetadata: (pubkey, metadata) => {
        const normalizedPubkey = pubkey.trim();
        if (!normalizedPubkey) {
          return;
        }

        setLocalProfileMetadataState((current) => ({
          ...current,
          [normalizedPubkey]: {
            name: metadata.name.trim(),
            picture: metadata.picture.trim(),
            about: metadata.about.trim()
          }
        }));
      },
      addRelayListEntry: ({ name, url }) => {
        const nextEntry = createRelayListEntry(name, url);
        setRelayListOverrides((current) => {
          const nextOverrides = {
            added: [...current.added.filter((entry) => entry.url !== nextEntry.url), nextEntry],
            removed: current.removed.filter((entryURL) => entryURL !== nextEntry.url)
          };
          storeRelayListOverrides(nextOverrides);
          return nextOverrides;
        });
        return nextEntry;
      },
      removeRelayListEntry: (url) => {
        const normalizedURL = normalizeRelayListURL(url);
        const primaryRelayURL = normalizeRelayListURL(relayURL);

        if (normalizedURL === primaryRelayURL) {
          return;
        }

        setRelayListOverrides((current) => {
          const nextOverrides = {
            added: current.added.filter((entry) => entry.url !== normalizedURL),
            removed: current.removed.includes(normalizedURL)
              ? current.removed
              : [...current.removed, normalizedURL]
          };
          storeRelayListOverrides(nextOverrides);
          return nextOverrides;
        });
      },
      refreshSocialBootstrap: async () => {
        if (import.meta.env.MODE === "test") {
          return;
        }

        const payload = normalizeBootstrapPayload(await apiFetch<BootstrapPayload>("/api/v1/social/bootstrap"));
        const nextRelayName = payload.relay_name || defaultRelayName;
        const nextRelayURL = payload.relay_url || defaultRelayURL;

        startTransition(() => {
          setRelayName(nextRelayName);
          setRelayOperatorPubkey(payload.relay_operator_pubkey || defaultRelayOperatorPubkey);
          setRelayURL(nextRelayURL);
          setRelayBootstrapState(
            payload.relay_list.length > 0
              ? payload.relay_list
              : [createDefaultRelayListEntry(nextRelayName, nextRelayURL)]
          );
          setBootstrapCurrentUserPubkey(payload.current_user_pubkey || defaultCurrentUserPubkey);
          setFeedSegmentsState(payload.feed_segments);
          setCrossRelayItemsState(payload.cross_relay_items);
          setPlacesState(payload.places);
          setProfilesState(payload.profiles);
          setNotesState(payload.notes);
        });
      },
      refreshPlaceNotesFromRelay: async (geohash) => {
        const normalizedGeohash = geohash.trim().toLowerCase();
        if (!normalizedGeohash) {
          return;
        }

        try {
          const relayNotes = await queryGeoNotes(relayURL, normalizedGeohash);
          if (relayNotes.length === 0) {
            return;
          }

          setNotesState((previous) => mergeRelayNotes(previous, relayNotes));
        } catch {
          // Keep bootstrap notes when the relay query is unavailable.
        }
      },
      uploadBeaconPicture: async (file, signal) => {
        const activeLocalKey = getActiveLocalKey(loadStoredLocalKeyring());
        const upload = await uploadBlossomFile(
          file,
          signal,
          activeLocalKey
            ? {
                privateKeyHex: activeLocalKey.privateKeyHex,
                publicKeyHex: activeLocalKey.publicKeyHex
              }
            : undefined
        );

        showToast(`Uploaded ${file.name} to Blossom.`, "info");
        return upload.url;
      },
      createBeacon: async (geohash, details) => {
        const normalizedGeohash = geohash.trim().toLowerCase();
        const normalizedName = details.name.trim();
        const normalizedPicture = details.picture.trim();
        const normalizedAbout = details.about.trim();
        const normalizedTags = normalizeBeaconTags(details.tags);

        if (!normalizedGeohash) {
          throw new Error("Beacon location is required.");
        }

        const existingPlace = placeMap.get(normalizedGeohash);
        if (existingPlace) {
          return {
            beacon: existingPlace,
            created: false
          };
        }

        if (import.meta.env.MODE === "test") {
          if (!normalizedName) {
            throw new Error("Beacon name is required.");
          }

          const nextBeacon: Place = {
            geohash: normalizedGeohash,
            title: normalizedName,
            neighborhood: "Newly lit beacon",
            description: normalizedAbout,
            activitySummary: "Freshly lit beacon.",
            createdAt: new Date().toISOString(),
            picture: normalizedPicture || undefined,
            ownerPubkey: effectiveCurrentUserPubkey,
            memberPubkeys: [effectiveCurrentUserPubkey],
            tags: ["beacon", "geohash8", ...normalizedTags],
            capacity: 8,
            occupantPubkeys: [],
            unread: false
          };

          setPlacesState((previous) => upsertPlace(previous, nextBeacon));
          return {
            beacon: nextBeacon,
            created: true
          };
        }

        const activeLocalKey = getActiveLocalKey(loadStoredLocalKeyring());
        const signingOptions = activeLocalKey
          ? {
              privateKeyHex: activeLocalKey.privateKeyHex,
              publicKeyHex: activeLocalKey.publicKeyHex
            }
          : undefined;

        if (!signingOptions && !hasNostrSigner()) {
          throw new Error("A Nostr signer or local keypair is required to create a beacon.");
        }

        const existingRelayBeacons = await queryBeaconDefinitions(relayURL, normalizedGeohash);
        if (existingRelayBeacons.length > 0) {
          const beacon = existingRelayBeacons[0];
          setRelayBeaconPlacesState((previous) => upsertPlace(previous, beacon));
          return {
            beacon,
            created: false
          };
        }

        if (!normalizedName) {
          throw new Error("Beacon name is required.");
        }

        const beacon = await publishBeaconDefinition(
          relayURL,
          normalizedGeohash,
          {
            name: normalizedName,
            picture: normalizedPicture,
            about: normalizedAbout,
            tags: normalizedTags
          },
          signingOptions
        );
        setRelayBeaconPlacesState((previous) => upsertPlace(previous, beacon));
        return {
          beacon,
          created: true
        };
      },
      createPlaceNote: (geohash, content, options) => {
        const trimmed = content.trim();
        if (!trimmed) {
          return null;
        }

        const replyTo = options?.replyTo ? noteMap.get(options.replyTo.id) ?? options.replyTo : undefined;
        const activeLocalKey = getActiveLocalKey(loadStoredLocalKeyring());
        const signingOptions = activeLocalKey
          ? {
              privateKeyHex: activeLocalKey.privateKeyHex,
              publicKeyHex: activeLocalKey.publicKeyHex
            }
          : undefined;
        const signerAvailable = Boolean(signingOptions) || hasNostrSigner();

        if (replyTo && import.meta.env.MODE !== "test" && !isRelayBackedEventID(replyTo.id)) {
          showToast("Wait for this note to sync from the relay before sending a tagged reply.", "info");
          return null;
        }

        if (replyTo && import.meta.env.MODE !== "test" && !signerAvailable) {
          showToast("A Nostr signer or local keypair is required to publish a tagged reply.", "info");
          return null;
        }

        const nextNote = {
          id: `note-${Date.now()}`,
          geohash,
          authorPubkey: effectiveCurrentUserPubkey,
          content: trimmed,
          createdAt: new Date().toISOString(),
          replies: 0,
          replyTargetId: replyTo?.id,
          rootNoteId: replyTo?.rootNoteId ?? replyTo?.id,
          taggedPubkeys:
            replyTo ? dedupeTaggedPubkeys([replyTo.authorPubkey, ...(replyTo.taggedPubkeys ?? [])]) : undefined,
          reactions: []
        };

        setNotesState((previous) => addOptimisticNote(previous, nextNote));

        if (signerAvailable) {
          void publishGeoNote(
            relayURL,
            geohash,
            trimmed,
            signingOptions,
            replyTo
              ? {
                  replyTarget: replyTo
                }
              : undefined
          )
            .then((publishedNote) => {
              const normalizedPublishedNote = normalizePublishedGeoNote(
                publishedNote,
                geohash,
                replyTo,
                nextNote.taggedPubkeys
              );

              setNotesState((previous) => replaceNoteByID(previous, nextNote.id, normalizedPublishedNote));
            })
            .catch((error) => {
              showToast(
                error instanceof Error
                  ? `${
                      replyTo ? "Reply saved locally, but relay publish failed" : "Note saved in Concierge, but relay publish failed"
                    }: ${error.message}`
                  : replyTo
                    ? "Reply saved locally, but relay publish failed."
                    : "Note saved in Concierge, but relay publish failed.",
                "info"
              );
            });
        } else if (import.meta.env.MODE !== "test") {
          showToast("Note saved in Concierge, but no Nostr signer is available for relay publish.", "info");
        }

        if (!replyTo && import.meta.env.MODE !== "test") {
          void apiFetch<GeoNote>("/api/v1/social/notes", {
            method: "POST",
            body: JSON.stringify({
              geohash,
              author_pubkey: effectiveCurrentUserPubkey,
              content: trimmed
            })
          })
            .then((serverNote) => {
              const normalizedServerNote = normalizeGeoNotePayload(serverNote);

              if (!isValidGeoNote(normalizedServerNote)) {
                return;
              }

              setNotesState((previous) => reconcileServerNote(previous, nextNote.id, normalizedServerNote));
            })
            .catch(() => {
              showToast("Note saved locally. Will sync when connected.", "info");
            });
        }
        return nextNote;
      },
      reactToPlaceNote: (noteID, emoji) => {
        const normalizedEmoji = emoji.trim();
        if (!normalizedEmoji) {
          return;
        }

        const note = noteMap.get(noteID);
        if (!note) {
          return;
        }

        if (import.meta.env.MODE !== "test" && !isRelayBackedEventID(note.id)) {
          showToast("Wait for this note to sync from the relay before reacting.", "info");
          return;
        }

        const activeLocalKey = getActiveLocalKey(loadStoredLocalKeyring());
        const signingOptions = activeLocalKey
          ? {
              privateKeyHex: activeLocalKey.privateKeyHex,
              publicKeyHex: activeLocalKey.publicKeyHex
            }
          : undefined;

        if (import.meta.env.MODE !== "test" && !signingOptions && !hasNostrSigner()) {
          showToast("A Nostr signer or local keypair is required to publish emoji reactions.", "info");
          return;
        }

        setNotesState((previous) => updateNoteReaction(previous, noteID, normalizedEmoji, 1));

        if (import.meta.env.MODE === "test") {
          return;
        }

        void publishGeoReaction(relayURL, note, normalizedEmoji, signingOptions).catch((error) => {
          setNotesState((previous) => updateNoteReaction(previous, noteID, normalizedEmoji, -1));
          showToast(
            error instanceof Error ? `Unable to publish emoji reaction: ${error.message}` : "Unable to publish emoji reaction.",
            "info"
          );
        });
      },
      uploadPlaceMedia: async (geohash, file, signal) => {
        const place = placeMap.get(geohash);
        if (!place) {
          return null;
        }

        const upload = await uploadBlossomFile(file, signal);
        const nextAsset: PlaceMediaAsset = {
          id: `${upload.sha256}-${Date.now()}`,
          geohash,
          url: upload.url,
          mimeType: upload.mimeType,
          sha256: upload.sha256,
          size: upload.size,
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          uploadedByPubkey: effectiveCurrentUserPubkey
        };

        setPlaceMediaState((previous) => [nextAsset, ...previous]);
        showToast(`Uploaded ${file.name} to Blossom for ${place.title}.`, "info");
        return nextAsset;
      },
      joinBeaconCall,
      joinPlaceCall: joinBeaconCall,
      leaveBeaconCall,
      leavePlaceCall: leaveBeaconCall,
      toggleCallControl: (control) => {
        if (!activeCall) {
          return;
        }

        const session = liveKitSessionRef.current;
        const requiresPublishedMedia = control === "mic" || control === "cam" || control === "screenshare";

        if (requiresPublishedMedia) {
          if (activeCall.transport !== "livekit" || activeCall.connectionState !== "connected" || !session) {
            showToast("Connect to the LiveKit room before changing media controls.", "info");
            return;
          }

          if (activeCall.canPublish === false) {
            showToast("This room token does not allow publishing media.", "info");
            return;
          }
        }

        const roomID = activeCall.roomID;
        const nextValue = !activeCall[control];

        setActiveCall((current) => {
          if (!current || current.roomID !== roomID) {
            return current;
          }

          return {
            ...current,
            [control]: nextValue,
            participantStates: updateLocalParticipantControlState(
              current,
              effectiveCurrentUserPubkey,
              control,
              nextValue
            )
          };
        });

        if (!session) {
          return;
        }

        if (control === "deafen") {
          session.setDeafenEnabled(nextValue);
          return;
        }

        const setter =
          control === "mic"
            ? session.setMicrophoneEnabled
            : control === "cam"
              ? session.setCameraEnabled
              : session.setScreenShareEnabled;

        void setter(nextValue).catch((error: unknown) => {
          setActiveCall((latest) =>
            latest && latest.roomID === roomID
              ? {
                  ...latest,
                  [control]: !nextValue,
                  participantStates: updateLocalParticipantControlState(
                    latest,
                    effectiveCurrentUserPubkey,
                    control,
                    !nextValue
                  )
                }
              : latest
          );
          showToast(error instanceof Error ? error.message : "Media control failed.", "error");
        });
      },
      toggleCallMinimized: () => {
        setActiveCall((current) =>
          current
            ? {
                ...current,
                minimized: !current.minimized
              }
            : current
        );
      }
    };
  }, [
      activeCall,
      beaconProjection,
      currentUser,
      currentUserPubkeyOverride,
      effectiveCurrentUserPubkey,
      effectiveFeedSegments,
      effectiveCrossRelayItems,
      effectiveNotes,
      effectivePlaces,
      effectiveProfiles,
      noteMap,
      placeMediaState,
      placeMap,
      pulseFeedItems,
      profileMap,
      relayBootstrapState,
      relayListOverrides,
      relayListState,
      relayName,
      relayOperatorPubkey,
      relayURL,
      relaySyntheses,
      sceneHealth
    ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return value;
}

function updateLocalParticipantControlState(
  call: CallSession,
  pubkey: string,
  control: CallControl,
  value: boolean
) {
  if (control === "deafen") {
    return call.participantStates;
  }

  const existingIndex = call.participantStates.findIndex((participant) => participant.pubkey === pubkey);

  if (existingIndex === -1) {
    return [
      ...call.participantStates,
      {
        pubkey,
        mic: control === "mic" ? value : call.mic,
        cam: control === "cam" ? value : call.cam,
        screenshare: control === "screenshare" ? value : call.screenshare
      }
    ];
  }

  return call.participantStates.map((participant) =>
    participant.pubkey === pubkey
      ? {
          ...participant,
          mic: control === "mic" ? value : participant.mic,
          cam: control === "cam" ? value : participant.cam,
          screenshare: control === "screenshare" ? value : participant.screenshare
        }
      : participant
  );
}

function mergeLocalProfileMetadata(
  profiles: ParticipantProfile[],
  metadataByPubkey: Record<string, LocalProfileMetadata>
) {
  const nextProfiles = [...profiles];

  for (const [pubkey, metadata] of Object.entries(metadataByPubkey)) {
    const existingIndex = nextProfiles.findIndex((profile) => profile.pubkey === pubkey);
    const baseProfile =
      existingIndex === -1 ? createFallbackParticipantProfile(pubkey) : nextProfiles[existingIndex];
    const normalizedName = metadata.name.trim();
    const normalizedPicture = metadata.picture.trim();
    const normalizedAbout = metadata.about.trim();
    const nextProfile = {
      ...baseProfile,
      pubkey,
      displayName: normalizedName || pubkey,
      name: normalizedName || undefined,
      picture: normalizedPicture || undefined,
      bio: normalizedAbout
    };

    if (existingIndex === -1) {
      nextProfiles.unshift(nextProfile);
      continue;
    }

    nextProfiles[existingIndex] = nextProfile;
  }

  return nextProfiles;
}

function collectProfileMetadataTargets(notes: GeoNote[], activeCall: CallSession | null) {
  return Array.from(
    new Set([
      ...notes.map((note) => note.authorPubkey.trim()).filter(Boolean),
      ...(activeCall?.participantPubkeys.map((pubkey) => pubkey.trim()).filter(Boolean) ?? [])
    ])
  );
}

function shouldQueryProfileMetadata(
  profiles: ParticipantProfile[],
  metadataByPubkey: Record<string, LocalProfileMetadata>,
  pubkey: string
) {
  const profile = profiles.find((entry) => entry.pubkey === pubkey);
  const localMetadata = metadataByPubkey[pubkey];

  const knownName =
    localMetadata?.name.trim() ||
    profile?.name?.trim() ||
    (profile?.displayName?.trim() && profile.displayName.trim() !== pubkey ? profile.displayName.trim() : "");
  const knownPicture = localMetadata?.picture.trim() || profile?.picture?.trim() || "";

  return !knownName || !knownPicture;
}

function addOptimisticNote(currentNotes: GeoNote[], nextNote: GeoNote) {
  const nextNotes = [nextNote, ...currentNotes];

  if (!nextNote.replyTargetId) {
    return nextNotes;
  }

  return nextNotes.map((note) =>
    note.id === nextNote.replyTargetId
      ? {
          ...note,
          replies: note.replies + 1
        }
      : note
  );
}

function replaceNoteByID(currentNotes: GeoNote[], noteID: string, nextNote: GeoNote) {
  return currentNotes.map((note) => (note.id === noteID ? nextNote : note));
}

function reconcileServerNote(currentNotes: GeoNote[], optimisticNoteID: string, serverNote: GeoNote) {
  const existingNote =
    currentNotes.find((note) => note.id === optimisticNoteID) ??
    currentNotes.find((note) => areEquivalentBeaconNotes(note, serverNote));

  if (!existingNote) {
    return [serverNote, ...currentNotes];
  }

  const mergedNote = {
    ...serverNote,
    id: isRelayBackedEventID(existingNote.id) ? existingNote.id : serverNote.id,
    replies: Math.max(existingNote.replies, serverNote.replies),
    replyTargetId: existingNote.replyTargetId ?? serverNote.replyTargetId,
    rootNoteId: existingNote.rootNoteId ?? serverNote.rootNoteId,
    taggedPubkeys: dedupeTaggedPubkeys([...(existingNote.taggedPubkeys ?? []), ...(serverNote.taggedPubkeys ?? [])]),
    reactions: mergeNoteReactions(existingNote.reactions, serverNote.reactions)
  };

  return [mergedNote, ...currentNotes.filter((note) => note.id !== existingNote.id)];
}

function normalizePublishedGeoNote(
  event: NostrSignedEvent,
  defaultGeohash: string,
  replyTo?: GeoNote,
  taggedPubkeys?: string[]
): GeoNote {
  return {
    id: event.id,
    geohash: defaultGeohash,
    authorPubkey: normalizePublicKeyNpub(event.pubkey),
    content: event.content.trim(),
    createdAt: new Date(event.created_at * 1000).toISOString(),
    replies: 0,
    replyTargetId: replyTo?.id,
    rootNoteId: replyTo?.rootNoteId ?? replyTo?.id,
    taggedPubkeys,
    reactions: []
  };
}

function updateNoteReaction(currentNotes: GeoNote[], noteID: string, emoji: string, delta: number) {
  if (delta === 0) {
    return currentNotes;
  }

  return currentNotes.map((note) => {
    if (note.id !== noteID) {
      return note;
    }

    return {
      ...note,
      reactions: adjustReactionCounts(note.reactions, emoji, delta)
    };
  });
}

function adjustReactionCounts(reactions: GeoNote["reactions"], emoji: string, delta: number) {
  const counts = new Map((reactions ?? []).map((reaction) => [reaction.emoji, reaction.count]));
  const nextCount = Math.max(0, (counts.get(emoji) ?? 0) + delta);

  if (nextCount > 0) {
    counts.set(emoji, nextCount);
  } else {
    counts.delete(emoji);
  }

  return counts.size > 0
    ? Array.from(counts.entries())
        .map(([reactionEmoji, count]) => ({ emoji: reactionEmoji, count }))
        .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji))
    : undefined;
}

function mergeNoteReactions(...collections: Array<GeoNote["reactions"] | undefined>) {
  const counts = new Map<string, number>();

  for (const collection of collections) {
    for (const reaction of collection ?? []) {
      counts.set(reaction.emoji, Math.max(counts.get(reaction.emoji) ?? 0, reaction.count));
    }
  }

  return counts.size > 0
    ? Array.from(counts.entries())
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji))
    : undefined;
}

function dedupeTaggedPubkeys(pubkeys: string[]) {
  const unique = Array.from(new Set(pubkeys.map((pubkey) => pubkey.trim()).filter(Boolean)));
  return unique.length > 0 ? unique : undefined;
}

function isRelayBackedEventID(noteID: string) {
  return /^[0-9a-f]{64}$/i.test(noteID.trim());
}

function mergeRelayNotes(currentNotes: GeoNote[], relayNotes: GeoNote[]) {
  const merged = new Map(currentNotes.map((note) => [note.id, note]));

  for (const relayNote of relayNotes) {
    if (!merged.has(relayNote.id) && hasEquivalentLocalBeaconNote(currentNotes, relayNote)) {
      continue;
    }

    const existing = merged.get(relayNote.id);
    merged.set(relayNote.id, {
      ...relayNote,
      replies: Math.max(existing?.replies ?? 0, relayNote.replies),
      replyTargetId: relayNote.replyTargetId ?? existing?.replyTargetId,
      rootNoteId: relayNote.rootNoteId ?? existing?.rootNoteId,
      taggedPubkeys: dedupeTaggedPubkeys([...(existing?.taggedPubkeys ?? []), ...(relayNote.taggedPubkeys ?? [])]),
      reactions: mergeNoteReactions(existing?.reactions, relayNote.reactions)
    });
  }

  return Array.from(merged.values()).sort((left, right) =>
    compareDescendingTimestamps(left.createdAt, right.createdAt)
  );
}

const beaconRelayEchoWindowMs = 5_000;

function hasEquivalentLocalBeaconNote(currentNotes: GeoNote[], relayNote: GeoNote) {
  return currentNotes.some((note) => isLocalBeaconNote(note) && areEquivalentBeaconNotes(note, relayNote));
}

function isLocalBeaconNote(note: GeoNote) {
  return note.id.startsWith("note-");
}

function areEquivalentBeaconNotes(left: GeoNote, right: GeoNote) {
  if (
    left.geohash !== right.geohash ||
    left.authorPubkey !== right.authorPubkey ||
    left.content.trim() !== right.content.trim() ||
    (left.replyTargetId ?? "") !== (right.replyTargetId ?? "") ||
    (left.rootNoteId ?? "") !== (right.rootNoteId ?? "")
  ) {
    return false;
  }

  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return Math.abs(leftTime - rightTime) <= beaconRelayEchoWindowMs;
  }

  return left.createdAt === right.createdAt;
}

function mergeRelayBeaconPlaces(currentPlaces: Place[], relayBeacons: Place[]) {
  if (relayBeacons.length === 0) {
    return currentPlaces;
  }

  const pendingRelayBeacons = new Map(relayBeacons.map((place) => [place.geohash, place]));
  const mergedPlaces = currentPlaces.map((place) => {
    const relayBeacon = pendingRelayBeacons.get(place.geohash);
    if (!relayBeacon) {
      return place;
    }

    pendingRelayBeacons.delete(place.geohash);
    return mergePlace(place, relayBeacon);
  });

  return [...pendingRelayBeacons.values(), ...mergedPlaces];
}

function mergePlace(currentPlace: Place | undefined, nextPlace: Place) {
  if (!currentPlace) {
    return nextPlace;
  }

  return {
    geohash: nextPlace.geohash || currentPlace.geohash,
    title: nextPlace.title.trim() || currentPlace.title,
    neighborhood: nextPlace.neighborhood.trim() || currentPlace.neighborhood,
    description: nextPlace.description.trim() || currentPlace.description,
    activitySummary: nextPlace.activitySummary.trim() || currentPlace.activitySummary,
    createdAt: nextPlace.createdAt || currentPlace.createdAt,
    picture: nextPlace.picture?.trim() || currentPlace.picture,
    ownerPubkey: nextPlace.ownerPubkey?.trim() || currentPlace.ownerPubkey,
    memberPubkeys: mergePubkeys(currentPlace.memberPubkeys, nextPlace.memberPubkeys, currentPlace.ownerPubkey, nextPlace.ownerPubkey),
    tags: mergePlaceTags(currentPlace.tags, nextPlace.tags),
    capacity: nextPlace.capacity > 0 ? nextPlace.capacity : currentPlace.capacity,
    occupantPubkeys: nextPlace.occupantPubkeys.length > 0 ? nextPlace.occupantPubkeys : currentPlace.occupantPubkeys,
    unread: nextPlace.unread || currentPlace.unread,
    pinnedNoteId: nextPlace.pinnedNoteId || currentPlace.pinnedNoteId
  };
}

function mergePlaceTags(currentTags: string[], nextTags: string[]) {
  const merged = new Set<string>();

  for (const tag of [...currentTags, ...nextTags]) {
    const normalized = tag.trim();
    if (normalized) {
      merged.add(normalized);
    }
  }

  return Array.from(merged);
}

function mergePubkeys(...collections: Array<string[] | string | undefined>) {
  const merged = new Set<string>();

  for (const collection of collections) {
    if (!collection) {
      continue;
    }

    const pubkeys = Array.isArray(collection) ? collection : [collection];
    for (const pubkey of pubkeys) {
      const normalized = pubkey.trim();
      if (normalized) {
        merged.add(normalized);
      }
    }
  }

  return merged.size > 0 ? Array.from(merged) : undefined;
}

function upsertPlace(currentPlaces: Place[], nextPlace: Place) {
  const currentPlace = currentPlaces.find((place) => place.geohash === nextPlace.geohash);
  return [mergePlace(currentPlace, nextPlace), ...currentPlaces.filter((place) => place.geohash !== nextPlace.geohash)];
}

function createRelayListEntry(name: string, url: string): RelayListEntry {
  const normalizedURL = normalizeRelayListURL(url);
  const normalizedName = name.trim();

  return {
    url: normalizedURL,
    name: normalizedName || normalizedURL,
    inbox: true,
    outbox: true
  };
}

function normalizeRelayListURL(url: string) {
  const normalized = url.trim();
  if (!normalized) {
    throw new Error("Relay URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Relay URL must be a valid ws:// or wss:// URL.");
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("Relay URL must use ws:// or wss://.");
  }

  const serialized = parsed.toString();
  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    return serialized.slice(0, -1);
  }

  return serialized;
}

function mergeRelayListEntries(
  bootstrapEntries: RelayListEntry[],
  overrides: RelayListOverrides,
  fallbackRelayName: string,
  fallbackRelayURL: string
) {
  const merged = new Map<string, RelayListEntry>();
  const primaryRelayURL = normalizeRelayListURL(fallbackRelayURL);
  const removed = new Set(overrides.removed.filter((url) => url !== primaryRelayURL));
  const baseEntries =
    bootstrapEntries.length > 0
      ? bootstrapEntries
      : [createDefaultRelayListEntry(fallbackRelayName, fallbackRelayURL)];

  for (const entry of [...baseEntries, ...overrides.added]) {
    try {
      const normalizedURL = normalizeRelayListURL(entry.url);
      merged.set(normalizedURL, {
        url: normalizedURL,
        name: entry.name.trim() || normalizedURL,
        inbox: entry.inbox,
        outbox: entry.outbox
      });
    } catch {
      continue;
    }
  }

  const nextEntries = Array.from(merged.values()).filter((entry) => !removed.has(entry.url));
  if (nextEntries.length > 0) {
    return nextEntries;
  }

  return [createDefaultRelayListEntry(fallbackRelayName, fallbackRelayURL)];
}

function normalizeBeaconTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag !== "beacon" && tag !== "geohash8")
    )
  );
}

function resolveLiveKitStatusMessage(
  connectionState: CallSession["connectionState"],
  canPublish: boolean | undefined,
  fallbackMessage: string,
  previousCanPublish?: boolean
) {
  if (connectionState === "connected") {
    if (canPublish === false) {
      return "Connected in listen-only mode. The host can promote you live.";
    }
    if (previousCanPublish === false && canPublish) {
      return "Live publish controls enabled.";
    }
  }

  if (connectionState === "connecting" && canPublish === false) {
    return "Connecting to LiveKit room as a listener.";
  }

  return fallbackMessage;
}

function loadRelayListOverrides(): RelayListOverrides {
  const storage = resolveStorage();
  if (!storage) {
    return emptyRelayListOverrides;
  }

  const rawValue = storage.getItem(relayListStorageKey);
  if (!rawValue) {
    return emptyRelayListOverrides;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<RelayListOverrides>;
    const added = Array.isArray(parsed.added)
      ? parsed.added.flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            return [];
          }

          try {
            return [createRelayListEntry(String(entry.name ?? ""), String(entry.url ?? ""))];
          } catch {
            return [];
          }
        })
      : [];
    const removed = Array.isArray(parsed.removed)
      ? parsed.removed.flatMap((entry) => {
          if (typeof entry !== "string") {
            return [];
          }

          try {
            return [normalizeRelayListURL(entry)];
          } catch {
            return [];
          }
        })
      : [];

    return { added, removed };
  } catch {
    return emptyRelayListOverrides;
  }
}

function storeRelayListOverrides(overrides: RelayListOverrides) {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }

  storage.setItem(relayListStorageKey, JSON.stringify(overrides));
}

function resolveStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined" || typeof window.localStorage !== "object" || window.localStorage === null) {
    return null;
  }

  const { getItem, setItem } = window.localStorage;
  if (typeof getItem !== "function" || typeof setItem !== "function") {
    return null;
  }

  return window.localStorage;
}
