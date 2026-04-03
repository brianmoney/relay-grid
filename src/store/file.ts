import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ActiveProcessingState,
  FailedProcessingState,
  ProcessingFailure,
  ProcessingState,
  ProcessingStateReference,
  ProcessingStatus,
} from "../types/processing";
import type {
  BeginProcessingAttemptInput,
  ProcessingStateStore,
  ProcessingStateUpdateOptions,
} from "./base";

interface PersistedStateFile {
  version: 1;
  records: Record<string, ProcessingState>;
}

const EMPTY_STATE_FILE: PersistedStateFile = {
  version: 1,
  records: {},
};

const cloneState = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T;
};

const buildRecordKey = ({ dedupeKey }: ProcessingStateReference): string => {
  return dedupeKey;
};

const mergeMetadata = (
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!current && !next) {
    return undefined;
  }

  return {
    ...(current ?? {}),
    ...(next ?? {}),
  };
};

const createInitialState = ({
  source,
  conversationKey,
  dedupeKey,
  occurredAt,
  maxAttempts,
  metadata,
}: BeginProcessingAttemptInput): ActiveProcessingState => {
  const now = new Date().toISOString();

  const initialState: ActiveProcessingState = {
    source,
    conversationKey,
    dedupeKey,
    status: "received",
    attempt: 1,
    maxAttempts,
    createdAt: now,
    updatedAt: now,
    ...(occurredAt ? { occurredAt } : {}),
    lastAttemptStartedAt: now,
    stageTimestamps: {
      received: now,
    },
  };

  if (occurredAt !== undefined) {
    initialState.occurredAt = occurredAt;
  }

  if (metadata !== undefined) {
    initialState.metadata = metadata;
  }

  return initialState;
};

export class FileProcessingStateStore implements ProcessingStateStore {
  private pendingMutation: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async get(reference: ProcessingStateReference): Promise<ProcessingState | null> {
    const stateFile = await this.readStateFile();
    const record = stateFile.records[buildRecordKey(reference)];
    return record ? cloneState(record) : null;
  }

  async list(): Promise<ProcessingState[]> {
    const stateFile = await this.readStateFile();
    return Object.values(stateFile.records).map((record) => cloneState(record));
  }

  async beginAttempt(input: BeginProcessingAttemptInput): Promise<ProcessingState> {
    return this.mutate((stateFile) => {
      const key = buildRecordKey(input);
      const currentRecord = stateFile.records[key];

      if (!currentRecord) {
        const initialState = createInitialState(input);
        stateFile.records[key] = initialState;
        return initialState;
      }

      const now = new Date().toISOString();
      const occurredAt = input.occurredAt ?? currentRecord.occurredAt;
      const metadata = mergeMetadata(currentRecord.metadata, input.metadata);
      const nextState: ActiveProcessingState = {
        source: input.source,
        conversationKey: input.conversationKey,
        dedupeKey: input.dedupeKey,
        status: "received",
        attempt: currentRecord.attempt + 1,
        maxAttempts: input.maxAttempts,
        createdAt: currentRecord.createdAt,
        updatedAt: now,
        lastAttemptStartedAt: now,
        stageTimestamps: {
          ...currentRecord.stageTimestamps,
          received: now,
        },
      };

      if (occurredAt !== undefined) {
        nextState.occurredAt = occurredAt;
      }

      if (metadata !== undefined) {
        nextState.metadata = metadata;
      }

      stateFile.records[key] = nextState;
      return nextState;
    });
  }

