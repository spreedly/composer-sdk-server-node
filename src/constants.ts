import { ComposerLogLevel } from "./logger";
import { ComposerApiVersion, IComposerConfig } from "./types";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30 * 1000; // 30 seconds

export const DEFAULT_CONFIG: IComposerConfig = {
  apiVersion: ComposerApiVersion.v1,
  apiUrl: "https://api.dodgeballhq.com/",
  logLevel: ComposerLogLevel.INFO,
  isEnabled: true,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
};

export const BASE_CHECKPOINT_POLLING_WAIT_MS = 100; // This is the default starting wait time between polling attempts before the backoff is applied
export const MAX_POLLING_WAIT_MS = 2000; // This is the maximum amount of time between polling attempts
export const BASE_CHECKPOINT_MAX_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes in ms
export const MAX_FAILURE_COUNT = 3;
