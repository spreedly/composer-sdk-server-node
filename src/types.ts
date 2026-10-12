import { ComposerLogLevel } from "./logger";

export enum ComposerApiVersion {
  v1 = "v1",
}

export const DodgeballApiVersion = ComposerApiVersion; // Support backwards compatibility with prior Dodgeball naming conventions

export enum VerificationStatus {
  // In Process on the server
  PENDING = "PENDING",

  // Waiting on some action, for example MFA
  BLOCKED = "BLOCKED",

  // Workflow evaluated successfully
  COMPLETE = "COMPLETE",

  // Workflow execution failure
  FAILED = "FAILED",
}

export enum VerificationOutcome {
  APPROVED = "APPROVED",
  DENIED = "DENIED",
  PENDING = "PENDING",
  ERROR = "ERROR",
  USAGE_LIMIT = "USAGE_LIMIT",
  API_LIMIT = "API_LIMIT",
}

/**
 * Configuration options for initializing the Composer SDK.
 *
 * @param apiVersion - The version of the Composer API to use. This is required and should be set to "v1" for the current API version.
 * @param apiUrl - Optional URL to the Composer API. This is only required for self-hosted distributions. For the standard cloud-hosted version, the SDK will use the default API URL.
 * @param logLevel - Optional log level for the SDK, which can be TRACE, INFO, ERROR, or NONE. The default log level is INFO.
 * @param isEnabled - Optional flag to enable or disable the SDK. If set to false, all SDK calls will be no-ops. The default value is true.
 * @param requestTimeoutMs - Optional per-request HTTP transport timeout in milliseconds. Default is 30000 ms. This is distinct from checkpoint `options.timeout`, which controls the polling budget.
 *
 */
export interface IComposerConfig {
  apiVersion: ComposerApiVersion;
  apiUrl?: string;
  logLevel?: ComposerLogLevel;
  isEnabled?: boolean;
  requestTimeoutMs?: number;
}

export interface IDodgeballConfig extends IComposerConfig {} // Support backwards compatibility with prior Dodgeball naming conventions

/**
 * Represents the event data sent to a checkpoint, including IP and arbitrary data.
 *
 * @param ip - The IP address associated with the event, used for geolocation and risk analysis.
 * @param data - A key-value map of any additional data relevant to the checkpoint event, which will be digested into the Composer Vocabulary for use in policies and rules. All keys must be strings, but the values can be of any type.
 *
 */
export interface ICheckpointEvent {
  ip?: string;
  data: { [key: string]: any };
}

/**
 * Represents a tracking event to be sent to Spreedly.
 *
 * @param type - The name of the event, which may be any string under 256 characters, that indicates what took place.
 * @param data - Any arbitrary data to track, which will be digested into the Composer Vocabulary. This should be a key-value map where all keys are strings, but values can be of any type.
 * @param eventTime - Optional timestamp in milliseconds since Epoch indicating when the event took place. If not provided, the current time will be used.
 *
 */
export interface ITrackEvent {
  type: string; // The name of the event, may be any string under 256 characters, that indicates what took place
  data: { [key: string]: any }; // Any arbitrary data they want to track. Will be digested into the Composer Vocabulary
  eventTime?: number; // ms since Epoch
}

/**
 * Options for sending a tracking event, including session/user/source identifiers.
 *
 * @paramsevent - The event data to be tracked, including type and arbitrary data.
 * @param sessionId - Optional session identifier to associate with the event, which can be used for session-based policies and analysis.
 * @param userId - Optional user identifier to associate with the event, which can be used for user-based policies and analysis.
 * @param sourceToken - Optional token representing the source of the event, which can be used for source-based policies and analysis.
 *
 */
export interface ITrackOptions {
  event: ITrackEvent;
  sessionId?: string;
  userId?: string;
  sourceToken?: string;
}

