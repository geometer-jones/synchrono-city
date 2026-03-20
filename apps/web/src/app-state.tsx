import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
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

type AppStateValue = {
  currentUser: ParticipantProfile;
  relayOperatorPubkey: string;
  feedSegments: typeof feedSegments;
  places: Place[];
  profiles: ParticipantProfile[];
  notes: GeoNote[];
  activeCall: CallSession | null;
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

  const value = useMemo<AppStateValue>(
    () => ({
      currentUser,
      relayOperatorPubkey,
      feedSegments,
      places: effectivePlaces,
      profiles: effectiveProfiles,
      notes: effectiveNotes,
      activeCall,
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
      joinPlaceCall: (geohash) => {
        const place = placeMap.get(geohash);
        if (!place) {
          return;
        }

        const applyIntent = (roomID: string, placeTitle: string, participantPubkeys: string[]) => {
          setActiveCall((current) => ({
            geohash,
            roomID,
            placeTitle,
            participantPubkeys,
            mic: current?.geohash === geohash ? current.mic : currentUser.mic,
            cam: current?.geohash === geohash ? current.cam : currentUser.cam,
            screenshare: current?.geohash === geohash ? current.screenshare : currentUser.screenshare,
            deafen: current?.geohash === geohash ? current.deafen : currentUser.deafen,
            minimized: false
          }));
        };

        const fallbackParticipants = place.occupantPubkeys.includes(currentUserPubkey)
          ? place.occupantPubkeys
          : [currentUserPubkey, ...place.occupantPubkeys];
        applyIntent(
          `geo:${relayOperatorPubkey}:${geohash}`,
          place.title,
          fallbackParticipants
        );

        if (import.meta.env.MODE !== "test") {
          void apiFetch<CallIntentPayload>("/api/v1/social/call-intent", {
            method: "POST",
            body: JSON.stringify({
              geohash,
              pubkey: currentUserPubkey
            })
          }).then((payload) => {
            applyIntent(payload.room_id, payload.place_title, payload.participant_pubkeys);
          }).catch(() => {
            showToast("Using fallback room. Server unavailable.", "info");
          });
        }
      },
      leavePlaceCall: () => {
        setActiveCall(null);
      },
      toggleCallControl: (control) => {
        setActiveCall((current) =>
          current
            ? {
                ...current,
                [control]: !current[control]
              }
            : current
        );
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
