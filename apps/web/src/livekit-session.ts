import type { ConnectionState, Participant, RemoteParticipant, Room, RoomEvent, Track } from "livekit-client";

export type LiveKitParticipantState = {
  identity: string;
  mic: boolean;
  cam: boolean;
  screenshare: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
};

export type LiveKitMediaStreamState = {
  id: string;
  participantIdentity: string;
  source: "camera" | "screen_share";
  isLocal: boolean;
  track: {
    attach: (element: HTMLMediaElement) => HTMLMediaElement;
    detach: (element: HTMLMediaElement) => HTMLMediaElement;
  };
};

export type LiveKitPermissionState = {
  canPublish: boolean;
  canSubscribe: boolean;
};

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

type ConnectLiveKitOptions = {
  url: string;
  token: string;
  onParticipantsChanged: (participants: LiveKitParticipantState[]) => void;
  onMediaStreamsChanged: (streams: LiveKitMediaStreamState[]) => void;
  onConnectionStatus: (status: ConnectionStatus, message: string) => void;
  onPermissionsChanged?: (permissions: LiveKitPermissionState) => void;
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

  const emitMediaStreams = () => {
    options.onMediaStreamsChanged(collectMediaStreams(room, Track));
  };

  const emitPermissions = () => {
    options.onPermissionsChanged?.({
      canPublish: room.localParticipant.permissions?.canPublish ?? true,
      canSubscribe: room.localParticipant.permissions?.canSubscribe ?? true
    });
  };

  const emitRoomState = () => {
    emitParticipants();
    emitMediaStreams();
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
    .on(RoomEvent.ParticipantConnected, emitRoomState)
    .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      cleanupParticipantAudio(participant.identity);
      emitRoomState();
    })
    .on(RoomEvent.TrackSubscribed, (track: Track, _publication, participant: RemoteParticipant) => {
      attachAudioTrack(track, participant);
      emitRoomState();
    })
    .on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant: RemoteParticipant) => {
      cleanupParticipantAudio(participant.identity);
      emitRoomState();
    })
    .on(RoomEvent.TrackMuted, emitRoomState)
    .on(RoomEvent.TrackUnmuted, emitRoomState)
    .on(RoomEvent.TrackPublished, emitMediaStreams)
    .on(RoomEvent.TrackUnpublished, emitMediaStreams)
    .on(RoomEvent.LocalTrackPublished, emitMediaStreams)
    .on(RoomEvent.LocalTrackUnpublished, emitMediaStreams)
    .on(RoomEvent.ActiveSpeakersChanged, emitParticipants)
    .on(RoomEvent.ParticipantPermissionsChanged, (_previousPermissions, participant: Participant) => {
      if (participant.isLocal) {
        emitPermissions();
      }
    });

  handleConnectionState(ConnectionState.Connecting);
  await room.connect(options.url, options.token);
  emitPermissions();
  emitRoomState();

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
      emitRoomState();
      return room.localParticipant.isMicrophoneEnabled;
    },
    setCameraEnabled: async (enabled) => {
      await room.localParticipant.setCameraEnabled(enabled);
      emitRoomState();
      return room.localParticipant.isCameraEnabled;
    },
    setScreenShareEnabled: async (enabled) => {
      await room.localParticipant.setScreenShareEnabled(enabled);
      emitRoomState();
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

function collectMediaStreams(
  room: Room,
  trackNamespace: {
    Source: {
      ScreenShare: Track.Source;
      Camera: Track.Source;
    };
  }
): LiveKitMediaStreamState[] {
  const participants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];

  return participants
    .flatMap((participant) => {
      const screenSharePublication = participant.getTrackPublication(trackNamespace.Source.ScreenShare);
      const cameraPublication = participant.getTrackPublication(trackNamespace.Source.Camera);

      return [screenSharePublication, cameraPublication]
        .flatMap((publication) => {
          const videoTrack = publication?.videoTrack;

          if (!publication || !videoTrack || publication.isMuted) {
            return [];
          }

          const source: LiveKitMediaStreamState["source"] =
            publication.source === trackNamespace.Source.ScreenShare ? "screen_share" : "camera";

          return [
            {
              id: `${participant.identity}:${source}`,
              participantIdentity: participant.identity,
              source,
              isLocal: participant.isLocal,
              track: videoTrack
            }
          ];
        })
        .sort((left, right) => sortStreams(left, right));
    })
    .sort((left, right) => sortStreams(left, right));
}

function sortStreams(left: LiveKitMediaStreamState, right: LiveKitMediaStreamState) {
  if (left.source !== right.source) {
    return left.source === "screen_share" ? -1 : 1;
  }

  if (left.isLocal !== right.isLocal) {
    return left.isLocal ? -1 : 1;
  }

  return left.participantIdentity.localeCompare(right.participantIdentity);
}