/**
 * Options for customizing checkpoint response behavior, such as sync/async and timeout.
 *
 * @param sync - If true, the checkpoint call will wait for a response from the server before returning. If false or not provided, the checkpoint call will return immediately and the response can be retrieved later using the verify endpoint with the verification ID. The SDK will automatically poll for the checkpoint response in this case.
 * @param timeout - Optional timeout in milliseconds for polling a pending checkpoint response, whether sync is true or false. The latest status of the Checkpoint will be returned if not resolved by the timeout duration. Default is 600000 ms (10 minutes).
 */
export interface ICheckpointResponseOptions {
  sync?: boolean;
  timeout?: number;
}

/**
 * Options for submitting a checkpoint, including event, identifiers, and response options.
 *
 * @param checkpointName - The name of the checkpoint to evaluate, which should correspond to a checkpoint defined in your Composer policies.
 * @param event - The event data associated with the checkpoint evaluation, including IP and arbitrary data.
 * @param sourceToken - Optional token representing the source of the checkpoint event, which can be used for source-based policies and analysis.
 * @param sessionId - Optional session identifier to associate with the checkpoint event, which can be used for session-based policies and analysis.
 * @param userId - Optional user identifier to associate with the checkpoint event, which can be used for user-based policies and analysis.
 * @param useVerificationId - Optional verification ID to use for this checkpoint evaluation, which can be used to correlate with a previous checkpoint response when sync is false or to retrieve the response later using the verify endpoint.
 * @param options - Optional settings for customizing checkpoint response behavior, such as sync/async and timeout.
 *
 */
export interface ICheckpointOptions {
  checkpointName: string;
  event: ICheckpointEvent;
  sourceToken?: string;
  sessionId?: string;
  userId?: string;
  useVerificationId?: string;
  options?: ICheckpointResponseOptions;
}

/**
 * Represents the verification result for a checkpoint, including status and outcome.
 *
 * @param id - The unique identifier for the verification, which can be used to retrieve the checkpoint response later when sync is false.
 * @param status - The current status of the verification, which can be PENDING, BLOCKED, COMPLETE, or FAILED.
 * @param outcome - The outcome of the verification, which can be APPROVED, DENIED, PENDING, ERROR, USAGE_LIMIT, API_LIMIT.
 * @param stepData - Data from the workflow's steps.
 * @param nextSteps - Steps the Client SDK runs next, such as MFA.
 *
 */
export interface IComposerVerification {
  id: string;
  status: VerificationStatus;
  outcome: VerificationOutcome;
  stepData?: { [key: string]: any };
  nextSteps?: { [key: string]: any }[];
}

/**
 * The response returned from a Composer checkpoint evaluation.
 *
 * @param success - Indicates whether the checkpoint evaluation was successful or if there were errors in processing the request.
 * @param errors - An array of any errors that occurred during the checkpoint evaluation, including error codes and messages.
 * @param version - The version of the Composer API that processed the checkpoint request.
 * @param verification - The verification result for the checkpoint, including status and outcome. This may be undefined if the checkpoint evaluation has not completed yet when sync is false.
 * @param isTimeout - True when polling stopped after 3 failed polls in a row. Running out of the polling timeout leaves this false and returns the verification still pending.
 *
 */
export interface IComposerCheckpointResponse {
  success: boolean;
  errors: IComposerApiError[];
  version: ComposerApiVersion;
  verification?: IComposerVerification;
  isTimeout?: boolean;
}

// Error Types
/**
 * Represents an error returned by the Composer API.
 *
 * @param code - The error code returned by the API, which can be used to identify the type of error that occurred.
 * @param message - A human-readable message describing the error that occurred.
 *
 */
export interface IComposerApiError {
  code: number;
  message: string;
}

export class ComposerMissingConfigError extends Error {
  constructor(configName: string, value: any) {
    super(
      `Composer SDK Error\nMissing configuration: ${configName}\nProvided Value: ${value}`
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ComposerInvalidConfigError extends Error {
  constructor(configName: string, value: any, allowedValues: any[]) {
    super(
      `Composer SDK Error\nInvalid configuration: ${configName}\nProvided value: ${value}\nAllowed values: ${allowedValues.join(
        ", "
      )}`
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ComposerMissingParameterError extends Error {
  constructor(parameter: string) {
    super(`Composer SDK Error\nMissing parameter: ${parameter}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
