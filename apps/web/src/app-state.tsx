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

import { apiFetch } from "./api";
import {
  buildNoteMap,
  buildParticipantMap,
  buildPlaceMap,
  buildPlaceTiles,
  buildStoryExport,
  buildThreads,
  currentUserPubkey,
  feedSegments,
  getSceneHealthStats,
  listNotesByAuthor,
  listNotesForPlace,
  listRecentNotes,
  relayOperatorPubkey as defaultRelayOperatorPubkey,
  seedNotes,
  seedPlaces,
  seedProfiles,
  type CallSession,
  type GeoNote,
  type ParticipantProfile,
  type Place
} from "./data";
import { connectLiveKitSession, type LiveKitParticipantState, type LiveKitSession } from "./livekit-session";
import { hasNostrSigner, MediaAuthError, requestLiveKitToken, uploadBlossomFile } from "./media-client";
import { showToast } from "./toast";

type CallControl = "mic" | "cam" | "screenshare" | "deafen";

type BootstrapPayload = {
  relay_operator_pubkey: string;
  places: Place[];
  profiles: ParticipantProfile[];
  notes: GeoNote[];
};

type CallIntentPayload = {
  geohash: string;
  room_id: string;
  place_title: string;
  participant_pubkeys: string[];
};

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
  relayOperatorPubkey: string;
  feedSegments: typeof feedSegments;
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
  createPlaceNote: (geohash: string, content: string) => GeoNote | null;
  uploadPlaceMedia: (geohash: string, file: File, signal?: AbortSignal) => Promise<PlaceMediaAsset | null>;
  joinPlaceCall: (geohash: string) => void;
  leavePlaceCall: () => void;
  toggleCallControl: (control: CallControl) => void;
  toggleCallMinimized: () => void;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [relayOperatorPubkey, setRelayOperatorPubkey] = useState(defaultRelayOperatorPubkey);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [placesState, setPlacesState] = useState(seedPlaces);
  const [profilesState, setProfilesState] = useState(seedProfiles);
  const [notesState, setNotesState] = useState(seedNotes);
  const [placeMediaState, setPlaceMediaState] = useState<PlaceMediaAsset[]>([]);
  const activeCallRequestRef = useRef(0);
  const liveKitSessionRef = useRef<LiveKitSession | null>(null);

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      return;
    }

    let cancelled = false;

    void apiFetch<BootstrapPayload>("/api/v1/social/bootstrap")
      .then((payload) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setRelayOperatorPubkey(payload.relay_operator_pubkey || defaultRelayOperatorPubkey);
          setPlacesState(payload.places);
          setProfilesState(payload.profiles);
          setNotesState(payload.notes);
        });
      })
      .catch(() => {
        showToast("Unable to connect to server. Using cached data.", "error");
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

  const effectivePlaces = placesState.length > 0 ? placesState : seedPlaces;
  const effectiveProfiles = profilesState.length > 0 ? profilesState : seedProfiles;
  const effectiveNotes = notesState.length > 0 ? notesState : seedNotes;

  const placeMap = useMemo(() => buildPlaceMap(effectivePlaces), [effectivePlaces]);
  const profileMap = useMemo(() => buildParticipantMap(effectiveProfiles), [effectiveProfiles]);
  const noteMap = useMemo(() => buildNoteMap(effectiveNotes), [effectiveNotes]);

  const currentUser = profileMap.get(currentUserPubkey) ?? effectiveProfiles[0];
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
        mic: localParticipant?.mic ?? current.mic,
        cam: localParticipant?.cam ?? current.cam,
        screenshare: localParticipant?.screenshare ?? current.screenshare
      };
    });
  }

  const value = useMemo<AppStateValue>(
    () => ({
      currentUser,
      relayOperatorPubkey,
      feedSegments,
      places: effectivePlaces,
      profiles: effectiveProfiles,
      notes: effectiveNotes,
      activeCall,
      listPlaceMedia: (geohash) =>
        placeMediaState
          .filter((asset) => asset.geohash === geohash)
          .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)),
      getPlace: (geohash) => placeMap.get(geohash),
      getProfile: (pubkey) => profileMap.get(pubkey),
      getNote: (noteID) => noteMap.get(noteID),
      getPlaceParticipants: (geohash) => {
        const place = placeMap.get(geohash);
        if (!place) {
          return [];
        }

        const thread = buildThreads(
          effectivePlaces,
          effectiveNotes,
          activeCall,
          currentUserPubkey,
          relayOperatorPubkey
        ).find(
          (entry) => entry.geohash === geohash
        );
        return (thread?.participants ?? [])
          .map((pubkey) => profileMap.get(pubkey))
          .filter((profile): profile is ParticipantProfile => Boolean(profile));
      },
      listPlaceTiles: () =>
        buildPlaceTiles(effectivePlaces, effectiveNotes, activeCall, currentUserPubkey, relayOperatorPubkey),
      listThreads: () =>
        buildThreads(effectivePlaces, effectiveNotes, activeCall, currentUserPubkey, relayOperatorPubkey),
      listNotesForPlace: (geohash) => listNotesForPlace(effectiveNotes, geohash),
      listRecentNotes: () => listRecentNotes(effectiveNotes),
      listNotesByAuthor: (pubkey) => listNotesByAuthor(effectiveNotes, pubkey),
      buildStoryExport: () =>
        buildStoryExport(
          effectivePlaces,
          effectiveNotes,
          effectiveProfiles,
          activeCall,
          currentUserPubkey,
          relayOperatorPubkey
        ),
      sceneHealth,
      createPlaceNote: (geohash, content) => {
        const trimmed = content.trim();
        if (!trimmed) {
          return null;
        }

        const nextNote = {
          id: `note-${Date.now()}`,
          geohash,
          authorPubkey: currentUserPubkey,
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
              author_pubkey: currentUserPubkey,
              content: trimmed
            })
          }).then((serverNote) => {
            setNotesState((previous) => [
              serverNote,
              ...previous.filter((note) => note.id !== nextNote.id)
            ]);
          }).catch(() => {
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
          uploadedByPubkey: currentUserPubkey
        };

        setPlaceMediaState((previous) => [nextAsset, ...previous]);
        showToast(`Uploaded ${file.name} to Blossom for ${place.title}.`, "info");
        return nextAsset;
      },
      joinPlaceCall: (geohash) => {
        const place = placeMap.get(geohash);
        if (!place) {
          return;
        }

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

        const fallbackParticipants = place.occupantPubkeys.includes(currentUserPubkey)
          ? place.occupantPubkeys
          : [currentUserPubkey, ...place.occupantPubkeys];
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
                  pubkey: currentUserPubkey
                })
              }).catch(() => {
                showToast("Using fallback room. Server unavailable.", "info");
                return {
                  geohash,
                  room_id: fallbackRoomID,
                  place_title: place.title,
                  participant_pubkeys: fallbackParticipants
                };
              });

        void intentPromise.then(async (payload) => {
          applyIfCurrent(payload.room_id, payload.place_title, payload.participant_pubkeys, {
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
            const tokenResponse = await requestLiveKitToken(payload.room_id);
            applyIfCurrent(payload.room_id, payload.place_title, payload.participant_pubkeys, {
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
                syncLiveKitParticipants(payload.room_id, geohash, participants);
              },
              onConnectionStatus: (status, message) => {
                if (requestID !== activeCallRequestRef.current) {
                  return;
                }

                setActiveCall((current) =>
                  current && current.roomID === payload.room_id
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

            applyIfCurrent(payload.room_id, payload.place_title, payload.participant_pubkeys, {
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

          return {
            ...current,
            [control]: nextValue
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
      effectiveNotes,
      effectivePlaces,
      effectiveProfiles,
      noteMap,
      placeMediaState,
      placeMap,
      profileMap,
      relayOperatorPubkey,
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
