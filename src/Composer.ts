import {
  ComposerApiVersion,
  IComposerConfig,
  IComposerCheckpointResponse,
  ICheckpointOptions,
  ICheckpointResponseOptions,
  VerificationOutcome,
  VerificationStatus,
  ComposerMissingParameterError,
  ComposerMissingConfigError,
  ComposerInvalidConfigError,
  ITrackOptions,
} from "./types";

import { Logger, ComposerLogLevel, Severity } from "./logger";
import {
  constructApiHeaders,
  constructApiUrl,
  isNullOrEmpty,
  makeRequest,
  redactSensitiveFields,
  RequestFailedResponse,
  sleep,
} from "./utilities";
import {
  DEFAULT_CONFIG,
  DEFAULT_REQUEST_TIMEOUT_MS,
  BASE_CHECKPOINT_POLLING_WAIT_MS,
  MAX_FAILURE_COUNT,
  MAX_POLLING_WAIT_MS,
  BASE_CHECKPOINT_MAX_TIMEOUT_MS,
} from "./constants";

// Export a class that accepts a config object
// Main class for Composer SDK functionality
export class Composer {
  secretKey: string;
  config: IComposerConfig;

  /**
   * Constructor validates and sets up the Composer instance.
   * - Validates secret key and config
   * - Merges default config
   * - Validates API version and log level
   * - Sets logger filter level
   */
  constructor(secretKey: string, config?: IComposerConfig) {
    // Validate secret key
    if (secretKey == null || secretKey?.length === 0) {
      throw new ComposerMissingConfigError("secretApiKey", secretKey);
    }
    this.secretKey = secretKey;

    // Merge provided config with defaults
    this.config = {...DEFAULT_CONFIG, ...config};

    // Set API version
    if (
      !Object.keys(ComposerApiVersion).includes(
        this.config.apiVersion as ComposerApiVersion
      )
    ) {
      throw new ComposerInvalidConfigError(
        "config.apiVersion",
        this.config.apiVersion,
        Object.keys(ComposerApiVersion)
      );
    }

    // Validate log level
    const logLevel = this.config.logLevel ?? ComposerLogLevel.INFO;
    if (
      !Object.keys(ComposerLogLevel).includes(logLevel as ComposerLogLevel)
    ) {
      throw new ComposerInvalidConfigError(
        "config.logLevel",
        logLevel,
        Object.keys(ComposerLogLevel)
      );
    }

    // Set logger filter level
    Logger.filterLevel = Severity[logLevel as ComposerLogLevel];

    // Resolved after the logger is configured so the message below respects logLevel.
    const configuredRequestTimeoutMs = this.config.requestTimeoutMs;
    const isUsableRequestTimeoutMs =
      typeof configuredRequestTimeoutMs === "number" &&
      Number.isInteger(configuredRequestTimeoutMs) &&
      configuredRequestTimeoutMs > 0;

    if (!isUsableRequestTimeoutMs) {
      if (configuredRequestTimeoutMs !== undefined) {
        // Anything else makes AbortSignal.timeout throw, failing every request the SDK makes.
        Logger.error(
          `config.requestTimeoutMs must be a positive integer. Ignoring ${configuredRequestTimeoutMs} and using the ${DEFAULT_REQUEST_TIMEOUT_MS}ms default.`
        ).log();
      }

      this.config.requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
    }
  }

  /**
   * Helper to create a standard error response object
   */
  createErrorResponse(code: number, message: string) {
    return {
      success: false,
      errors: [{ code: code, message: message }],
      version: ComposerApiVersion.v1,
      verification: {
        id: "",
        status: VerificationStatus.FAILED,
        outcome: VerificationOutcome.ERROR,
      },
    };
  }

  /**
   * Sends a tracking event to the Composer API
   */
  public async event({
    userId = "",
    sessionId = "",
    sourceToken = "",
    event,
  }: ITrackOptions): Promise<void> {

    if (isNullOrEmpty(event)) {
      skipEvent("no event was provided");
      return;
    }

    if (isNullOrEmpty(event.type)) {
      skipEvent("event.type is missing");
      return;
    }

    if (isNullOrEmpty(sessionId) && isNullOrEmpty(sourceToken)) {
      skipEvent("Must provide either a sessionId or sourceToken");
      return;
    }

    // Only an explicit false disables the SDK. undefined must not overwrite the default.
    if (this.config.isEnabled === false) {
      return;
    }

    // Ensure event has a timestamp
    if (!event.eventTime) {
      event.eventTime = Date.now();
    }

    // Send event to API
    const response = await makeRequest({
      url: `${constructApiUrl(
        this.config.apiUrl as string,
        this.config.apiVersion
      )}track`,
      method: "POST",
      headers: constructApiHeaders(
        this.secretKey,
        "",
        sourceToken,
        userId,
        sessionId
      ),
      body: {
        ...event,
      },
      options: {},
      requestTimeoutMs: this.config.requestTimeoutMs,
    });

    // makeRequest already logged a request that never got a response.
    if (!(response instanceof RequestFailedResponse) && !response.ok) {
      Logger.error(`Composer event was not accepted by the API (HTTP ${response.status}).`).log();
    }
  }

