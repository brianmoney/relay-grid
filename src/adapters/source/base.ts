import type { NormalizedFetchedAudio, NormalizedSourceEvent, SourceName } from "../../types/events";

export interface SourceAdapter {
  readonly source: SourceName;

  // Provider-native payloads stop at this boundary. Core code only consumes normalized contracts.
  normalizeEvent(rawEvent: unknown): Promise<NormalizedSourceEvent | null>;
  fetchAudio(event: NormalizedSourceEvent): Promise<NormalizedFetchedAudio>;
}
