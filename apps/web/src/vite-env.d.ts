/// <reference types="vite/client" />

type NostrEventTemplate = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

type NostrSignedEvent = NostrEventTemplate & {
  id: string;
  pubkey: string;
  sig: string;
};

type NostrExtension = {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEventTemplate): Promise<NostrSignedEvent>;
};

interface Window {
  nostr?: NostrExtension;
}
