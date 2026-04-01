export interface LifecycleService {
  start(): Promise<void>;
  stop(): Promise<void>;
}
