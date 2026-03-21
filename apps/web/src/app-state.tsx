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
import { getActiveLocalKey, loadStoredLocalKeyring } from "./key-manager";
import {
  buildPulseFeedItems,
  buildRelaySyntheses,
  buildNoteMap,
  buildParticipantMap,
  buildPlaceMap,
  buildPlaceTiles,
  buildStoryExport,
  buildThreads,
  compareDescendingTimestamps,
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
  type CallSession,
  type CrossRelayFeedItem,
  type FeedSegment,
  type GeoNote,
  type ParticipantProfile,
  type Place,
  type PulseFeedItem,
  type RelaySynthesis
} from "./data";
import { connectLiveKitSession, type LiveKitParticipantState, type LiveKitSession } from "./livekit-session";
import { hasNostrSigner, MediaAuthError, requestLiveKitToken, uploadBlossomFile } from "./media-client";
import {
  normalizeBootstrapPayload,
  normalizeCallIntentPayload,
  type BootstrapPayload,
  type CallIntentPayload
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

type AppStateValue = {
  currentUser: ParticipantProfile;
  currentSessionSource: "bootstrap" | "local";
  relayName: string;
  relayOperatorPubkey: string;
  relayURL: string;
  feedSegments: FeedSegment[];
  crossRelayItems: CrossRelayFeedItem[];
  pulseFeedItems: PulseFeedItem[];
  relaySyntheses: RelaySynthesis[];
  places: Place[];
  profiles: ParticipantProfile[];
  notes: GeoNote[];
  activeCall: CallSession | null;
  listPlaceMedia: (geohash: string) => PlaceMediaAsset[];
  getPlace: (geohash: string) => Place | undefined;
  getProfile: (pubkey: string) => ParticipantProfile | undefined;
  getNote: (noteID: string) => GeoNote | undefined;
  getPlaceParticipants: (geohash: string) => ParticipantProfile[];
  listPlaceTiles: () => ReturnType<typeof buildPlaceTiles>;
  listThreads: () => ReturnType<typeof buildThreads>;
  listNotesForPlace: (geohash: string) => GeoNote[];
  listRecentNotes: () => GeoNote[];
  listNotesByAuthor: (pubkey: string) => GeoNote[];
  buildStoryExport: () => string;
  sceneHealth: ReturnType<typeof getSceneHealthStats>;
  setLocalCurrentUserPubkey: (pubkey: string | null) => void;
  refreshSocialBootstrap: () => Promise<void>;
  createPlaceNote: (geohash: string, content: string) => GeoNote | null;
  uploadPlaceMedia: (geohash: string, file: File, signal?: AbortSignal) => Promise<PlaceMediaAsset | null>;
  joinPlaceCall: (geohash: string) => void;
  leavePlaceCall: () => void;
  toggleCallControl: (control: CallControl) => void;
  toggleCallMinimized: () => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [relayName, setRelayName] = useState(defaultRelayName);
  const [relayOperatorPubkey, setRelayOperatorPubkey] = useState(defaultRelayOperatorPubkey);
  const [relayURL, setRelayURL] = useState(defaultRelayURL);
  const [bootstrapCurrentUserPubkey, setBootstrapCurrentUserPubkey] = useState(defaultCurrentUserPubkey);
  const [currentUserPubkeyOverride, setCurrentUserPubkeyOverride] = useState<string | null>(
    () => getActiveLocalKey(loadStoredLocalKeyring())?.publicKeyNpub ?? null
  );
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [placesState, setPlacesState] = useState<Place[]>([]);
  const [profilesState, setProfilesState] = useState<ParticipantProfile[]>([]);
  const [notesState, setNotesState] = useState<GeoNote[]>([]);
  const [feedSegmentsState, setFeedSegmentsState] = useState<FeedSegment[]>([]);
  const [crossRelayItemsState, setCrossRelayItemsState] = useState<CrossRelayFeedItem[]>([]);
  const [placeMediaState, setPlaceMediaState] = useState<PlaceMediaAsset[]>([]);
  const activeCallRequestRef = useRef(0);
  const liveKitSessionRef = useRef<LiveKitSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    void apiFetch<BootstrapPayload>("/api/v1/social/bootstrap")
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const normalizedPayload = normalizeBootstrapPayload(payload);

        startTransition(() => {
          setRelayName(normalizedPayload.relay_name || defaultRelayName);
          setRelayOperatorPubkey(normalizedPayload.relay_operator_pubkey || defaultRelayOperatorPubkey);
          setRelayURL(normalizedPayload.relay_url || defaultRelayURL);
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

  const effectiveCurrentUserPubkey =
    currentUserPubkeyOverride?.trim() || bootstrapCurrentUserPubkey.trim() || defaultCurrentUserPubkey;
  const effectivePlaces = placesState;
  const effectiveProfiles = profilesState;
  const effectiveNotes = notesState;
  const effectiveFeedSegments = feedSegmentsState;
  const effectiveCrossRelayItems = crossRelayItemsState;

  const placeMap = useMemo(() => buildPlaceMap(effectivePlaces), [effectivePlaces]);
  const profileMap = useMemo(() => buildParticipantMap(effectiveProfiles), [effectiveProfiles]);
  const noteMap = useMemo(() => buildNoteMap(effectiveNotes), [effectiveNotes]);
  const relaySyntheses = useMemo(
    () => buildRelaySyntheses(effectivePlaces, effectiveNotes),
    [effectivePlaces, effectiveNotes]
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

  const value = useMemo<AppStateValue>(
    () => ({
      currentUser,
      currentSessionSource: currentUserPubkeyOverride ? "local" : "bootstrap",
      relayName,
      relayOperatorPubkey,
      relayURL,
      feedSegments: effectiveFeedSegments,
      crossRelayItems: effectiveCrossRelayItems,
      pulseFeedItems,
      relaySyntheses,
      places: effectivePlaces,
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
      getProfile: (pubkey) => profileMap.get(pubkey),
      getNote: (noteID) => noteMap.get(noteID),
      getPlaceParticipants: (geohash) => {
        const place = placeMap.get(geohash);
        const thread = buildThreads(
          effectivePlaces,
          effectiveNotes,
          activeCall,
          effectiveCurrentUserPubkey,
          relayOperatorPubkey
        ).find((entry) => entry.geohash === geohash);
        if (!place && !thread) {
          return [];
        }
        const participantStates =
          activeCall?.geohash === geohash
            ? new Map(activeCall.participantStates.map((participant) => [participant.pubkey, participant]))
            : new Map<string, { pubkey: string; mic: boolean; cam: boolean; screenshare: boolean }>();

        return (thread?.participants ?? []).map((pubkey) => {
          const profile = profileMap.get(pubkey) ?? createFallbackParticipantProfile(pubkey);
          const liveState = participantStates.get(pubkey);

          return {
            ...profile,
            mic: liveState?.mic ?? profile.mic,
            cam: liveState?.cam ?? profile.cam,
            screenshare: liveState?.screenshare ?? profile.screenshare
          };
        });
      },
      listPlaceTiles: () =>
        buildPlaceTiles(
          effectivePlaces,
          effectiveNotes,
          activeCall,
          effectiveCurrentUserPubkey,
          relayOperatorPubkey
        ),
      listThreads: () =>
        buildThreads(
          effectivePlaces,
          effectiveNotes,
          activeCall,
          effectiveCurrentUserPubkey,
          relayOperatorPubkey
        ),
      listNotesForPlace: (geohash) => listNotesForPlace(effectiveNotes, geohash),
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
      refreshSocialBootstrap: async () => {
        if (import.meta.env.MODE === "test") {
          return;
        }

        const payload = normalizeBootstrapPayload(await apiFetch<BootstrapPayload>("/api/v1/social/bootstrap"));
        startTransition(() => {
          setRelayName(payload.relay_name || defaultRelayName);
          setRelayOperatorPubkey(payload.relay_operator_pubkey || defaultRelayOperatorPubkey);
          setRelayURL(payload.relay_url || defaultRelayURL);
          setBootstrapCurrentUserPubkey(payload.current_user_pubkey || defaultCurrentUserPubkey);
          setFeedSegmentsState(payload.feed_segments);
          setCrossRelayItemsState(payload.cross_relay_items);
          setPlacesState(payload.places);
          setProfilesState(payload.profiles);
          setNotesState(payload.notes);
        });
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
              setNotesState((previous) => [
                serverNote,
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
      joinPlaceCall: (geohash) => {
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
        const fallbackRoomID = `geo:${relayOperatorPubkey}:${geohash}`;
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
            applyIfCurrent(roomID, placeTitle, participantPubkeys, {
              transport: "livekit",
              connectionState: "connecting",
              statusMessage: "Connecting to LiveKit room.",
              identity: tokenResponse.token.identity,
              liveKitURL: tokenResponse.token.livekit_url,
              expiresAt: tokenResponse.token.expires_at,
              canPublish: tokenResponse.token.grants.can_publish,
              canSubscribe: tokenResponse.token.grants.can_subscribe
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
              onConnectionStatus: (status, message) => {
                if (requestID !== activeCallRequestRef.current) {
                  return;
                }

                setActiveCall((current) =>
                  current && current.roomID === roomID
                    ? {
                        ...current,
                        transport: status === "connected" ? "livekit" : current.transport,
                        connectionState:
                          status === "connected"
                            ? "connected"
                            : status === "reconnecting"
                              ? "connecting"
                              : status === "disconnected"
                                ? "failed"
                                : "connecting",
                        statusMessage: message
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
      },
      leavePlaceCall: () => {
        activeCallRequestRef.current += 1;
        disconnectLiveKitSession();
        setActiveCall(null);
      },
      toggleCallControl: (control) => {
        const session = liveKitSessionRef.current;

        setActiveCall((current) => {
          if (!current) {
            return current;
          }

          const nextValue = !current[control];
          if (current.transport === "livekit" && session) {
            if (control === "deafen") {
              session.setDeafenEnabled(nextValue);
            } else {
              const setter =
                control === "mic"
                  ? session.setMicrophoneEnabled
                  : control === "cam"
                    ? session.setCameraEnabled
                    : session.setScreenShareEnabled;

              void setter(nextValue).catch((error: unknown) => {
                setActiveCall((latest) =>
                  latest
                    ? {
                        ...latest,
                        [control]: !nextValue
                      }
                    : latest
                );
                showToast(error instanceof Error ? error.message : "Media control failed.", "error");
              });
            }
          }

          const nextParticipantStates =
            control === "deafen"
              ? current.participantStates
              : (() => {
                  const existingIndex = current.participantStates.findIndex(
                    (participant) => participant.pubkey === effectiveCurrentUserPubkey
                  );

                  if (existingIndex === -1) {
                    return [
                      ...current.participantStates,
                      {
                        pubkey: effectiveCurrentUserPubkey,
                        mic: control === "mic" ? nextValue : current.mic,
                        cam: control === "cam" ? nextValue : current.cam,
                        screenshare: control === "screenshare" ? nextValue : current.screenshare
                      }
                    ];
                  }

                  return current.participantStates.map((participant) =>
                    participant.pubkey === effectiveCurrentUserPubkey
                      ? {
                          ...participant,
                          mic: control === "mic" ? nextValue : participant.mic,
                          cam: control === "cam" ? nextValue : participant.cam,
                          screenshare: control === "screenshare" ? nextValue : participant.screenshare
                        }
                      : participant
                  );
                })();

          return {
            ...current,
            [control]: nextValue,
            participantStates: nextParticipantStates
          };
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
    }),
    [
      activeCall,
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
      relayName,
      relayOperatorPubkey,
      relayURL,
      relaySyntheses,
      sceneHealth
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return value;
}