  async markStage(
    reference: ProcessingStateReference,
    status: Exclude<ProcessingStatus, "failed">,
    options?: ProcessingStateUpdateOptions
  ): Promise<ProcessingState> {
    return this.mutate((stateFile) => {
      const currentRecord = this.requireRecord(stateFile, reference);
      const now = new Date().toISOString();
      const metadata = mergeMetadata(currentRecord.metadata, options?.metadata);
      const nextState: ActiveProcessingState = {
        source: currentRecord.source,
        conversationKey: currentRecord.conversationKey,
        dedupeKey: currentRecord.dedupeKey,
        status,
        attempt: currentRecord.attempt,
        maxAttempts: currentRecord.maxAttempts,
        createdAt: currentRecord.createdAt,
        updatedAt: now,
        stageTimestamps: {
          ...currentRecord.stageTimestamps,
          [status]: now,
        },
      };

      if (currentRecord.occurredAt !== undefined) {
        nextState.occurredAt = currentRecord.occurredAt;
      }

      if (currentRecord.lastAttemptStartedAt !== undefined) {
        nextState.lastAttemptStartedAt = currentRecord.lastAttemptStartedAt;
      }

      if (status === "completed") {
        nextState.completedAt = now;
      } else if (currentRecord.status !== "failed" && currentRecord.completedAt !== undefined) {
        nextState.completedAt = currentRecord.completedAt;
      }

      if (metadata !== undefined) {
        nextState.metadata = metadata;
      }

      stateFile.records[buildRecordKey(reference)] = nextState;
      return nextState;
    });
  }

  async markFailed(
    reference: ProcessingStateReference,
    failure: ProcessingFailure,
    options?: ProcessingStateUpdateOptions
  ): Promise<ProcessingState> {
    return this.mutate((stateFile) => {
      const currentRecord = this.requireRecord(stateFile, reference);
      const now = new Date().toISOString();
      const metadata = mergeMetadata(currentRecord.metadata, options?.metadata);
      const nextState: FailedProcessingState = {
        source: currentRecord.source,
        conversationKey: currentRecord.conversationKey,
        dedupeKey: currentRecord.dedupeKey,
        status: "failed",
        attempt: currentRecord.attempt,
        maxAttempts: currentRecord.maxAttempts,
        createdAt: currentRecord.createdAt,
        updatedAt: now,
        failedAt: now,
        stageTimestamps: {
          ...currentRecord.stageTimestamps,
          failed: now,
        },
        error: failure,
      };

      if (currentRecord.occurredAt !== undefined) {
        nextState.occurredAt = currentRecord.occurredAt;
      }

      if (currentRecord.lastAttemptStartedAt !== undefined) {
        nextState.lastAttemptStartedAt = currentRecord.lastAttemptStartedAt;
      }

      if (metadata !== undefined) {
        nextState.metadata = metadata;
      }

      stateFile.records[buildRecordKey(reference)] = nextState;
      return nextState;
    });
  }

  private async mutate<T>(mutator: (stateFile: PersistedStateFile) => T | Promise<T>): Promise<T> {
    const operation = this.pendingMutation.then(async () => {
      const stateFile = await this.readStateFile();
      const result = await mutator(stateFile);
      await this.writeStateFile(stateFile);
      return result;
    });

    this.pendingMutation = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  private async readStateFile(): Promise<PersistedStateFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedStateFile>;

      if (parsed.version !== 1 || !parsed.records || typeof parsed.records !== "object") {
        return cloneState(EMPTY_STATE_FILE);
      }

      return {
        version: 1,
        records: parsed.records as Record<string, ProcessingState>,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return cloneState(EMPTY_STATE_FILE);
      }

      throw error;
    }
  }

  private async writeStateFile(stateFile: PersistedStateFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempFilePath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempFilePath, `${JSON.stringify(stateFile, null, 2)}\n`, "utf8");
    await rename(tempFilePath, this.filePath);
  }

  private requireRecord(
    stateFile: PersistedStateFile,
    reference: ProcessingStateReference
  ): ProcessingState {
    const record = stateFile.records[buildRecordKey(reference)];

    if (!record) {
      throw new Error(`Processing state not found for ${reference.dedupeKey}`);
    }

    return record;
  }
}

export const createFileProcessingStateStore = (filePath: string): ProcessingStateStore => {
  return new FileProcessingStateStore(filePath);
};
