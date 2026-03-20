import type { ConnectionState, Participant, RemoteParticipant, Room, RoomEvent, Track } from "livekit-client";

export type LiveKitParticipantState = {
  identity: string;
  mic: boolean;
  cam: boolean;
  screenshare: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
};

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

type ConnectLiveKitOptions = {
  url: string;
  token: string;
  onParticipantsChanged: (participants: LiveKitParticipantState[]) => void;
  onConnectionStatus: (status: ConnectionStatus, message: string) => void;
};

export type LiveKitSession = {
  disconnect: () => void;
  setMicrophoneEnabled: (enabled: boolean) => Promise<boolean>;
  setCameraEnabled: (enabled: boolean) => Promise<boolean>;
  setScreenShareEnabled: (enabled: boolean) => Promise<boolean>;
  setDeafenEnabled: (enabled: boolean) => void;
};

export async function connectLiveKitSession(options: ConnectLiveKitOptions): Promise<LiveKitSession> {
  const { Room, RoomEvent, Track, ConnectionState } = await import("livekit-client");
  const room = new Room({
    adaptiveStream: true,
    dynacast: true
  });
  const audioContainer = document.createElement("div");
  audioContainer.hidden = true;
  document.body.appendChild(audioContainer);

  const audioElements = new Map<string, HTMLMediaElement[]>();
  let deafenEnabled = false;
  let disconnected = false;

  const cleanupParticipantAudio = (participantIdentity: string) => {
    const elements = audioElements.get(participantIdentity) ?? [];
    elements.forEach((element) => {
      element.remove();
    });
    audioElements.delete(participantIdentity);
  };

  const attachAudioTrack = (track: Track, participant: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Audio) {
      return;
    }

    const mediaElement = track.attach();
    mediaElement.autoplay = true;
    mediaElement.muted = deafenEnabled;
    audioContainer.appendChild(mediaElement);

    const existing = audioElements.get(participant.identity) ?? [];
    audioElements.set(participant.identity, [...existing, mediaElement]);
  };

  const emitParticipants = () => {
    const participants = [
      buildParticipantState(room.localParticipant, true),
      ...Array.from(room.remoteParticipants.values()).map((participant) =>
        buildParticipantState(participant, false)
      )
    ];
    options.onParticipantsChanged(participants);
  };

  const handleConnectionState = (state: ConnectionState) => {
    const nextStatus =
      state === ConnectionState.Connected
        ? "connected"
        : state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting
          ? "reconnecting"
          : state === ConnectionState.Disconnected
            ? "disconnected"
            : "connecting";

    const message =
      nextStatus === "connected"
        ? "LiveKit room connected."
        : nextStatus === "reconnecting"
          ? "Reconnecting to LiveKit room."
          : nextStatus === "disconnected"
            ? "LiveKit room disconnected."
            : "Connecting to LiveKit room.";

    options.onConnectionStatus(nextStatus, message);
  };

  room
    .on(RoomEvent.ConnectionStateChanged, handleConnectionState)
    .on(RoomEvent.ParticipantConnected, emitParticipants)
    .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      cleanupParticipantAudio(participant.identity);
      emitParticipants();
    })
    .on(RoomEvent.TrackSubscribed, (track: Track, _publication, participant: RemoteParticipant) => {
      attachAudioTrack(track, participant);
      emitParticipants();
    })
    .on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant: RemoteParticipant) => {
      cleanupParticipantAudio(participant.identity);
      emitParticipants();
    })
    .on(RoomEvent.TrackMuted, emitParticipants)
    .on(RoomEvent.TrackUnmuted, emitParticipants)
    .on(RoomEvent.ActiveSpeakersChanged, emitParticipants);

  handleConnectionState(ConnectionState.Connecting);
  await room.connect(options.url, options.token);
  emitParticipants();

  return {
    disconnect: () => {
      if (disconnected) {
        return;
      }

      disconnected = true;
      Array.from(audioElements.keys()).forEach(cleanupParticipantAudio);
      audioContainer.remove();
      room.removeAllListeners();
      void room.disconnect();
    },
    setMicrophoneEnabled: async (enabled) => {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      emitParticipants();
      return room.localParticipant.isMicrophoneEnabled;
    },
    setCameraEnabled: async (enabled) => {
      await room.localParticipant.setCameraEnabled(enabled);
      emitParticipants();
      return room.localParticipant.isCameraEnabled;
    },
    setScreenShareEnabled: async (enabled) => {
      await room.localParticipant.setScreenShareEnabled(enabled);
      emitParticipants();
      return room.localParticipant.isScreenShareEnabled;
    },
    setDeafenEnabled: (enabled) => {
      deafenEnabled = enabled;
      audioElements.forEach((elements) => {
        elements.forEach((element) => {
          element.muted = enabled;
        });
      });
    }
  };
}

function buildParticipantState(participant: Participant, isLocal: boolean): LiveKitParticipantState {
  return {
    identity: participant.identity,
    mic: participant.isMicrophoneEnabled,
    cam: participant.isCameraEnabled,
    screenshare: participant.isScreenShareEnabled,
    isSpeaking: participant.isSpeaking,
    isLocal
  };
}