  /**
   * Submits a checkpoint to Composer and polls for verification if needed
   * Handles timeouts, polling, and error conditions
   */
  public async checkpoint({
    checkpointName,
    event,
    sourceToken = "",
    userId = "",
    sessionId = "",
    useVerificationId = "",
    options = {},
  }: ICheckpointOptions): Promise<IComposerCheckpointResponse> {

    // Validate required parameters are present
    if (isNullOrEmpty(checkpointName)) {
      throw new ComposerMissingParameterError("checkpointName");
    }

    if (isNullOrEmpty(event)) {
      throw new ComposerMissingParameterError("event");
    }

    if (isNullOrEmpty(sessionId) && isNullOrEmpty(sourceToken)) {
      throw new ComposerMissingParameterError(
        "Must provide either a sessionId or sourceToken"
      );
    }

    // Only an explicit false disables the SDK. undefined must not overwrite the default.
    if (this.config.isEnabled === false) {
      return {
        success: true,
        errors: [],
        version: ComposerApiVersion.v1,
        verification: {
          id: "COMPOSER_IS_DISABLED",
          status: VerificationStatus.COMPLETE,
          outcome: VerificationOutcome.APPROVED,
          stepData: {},
        },
      } as IComposerCheckpointResponse;
    }

    const checkpointTimeout = !options.timeout || options.timeout <= 0 ? BASE_CHECKPOINT_MAX_TIMEOUT_MS : options.timeout; // this needs to accommodate for a timeout of 0 or less, which should use default max timeout.
    let currentPollingWait = BASE_CHECKPOINT_POLLING_WAIT_MS;
    let hasNeverPolled = true; // Always poll at least once if the verification is unresolved.

    // Prepare options for API call
    // If sync is true, we still poll if the server times out before resolving the checkpoint.
    let requestOptions: ICheckpointResponseOptions = {
      sync:
        options.sync ?? false, // Default to false, but can be overridden by user
    };

    let rawResponse: Response | null = null;
    let response: IComposerCheckpointResponse | null;

    let numFailures = 0;

    let checkpointStartTime = Date.now();

    // Submit checkpoint to API
    rawResponse = (await makeRequest({
      url: `${constructApiUrl(
        this.config.apiUrl as string,
        this.config.apiVersion
      )}checkpoint`,
      method: "POST",
      headers: constructApiHeaders(
        this.secretKey,
        useVerificationId,
        sourceToken,
        userId,
        sessionId
      ),
      body: {
        event: {
          type: checkpointName,
          ip: event.ip || undefined,
          data: event.data
        },
        options: requestOptions,
      },
      requestTimeoutMs: this.config.requestTimeoutMs,
    }));
    response = await parseCheckpointResponse(rawResponse);

    // Handle error or unsuccessful response
    if (!response) {
      return this.createErrorResponse(500, "Unknown evaluation error");
    } else if (!response.success) {
      return response;
    }

    // Check if verification is resolved or needs polling
    let isResolved =
      response.verification?.status !== VerificationStatus.PENDING;
    const verificationId = response.verification?.id;
    if (Logger.isTraceEnabled()) {
      Logger.trace(
        `Initial checkpoint response: ${JSON.stringify(redactSensitiveFields(response))}`
      ).log();
    }

    // Poll for verification result if not resolved
    // Exponential backoff with capped retries
    while (
      !isResolved &&
      (Date.now() - checkpointStartTime < checkpointTimeout || hasNeverPolled) &&
      numFailures < MAX_FAILURE_COUNT
    ) {
      await sleep(currentPollingWait);
      currentPollingWait = Math.min(currentPollingWait * 2, MAX_POLLING_WAIT_MS);
      hasNeverPolled = false;

      rawResponse = (await makeRequest({
        url: `${constructApiUrl(
          this.config.apiUrl as string,
          this.config.apiVersion
        )}verification/${verificationId}`,
        method: "GET",
        headers: constructApiHeaders(
          this.secretKey,
          useVerificationId,
          sourceToken,
          userId,
          sessionId
        ),
        requestTimeoutMs: this.config.requestTimeoutMs,
      }));
      response = await parseCheckpointResponse(rawResponse);

      if (response && response.success) {
        let status = response.verification?.status;
        if (!status) {
          numFailures += 1;
        } else {
          isResolved = status !== VerificationStatus.PENDING;
          numFailures = 0; // reset failure count on successful response, 3 consecutive failures are required to trigger a timeout.
        }
      } else {
        numFailures += 1;
      }
    }

    // If retries exceeded, return timeout error response
    if (numFailures >= MAX_FAILURE_COUNT) {
      Logger.error("Service Unavailable: Maximum retry count exceeded").log();
      const timeoutResponse: IComposerCheckpointResponse = {
        success: false,
        version: ComposerApiVersion.v1,
        errors: [
          {
            code: 503,
            message: "Service Unavailable: Maximum retry count exceeded",
          },
        ],
        isTimeout: true,
      };

      return timeoutResponse;
    }

    // The polling budget can run out right after a non-JSON poll.
    if (!response) {
      return this.createErrorResponse(500, "Unknown evaluation error");
    }

    // Return the final response
    if (Logger.isTraceEnabled()) {
      Logger.trace(
        `Returning response: ${JSON.stringify(redactSensitiveFields(response))}`
      ).log();
    }
    return response;
  }

