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
import { publishGeoNote, queryGeoNotes, queryProfileMetadata } from "./nostr";
import {
  isValidGeoNote,
  normalizeGeoNotePayload,
  normalizeBootstrapPayload,
  normalizeCallIntentPayload,
  normalizeCreateBeaconResponsePayload,
  type BootstrapPayload,
  type CallIntentPayload,
  type CreateBeaconResponsePayload
} from "./social-payload";
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
  createPlaceNote: (geohash: string, content: string) => GeoNote | null;
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
  const effectivePlaces = placesState;
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
      const signerAvailable = hasNostrSigner();

      applyIntent(fallbackRoomID, place.title, fallbackParticipants, {
        transport: "local",
        connectionState: signerAvailable ? "connecting" : "local_preview",
        statusMessage: signerAvailable
          ? "Resolving LiveKit access for this room."
          : "Signer required for LiveKit media. Room intent stays local."
      });

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
        const placeTitle = normalizedPayload.place_title || place.title;
        const participantPubkeys =
          normalizedPayload.participant_pubkeys.length > 0
            ? normalizedPayload.participant_pubkeys
            : fallbackParticipants;

        applyIfCurrent(roomID, placeTitle, participantPubkeys, {
          transport: "local",
          connectionState: signerAvailable ? "connecting" : "local_preview",
          statusMessage: signerAvailable
            ? "Resolving LiveKit access for this room."
            : "Signer required for LiveKit media. Room intent stays local."
        });

        if (!signerAvailable) {
          return;
        }

        try {
          const tokenResponse = await requestLiveKitToken(roomID);
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

          applyIfCurrent(roomID, placeTitle, participantPubkeys, {
            transport: "local",
            connectionState: "failed",
            statusMessage: message
          });
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

        if (import.meta.env.MODE === "test") {
          const existingPlace = placeMap.get(normalizedGeohash);
          if (existingPlace) {
            return {
              beacon: existingPlace,
              created: false
            };
          }

          if (!normalizedName) {
            throw new Error("Beacon name is required.");
          }

          const nextBeacon: Place = {
            geohash: normalizedGeohash,
            title: normalizedName,
            neighborhood: "Newly lit beacon",
            description: normalizedAbout,
            activitySummary: "Freshly lit beacon.",
            picture: normalizedPicture || undefined,
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

        const payload = normalizeCreateBeaconResponsePayload(
          await apiFetch<CreateBeaconResponsePayload>("/api/v1/social/beacons", {
            method: "POST",
            body: JSON.stringify({
              geohash: normalizedGeohash,
              name: normalizedName,
              pic: normalizedPicture,
              about: normalizedAbout,
              tags: normalizedTags
            })
          })
        );

        if (!payload.beacon) {
          throw new Error("Beacon response was incomplete.");
        }

        const beacon = payload.beacon;
        setPlacesState((previous) => upsertPlace(previous, beacon));
        return {
          beacon,
          created: payload.created
        };
      },
      createPlaceNote: (geohash, content) => {
        const trimmed = content.trim();
        if (!trimmed) {
          return null;
        }

        const nextNote = {
          id: `note-${Date.now()}`,
          geohash,
          authorPubkey: effectiveCurrentUserPubkey,
          content: trimmed,
          createdAt: new Date().toISOString(),
          replies: 0
        };

        setNotesState((previous) => [nextNote, ...previous]);
        const activeLocalKey = getActiveLocalKey(loadStoredLocalKeyring());

        if (activeLocalKey || hasNostrSigner()) {
          void publishGeoNote(
            relayURL,
            geohash,
            trimmed,
            activeLocalKey
              ? {
                  privateKeyHex: activeLocalKey.privateKeyHex,
                  publicKeyHex: activeLocalKey.publicKeyHex
                }
              : undefined
          ).catch((error) => {
            showToast(
              error instanceof Error
                ? `Note saved in Concierge, but relay publish failed: ${error.message}`
                : "Note saved in Concierge, but relay publish failed.",
              "info"
            );
          });
        } else if (import.meta.env.MODE !== "test") {
          showToast("Note saved in Concierge, but no Nostr signer is available for relay publish.", "info");
        }

        if (import.meta.env.MODE !== "test") {
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

              setNotesState((previous) => [
                normalizedServerNote,
                ...previous.filter((note) => note.id !== nextNote.id)
              ]);
            })
            .catch(() => {
              showToast("Note saved locally. Will sync when connected.", "info");
            });
        }
        return nextNote;
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

function mergeRelayNotes(currentNotes: GeoNote[], relayNotes: GeoNote[]) {
  const merged = new Map(currentNotes.map((note) => [note.id, note]));

  for (const relayNote of relayNotes) {
    if (!merged.has(relayNote.id) && hasEquivalentLocalBeaconNote(currentNotes, relayNote)) {
      continue;
    }

    const existing = merged.get(relayNote.id);
    merged.set(relayNote.id, {
      ...relayNote,
      replies: existing?.replies ?? relayNote.replies
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
    left.content.trim() !== right.content.trim()
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

function upsertPlace(currentPlaces: Place[], nextPlace: Place) {
  return [nextPlace, ...currentPlaces.filter((place) => place.geohash !== nextPlace.geohash)];
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