  /**
   * Returns true if the checkpoint is still running (pending or blocked) with no verdict yet
   */
  public isRunning(checkpointResponse: IComposerCheckpointResponse): boolean {
    if (
      checkpointResponse.success &&
      checkpointResponse.verification?.outcome === VerificationOutcome.PENDING
    ) {
      switch (checkpointResponse.verification?.status) {
        case VerificationStatus.PENDING:
        case VerificationStatus.BLOCKED:
          return true;
        default:
          return false;
      }
    }
    return false;
  }

  /**
   * Returns true if the checkpoint was approved
   */
  public isAllowed(checkpointResponse: IComposerCheckpointResponse): boolean {
    return (
      checkpointResponse.success &&
      checkpointResponse.verification?.status === VerificationStatus.COMPLETE &&
      checkpointResponse.verification?.outcome === VerificationOutcome.APPROVED
    );
  }

  /**
   * Returns true if the checkpoint was denied
   */
  public isDenied(checkpointResponse: IComposerCheckpointResponse): boolean {
    if (checkpointResponse.success) {
      switch (checkpointResponse.verification?.outcome) {
        case VerificationOutcome.DENIED:
          return true;
        default:
          return false;
      }
    }
    return false;
  }

  /**
   * Returns true if the checkpoint is complete but outcome is still pending
   */
  public isUndecided(
    checkpointResponse: IComposerCheckpointResponse
  ): boolean {
    return (
      checkpointResponse.success &&
      checkpointResponse.verification?.status === VerificationStatus.COMPLETE &&
      checkpointResponse.verification?.outcome === VerificationOutcome.PENDING
    );
  }

  /**
   * Returns true if the checkpoint response indicates an error
   */
  public hasError(checkpointResponse: IComposerCheckpointResponse): boolean {
    return (
      !checkpointResponse.success ||
      checkpointResponse.verification?.outcome === VerificationOutcome.ERROR
    );
  }

  /**
   * Returns true if the checkpoint response timed out
   */
  public isTimeout(checkpointResponse: IComposerCheckpointResponse): boolean {
    return (
      !checkpointResponse.success && (checkpointResponse.isTimeout as boolean)
    );
  }
}

const skipEvent = (reason: string): void => {
  Logger.error(`Composer event was not sent: ${reason}`).log();
};

// A non-JSON body (e.g. a proxy's HTML error page) returns null, which checkpoint() treats as a
// failed request instead of rejecting. The body is never logged.
const parseCheckpointResponse = async (
  rawResponse: Response
): Promise<IComposerCheckpointResponse | null> => {
  try {
    return await rawResponse.json() as IComposerCheckpointResponse;
  } catch {
    Logger.error("The Composer API returned a response that is not valid JSON.").log();
    return null;
  }
};

// For backward compatibility, export Dodgeball as an alias for Composer
export const Dodgeball = Composer;
