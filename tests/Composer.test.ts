import { IComposerCheckpointResponse } from "../dist/types/types";
import {
  ComposerInvalidConfigError,
  ComposerMissingParameterError,
  ICheckpointOptions,
  IComposerVerification,
  ITrackOptions,
  VerificationOutcome,
  VerificationStatus,
} from "../src/types";
import { Composer } from "../src/Composer";
import { ComposerLogLevel, Logger, Severity } from "../src/logger";
import { ComposerApiVersion, ComposerMissingConfigError } from "../src/types";
import * as utilities from "../src/utilities";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../src/constants";

describe("constructor", () => {
  test("should require an API key", () => {
    expect(() => {
      new Composer("");
    }).toThrow(ComposerMissingConfigError);
  });

  test("should only require an API key", () => {
    const composer = new Composer("test-secret-key");
    expect(composer).toBeInstanceOf(Composer);
  });

  test("should accept a valid config object", () => {
    const composer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      apiUrl: "https://api.composerhq.com/",
      logLevel: ComposerLogLevel.TRACE,
    });

    expect(composer).toBeInstanceOf(Composer);
  });

  test("should fail with an invalid apiVersion in config object", () => {
    expect(() => {
      new Composer("test-secret-key", {
        apiVersion: "invalid" as any,
      });
    }).toThrow(ComposerInvalidConfigError);
  });

  test("should fail with an invalid logLevel in the config object", () => {
    expect(() => {
      new Composer("test-secret-key", {
        apiVersion: ComposerApiVersion.v1,
        logLevel: "invalid" as any,
      });
    }).toThrow(ComposerInvalidConfigError);
  });

  test("should default to INFO logLevel when logLevel is undefined", () => {
    const composer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      logLevel: undefined,
    });

    expect(composer).toBeInstanceOf(Composer);
    expect(composer.config.logLevel).toBeUndefined();
    // Logger.filterLevel should be set to INFO (Severity.INFO = 1)
    expect(Logger.filterLevel).toBe(Severity.INFO);
  });

  test("should default requestTimeoutMs to 30 seconds", () => {
    const composer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
    });

    expect(composer.config.requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  test("should accept a custom requestTimeoutMs in config", () => {
    const composer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      requestTimeoutMs: 5000,
    });

    expect(composer.config.requestTimeoutMs).toBe(5000);
  });

  // The non-numeric cases are cast, since only an untyped JS caller could supply them.
  test.each([0, -1, 1500.5, NaN, Infinity, "5000", undefined])(
    "should fall back to the default requestTimeoutMs when given %s",
    (requestTimeoutMs: unknown) => {
      const composer = new Composer("test-secret-key", {
        apiVersion: ComposerApiVersion.v1,
        requestTimeoutMs: requestTimeoutMs as number | undefined,
      });

      expect(composer.config.requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    }
  );

  test.each([
    { requestTimeoutMs: 0, shouldLog: true },
    { requestTimeoutMs: -1, shouldLog: true },
    { requestTimeoutMs: 1500.5, shouldLog: true },
    { requestTimeoutMs: NaN, shouldLog: true },
    { requestTimeoutMs: Infinity, shouldLog: true },
    { requestTimeoutMs: "5000", shouldLog: true },
    { requestTimeoutMs: undefined, shouldLog: false },
  ])(
    "should log only when requestTimeoutMs is supplied but unusable ($requestTimeoutMs)",
    ({
      requestTimeoutMs,
      shouldLog,
    }: {
      requestTimeoutMs: unknown;
      shouldLog: boolean;
    }) => {
      const errorSpy = vi.spyOn(Logger, "error");

      try {
        new Composer("test-secret-key", {
          apiVersion: ComposerApiVersion.v1,
          requestTimeoutMs: requestTimeoutMs as number | undefined,
        });

        if (shouldLog) {
          expect(errorSpy).toHaveBeenCalledOnce();
          expect(errorSpy.mock.calls[0][0]).toContain("config.requestTimeoutMs");
        } else {
          expect(errorSpy).not.toHaveBeenCalled();
        }
      } finally {
        errorSpy.mockRestore();
      }
    }
  );
});

describe("isRunning", () => {
  let composer: Composer;
  let checkpointResponse: IComposerCheckpointResponse;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    checkpointResponse = {
      success: true,
      errors: [],
      version: ComposerApiVersion.v1,
      verification: {
        id: "test-verification-id",
        status: VerificationStatus.PENDING,
        outcome: VerificationOutcome.PENDING,
      },
    };
  });

  test("should return true for a pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isRunning(checkpointResponse)).toBe(true);
  });

  test("should return true for a blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isRunning(checkpointResponse)).toBe(true);
  });

  test("should return false for a denied blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for a denied pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for an approved blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for an approved verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for a denied verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for a failed verification", () => {
    checkpointResponse.success = false;
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for an undecided complete verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });

  test("should return false for a timeout", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;
    checkpointResponse.isTimeout = true;
    checkpointResponse.errors.push({
      code: 503,
      message: "Service Unavailable: Maximum retry count exceeded",
    });

    expect(composer.isRunning(checkpointResponse)).toBe(false);
  });
});

describe("isAllowed", () => {
  let composer: Composer;
  let checkpointResponse: IComposerCheckpointResponse;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    checkpointResponse = {
      success: true,
      errors: [],
      version: ComposerApiVersion.v1,
      verification: {
        id: "test-verification-id",
        status: VerificationStatus.PENDING,
        outcome: VerificationOutcome.PENDING,
      },
    };
  });

  test("should return false for a pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isAllowed(checkpointResponse)).toBe(false);
  });

  test("should return false for a blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isAllowed(checkpointResponse)).toBe(false);
  });

  test("should return true for an approved verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.isAllowed(checkpointResponse)).toBe(true);
  });

  test("should return false for a denied verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isAllowed(checkpointResponse)).toBe(false);
  });

  test("should return false for a failed verification", () => {
    checkpointResponse.success = false;
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.isAllowed(checkpointResponse)).toBe(false);
  });

  test("should return false for an undecided complete verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isAllowed(checkpointResponse)).toBe(false);
  });

  test("should return false for a timeout", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;
    checkpointResponse.isTimeout = true;
    checkpointResponse.errors.push({
      code: 503,
      message: "Service Unavailable: Maximum retry count exceeded",
    });

    expect(composer.isAllowed(checkpointResponse)).toBe(false);
  });
});

describe("isDenied", () => {
  let composer: Composer;
  let checkpointResponse: IComposerCheckpointResponse;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    checkpointResponse = {
      success: true,
      errors: [],
      version: ComposerApiVersion.v1,
      verification: {
        id: "test-verification-id",
        status: VerificationStatus.PENDING,
        outcome: VerificationOutcome.PENDING,
      },
    };
  });

  test("should return false for a pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isDenied(checkpointResponse)).toBe(false);
  });

  test("should return false for a blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isDenied(checkpointResponse)).toBe(false);
  });

  test("should return false for an approved verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.isDenied(checkpointResponse)).toBe(false);
  });

  test("should return true for a denied verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isDenied(checkpointResponse)).toBe(true);
  });

  test("should return false for a failed verification", () => {
    checkpointResponse.success = false;
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.isDenied(checkpointResponse)).toBe(false);
  });

  test("should return false for an undecided complete verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isDenied(checkpointResponse)).toBe(false);
  });

  test("should return false for a timeout", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;
    checkpointResponse.isTimeout = true;
    checkpointResponse.errors.push({
      code: 503,
      message: "Service Unavailable: Maximum retry count exceeded",
    });

    expect(composer.isDenied(checkpointResponse)).toBe(false);
  });
});

describe("isUndecided", () => {
  let composer: Composer;
  let checkpointResponse: IComposerCheckpointResponse;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    checkpointResponse = {
      success: true,
      errors: [],
      version: ComposerApiVersion.v1,
      verification: {
        id: "test-verification-id",
        status: VerificationStatus.PENDING,
        outcome: VerificationOutcome.PENDING,
      },
    };
  });

  test("should return false for a pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isUndecided(checkpointResponse)).toBe(false);
  });

  test("should return false for a blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isUndecided(checkpointResponse)).toBe(false);
  });

  test("should return false for an approved verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.isUndecided(checkpointResponse)).toBe(false);
  });

  test("should return false for a denied verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isUndecided(checkpointResponse)).toBe(false);
  });

  test("should return false for a failed verification", () => {
    checkpointResponse.success = false;
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.isUndecided(checkpointResponse)).toBe(false);
  });

  test("should return true for an undecided complete verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isUndecided(checkpointResponse)).toBe(true);
  });

  test("should return false for a timeout", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;
    checkpointResponse.isTimeout = true;
    checkpointResponse.errors.push({
      code: 503,
      message: "Service Unavailable: Maximum retry count exceeded",
    });

    expect(composer.isUndecided(checkpointResponse)).toBe(false);
  });
});

describe("hasError", () => {
  let composer: Composer;
  let checkpointResponse: IComposerCheckpointResponse;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    checkpointResponse = {
      success: true,
      errors: [],
      version: ComposerApiVersion.v1,
      verification: {
        id: "test-verification-id",
        status: VerificationStatus.PENDING,
        outcome: VerificationOutcome.PENDING,
      },
    };
  });

  test("should return false for a pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.hasError(checkpointResponse)).toBe(false);
  });

  test("should return false for a blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.hasError(checkpointResponse)).toBe(false);
  });

  test("should return false for an approved verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.hasError(checkpointResponse)).toBe(false);
  });

  test("should return false for a denied verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.hasError(checkpointResponse)).toBe(false);
  });

  test("should return true for a failed verification", () => {
    checkpointResponse.success = false;
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.hasError(checkpointResponse)).toBe(true);
  });

  test("should return false for an undecided complete verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.hasError(checkpointResponse)).toBe(false);
  });

  test("should return true for a timeout", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;
    checkpointResponse.isTimeout = true;
    checkpointResponse.errors.push({
      code: 503,
      message: "Service Unavailable: Maximum retry count exceeded",
    });

    expect(composer.hasError(checkpointResponse)).toBe(true);
  });

  test("should return true for a successful response with an errored verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.hasError(checkpointResponse)).toBe(true);
  });

  test("should return true for an unsuccessful response with no verification or errors", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;

    expect(composer.hasError(checkpointResponse)).toBe(true);
  });

  test("should return false for a pending verification with errors", () => {
    checkpointResponse.errors.push({ code: 504, message: "Server timeout" });

    expect(composer.hasError(checkpointResponse)).toBe(false);
  });
});

describe("isTimeout", () => {
  let composer: Composer;
  let checkpointResponse: IComposerCheckpointResponse;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    checkpointResponse = {
      success: true,
      errors: [],
      version: ComposerApiVersion.v1,
      verification: {
        id: "test-verification-id",
        status: VerificationStatus.PENDING,
        outcome: VerificationOutcome.PENDING,
      },
    };
  });

  test("should return false for a pending verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.PENDING;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isTimeout(checkpointResponse)).toBeFalsy();
  });

  test("should return false for a blocked verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.BLOCKED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isTimeout(checkpointResponse)).toBeFalsy();
  });

  test("should return false for an approved verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.APPROVED;

    expect(composer.isTimeout(checkpointResponse)).toBeFalsy();
  });

  test("should return false for a denied verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.DENIED;

    expect(composer.isTimeout(checkpointResponse)).toBeFalsy();
  });

  test("should return false for a failed verification", () => {
    checkpointResponse.success = false;
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.FAILED;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.ERROR;

    expect(composer.isTimeout(checkpointResponse)).toBeFalsy();
  });

  test("should return false for an undecided complete verification", () => {
    (checkpointResponse.verification as IComposerVerification).status =
      VerificationStatus.COMPLETE;
    (checkpointResponse.verification as IComposerVerification).outcome =
      VerificationOutcome.PENDING;

    expect(composer.isTimeout(checkpointResponse)).toBeFalsy();
  });

  test("should return true for a timeout", () => {
    delete checkpointResponse.verification;
    checkpointResponse.success = false;
    checkpointResponse.isTimeout = true;
    checkpointResponse.errors.push({
      code: 503,
      message: "Service Unavailable: Maximum retry count exceeded",
    });

    expect(composer.isTimeout(checkpointResponse)).toBe(true);
  });
});

describe("checkpoint", () => {
  let composer: Composer;
  function getFetchResponseApproved(): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({
        verification: {
          id: "123",
          status: VerificationStatus.COMPLETE,
          outcome: VerificationOutcome.APPROVED,
        },
        success: true,
        errors: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ));
  }
  // TODO: Add a composer response with a status complete, and outcome failed
  function getFetchResponsePending(): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({
        verification: {
          id: "123",
          status: VerificationStatus.PENDING,
          outcome: VerificationOutcome.PENDING,
        },
        success: true,
        errors: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ));
  }
  function getFetchResponseServerError(): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 500, message: "Internal Server Error" }],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ));
  }
  function getFetchResponseBadRequest(): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 400, message: "Bad Request" }],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ));
  }
  function getFetchResponseSuccessNoStatus(): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({
        verification: {
          id: "123",
        },
        success: true,
        errors: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ));
  }

  beforeEach(() => {
    const composerConfig = {
      apiVersion: ComposerApiVersion.v1,
      logLevel: ComposerLogLevel.NONE,
    }
    composer = new Composer("test-secret-key", composerConfig);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should require a checkpoint name", async () => {
    const result = composer.checkpoint({
      checkpointName: "",
      event: {
        ip: ""
      },
    } as ICheckpointOptions);

    await expect(result).rejects.toBeInstanceOf(ComposerMissingParameterError);
    await expect(result).rejects.toThrow("Missing parameter: checkpointName");
  });

  test("should require an event object", async () => {
    const result = composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: null as any,
    } as ICheckpointOptions);

    await expect(result).rejects.toBeInstanceOf(ComposerMissingParameterError);
    await expect(result).rejects.toThrow("Missing parameter: event");
  });

  test("should require either a sessionId or sourceToken", async () => {
    const result = composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "",
    } as ICheckpointOptions);

    await expect(result).rejects.toBeInstanceOf(ComposerMissingParameterError);
    await expect(result).rejects.toThrow("Missing parameter: Must provide either a sessionId or sourceToken");
  });

  test("should return a default approved response for a valid checkpoint request", async () => {
    const disabledComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: false,
    });
    const response = await disabledComposer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.errors).toEqual([]);
    expect(response.version).toBe(ComposerApiVersion.v1);
    expect(response.verification).toBeDefined();
    expect(response.verification?.id).toBe('COMPOSER_IS_DISABLED');
    expect(response.verification?.status).toBe(VerificationStatus.COMPLETE);
    expect(response.verification?.outcome).toBe(VerificationOutcome.APPROVED);
  });

  test("should send a checkpoint without an event.ip, since the API treats it as optional", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockImplementation(async () => getFetchResponseApproved());

    for (const event of [{} as any, { ip: "" }]) {
      const response = await composer.checkpoint({
        checkpointName: "test-checkpoint",
        event,
        sessionId: "test-session-id",
        options: { sync: true },
      } as ICheckpointOptions);
      expect(response.success).toBe(true);
    }

    expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    for (const [request] of makeRequestSpy.mock.calls) {
      expect(JSON.parse(JSON.stringify(request.body)).event).not.toHaveProperty("ip");
    }
  });

  test("should return stepData and nextSteps for a blocked verification", async () => {
    const nextSteps = [{ id: "step-1", name: "MFA", url: "https://example.com/mfa.js", config: {} }];
    vi.spyOn(utilities, "makeRequest").mockResolvedValue(new Response(
      JSON.stringify({
        success: true,
        errors: [],
        verification: {
          id: "123",
          status: VerificationStatus.BLOCKED,
          outcome: VerificationOutcome.PENDING,
          stepData: { customMessage: "Verify it's you" },
          nextSteps,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: { data: {} },
      sessionId: "test-session-id",
    });

    expect(response.verification?.stepData).toEqual({ customMessage: "Verify it's you" });
    expect(response.verification?.nextSteps).toEqual(nextSteps);
  });

  test("should stay enabled when isEnabled is undefined", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockResolvedValue(getFetchResponseApproved());
    const composerWithUndefined = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: undefined,
    });

    const response = await composerWithUndefined.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
      options: {
        sync: true,
      },
    } as ICheckpointOptions);

    expect(response.verification?.id).not.toBe("COMPOSER_IS_DISABLED");
    expect(makeRequestSpy).toHaveBeenCalled();
  });

  test("should only make checkpoint call when options.sync is true", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockResolvedValue(getFetchResponseApproved());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
      options: {
        sync: true,
      },
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
    expect(response.verification?.id).toBe('123');
    expect(response.verification?.status).toBe(VerificationStatus.COMPLETE);
    expect(response.verification?.outcome).toBe(VerificationOutcome.APPROVED);
  });

  test("should not let a caller-supplied event.type override the declared checkpointName", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockResolvedValue(getFetchResponseApproved());

    await composer.checkpoint({
      checkpointName: "PAYMENT",
      event: {
        ip: "127.0.0.1",
        // A JS caller (or an `as any` cast) can smuggle extra keys onto the
        // event object. The declared checkpoint name must always win, and no
        // stray caller key should reach the API.
        type: "LOW_RISK_TEST_CHECKPOINT",
        evil: "leaked",
      } as any,
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    const callArgs = makeRequestSpy.mock.calls[0][0];
    expect(callArgs.body.event.type).toBe("PAYMENT");
    expect(callArgs.body.event.evil).toBeUndefined();
  });

  test("should poll for verification status after creating checkpoint", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponseApproved());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    expect(response.success).toBe(true);
    expect(response.verification?.id).toBe('123');
    expect(response.verification?.status).toBe(VerificationStatus.COMPLETE);
    expect(response.verification?.outcome).toBe(VerificationOutcome.APPROVED);
  });

  test("should poll for verification status after creating checkpoint (multiple calls)", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponseApproved());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(4);
    expect(response.success).toBe(true);
    expect(response.verification?.id).toBe('123');
    expect(response.verification?.status).toBe(VerificationStatus.COMPLETE);
    expect(response.verification?.outcome).toBe(VerificationOutcome.APPROVED);
  });

  test("should stop polling minimum of once max timeout is reached", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponsePending());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
      options: {
        timeout: 10, // set timeout to 10 milliseconds for testing, this is less than the default polling time of 100ms
      },
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    expect(response.success).toBe(true);
    expect(response.verification?.id).toBe('123');
    expect(response.verification?.status).toBe(VerificationStatus.PENDING);
    expect(response.verification?.outcome).toBe(VerificationOutcome.PENDING);
  });

  test("should pass config requestTimeoutMs to checkpoint and poll requests", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponseApproved());

    const customComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      logLevel: ComposerLogLevel.NONE,
      requestTimeoutMs: 5000,
    });

    await customComposer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    expect(makeRequestSpy.mock.calls[0][0].requestTimeoutMs).toBe(5000);
    expect(makeRequestSpy.mock.calls[1][0].requestTimeoutMs).toBe(5000);
  });

  test("should keep checkpoint polling timeout independent from requestTimeoutMs", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponsePending());

    const customComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      logLevel: ComposerLogLevel.NONE,
      requestTimeoutMs: 30000,
    });

    const response = await customComposer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
      options: {
        timeout: 10,
      },
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    expect(makeRequestSpy.mock.calls[0][0].requestTimeoutMs).toBe(30000);
    expect(makeRequestSpy.mock.calls[1][0].requestTimeoutMs).toBe(30000);
    expect(response.verification?.status).toBe(VerificationStatus.PENDING);
  });

  test("should error if creating checkpoint fails", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockResolvedValueOnce(getFetchResponseServerError());

    try {
      await composer.checkpoint({
        checkpointName: "test-checkpoint",
        event: {
          ip: "127.0.0.1",
        },
        sessionId: "test-session-id",
      } as ICheckpointOptions);
    } catch (error: any) {
      expect(makeRequestSpy).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("Checkpoint request failed with status code 500: Internal Server Error");
    }
  });

  test("should return checkpoint response if not successful", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockResolvedValueOnce(getFetchResponseBadRequest());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(false);
    expect(response.errors).toEqual([{ code: 400, message: "Bad Request" }]);
  });

  test("should handle null response from checkpoint", async () => {
    // Mock a response that will result in null after JSON parsing
    const mockResponse = {
      json: vi.fn().mockResolvedValue(null),
    };
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest").mockResolvedValueOnce(
      mockResponse as any
    );

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(false);
    expect(response.errors[0].code).toBe(500);
    expect(response.errors[0].message).toBe("Unknown evaluation error");
  });

  test("should return a failure response, not reject, when the checkpoint response is not JSON", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    vi.spyOn(utilities, "makeRequest").mockResolvedValueOnce(
      new Response("<html>Bad Gateway</html>", { status: 502 })
    );

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: { ip: "127.0.0.1" },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(response.success).toBe(false);
    expect(response.errors[0].code).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith("The Composer API returned a response that is not valid JSON.");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("Bad Gateway");
  });

  test("should count non-JSON polling responses toward the failure limit", async () => {
    const nonJson = () => new Response("<html>Bad Gateway</html>", { status: 502 });
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(nonJson())
      .mockResolvedValueOnce(nonJson())
      .mockResolvedValueOnce(nonJson());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: { ip: "127.0.0.1" },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(4);
    expect(response.success).toBe(false);
    expect(response.isTimeout).toBe(true);
  });

  test("should return a failure response when the timeout expires after a non-JSON poll", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: { ip: "127.0.0.1" },
      sessionId: "test-session-id",
      options: { timeout: 10 },
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    expect(response).not.toBeNull();
    expect(response.success).toBe(false);
    expect(response.errors[0].code).toBe(500);
  });

  test("should error if 3 consecutive polling attempts fail", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponseServerError())
      .mockResolvedValueOnce(getFetchResponseServerError())
      .mockResolvedValueOnce(getFetchResponseServerError());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(4); // 1 for checkpoint creation + 3 for polling attempts
    expect(response.success).toBe(false);
    expect(response.errors).toEqual([{ code: 503, message: "Service Unavailable: Maximum retry count exceeded" }]);
    expect(response.isTimeout).toBe(true);
  });

  test("should handle polling response without status field", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponseSuccessNoStatus())
      .mockResolvedValueOnce(getFetchResponseSuccessNoStatus())
      .mockResolvedValueOnce(getFetchResponseSuccessNoStatus());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    // Should hit MAX_FAILURE_COUNT and return timeout
    expect(makeRequestSpy).toHaveBeenCalledTimes(4);
    expect(response.success).toBe(false);
    expect(response.errors).toEqual([{ code: 503, message: "Service Unavailable: Maximum retry count exceeded" }]);
    expect(response.isTimeout).toBe(true);
  });

  test("should return response if there are fewer than 3 consecutive polling fails", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest")
      .mockResolvedValueOnce(getFetchResponsePending())
      .mockResolvedValueOnce(getFetchResponseServerError())
      .mockResolvedValueOnce(getFetchResponseApproved());

    const response = await composer.checkpoint({
      checkpointName: "test-checkpoint",
      event: {
        ip: "127.0.0.1",
      },
      sessionId: "test-session-id",
    } as ICheckpointOptions);

    expect(makeRequestSpy).toHaveBeenCalledTimes(3); // 1 for checkpoint creation + 2 for polling attempts
    expect(response.success).toBe(true);
    expect(response.verification?.id).toBe('123');
    expect(response.verification?.status).toBe(VerificationStatus.COMPLETE);
    expect(response.verification?.outcome).toBe(VerificationOutcome.APPROVED);
  });
});

describe("event", () => {
  let composer: Composer;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should require an event", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");

    await composer.event({
      event: null as any,
    } as ITrackOptions);

    expect(errorSpy).toHaveBeenCalledWith("Composer event was not sent: no event was provided");
    expect(makeRequestSpy).not.toHaveBeenCalled();
  });

  test("should require an event type", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");

    await composer.event({ event: { data: {} } as any } as ITrackOptions);

    expect(errorSpy).toHaveBeenCalledWith("Composer event was not sent: event.type is missing");
    expect(makeRequestSpy).not.toHaveBeenCalled();
  });

  test("should reject a blank event type", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");

    await composer.event({ event: { type: "   ", data: {} } });
    expect(makeRequestSpy).not.toHaveBeenCalled();
  });

  test("should require either a sessionId or sourceToken", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");

    await composer.event({ event: { type: "TEST_EVENT", data: {} } });
    await composer.event({
      sessionId: "   ",
      sourceToken: "   ",
      event: { type: "TEST_EVENT", data: {} },
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "Composer event was not sent: Must provide either a sessionId or sourceToken"
    );
    expect(makeRequestSpy).not.toHaveBeenCalled();
  });

  test("should not report a network failure as an API rejection", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    await composer.event({ sessionId: "session123", event: { type: "TEST_EVENT", data: {} } });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toBe("There was an error making a request.");
  });

  test("should log the status when the API does not accept the event", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    vi.spyOn(utilities, "makeRequest").mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [] }), { status: 400 })
    );

    await composer.event({ sessionId: "session123", event: { type: "TEST_EVENT", data: {} } });

    expect(errorSpy).toHaveBeenCalledWith("Composer event was not accepted by the API (HTTP 400).");
  });

  test("should not log when the API accepts the event", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    vi.spyOn(utilities, "makeRequest").mockResolvedValue(
      new Response(JSON.stringify({ success: true, errors: [] }), { status: 201 })
    );

    await composer.event({ sessionId: "session123", event: { type: "TEST_EVENT", data: {} } });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("should send event with eventTime automatically added", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");
    makeRequestSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const eventData = {
      type: "TEST_EVENT",
      data: { test: "value" }
    };

    await composer.event({
      userId: "user123",
      sessionId: "session123",
      sourceToken: "token123",
      event: eventData,
    });

    expect(makeRequestSpy).toHaveBeenCalled();
    const callArgs = makeRequestSpy.mock.calls[0][0];
    expect(callArgs.body.eventTime).toBeDefined();
    expect(callArgs.body.type).toBe("TEST_EVENT");
  });

  test("should send event with provided eventTime", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");
    makeRequestSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const eventTime = 1234567890;
    const eventData = {
      type: "TEST_EVENT",
      eventTime,
      data: { test: "value" }
    };

    await composer.event({
      sessionId: "session123",
      event: eventData,
    });

    expect(makeRequestSpy).toHaveBeenCalled();
    const callArgs = makeRequestSpy.mock.calls[0][0];
    expect(callArgs.body.eventTime).toBe(eventTime);
  });

  test("should not send event when SDK is disabled", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");
    const disabledComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: false,
    });

    await disabledComposer.event({
      sessionId: "session123",
      event: { type: "TEST_EVENT", data: {} },
    });

    expect(makeRequestSpy).not.toHaveBeenCalled();
  });

  test("should send event when isEnabled is undefined", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");
    makeRequestSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const composerWithUndefined = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: undefined,
    });

    await composerWithUndefined.event({
      sessionId: "session123",
      event: { type: "TEST_EVENT", data: {} },
    });

    expect(makeRequestSpy).toHaveBeenCalled();
  });

  test("should still require an event when SDK is disabled", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    const disabledComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: false,
    });

    await disabledComposer.event({ event: null as any } as ITrackOptions);
    expect(errorSpy).toHaveBeenCalledWith("Composer event was not sent: no event was provided");
  });

  test("should still require an event type when SDK is disabled", async () => {
    const errorSpy = vi.spyOn(Logger, "error");
    const disabledComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: false,
    });

    await disabledComposer.event({ event: { data: {} } as any } as ITrackOptions);
    expect(errorSpy).toHaveBeenCalledWith("Composer event was not sent: event.type is missing");
  });

  test("should accept a sourceToken without a sessionId when the SDK is disabled", async () => {
    const makeRequestSpy = vi.spyOn(utilities, "makeRequest");
    const disabledComposer = new Composer("test-secret-key", {
      apiVersion: ComposerApiVersion.v1,
      isEnabled: false,
    });

    await disabledComposer.event({
      sourceToken: "token123",
      event: { type: "TEST_EVENT", data: {} },
    });
    expect(makeRequestSpy).not.toHaveBeenCalled();
  });
});

describe("createErrorResponse", () => {
  let composer: Composer;

  beforeAll(() => {
    composer = new Composer("test-secret-key");
  });

  test("should create a properly formatted error response", () => {
    const errorResponse = composer.createErrorResponse(500, "Test error message");

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.errors).toHaveLength(1);
    expect(errorResponse.errors[0].code).toBe(500);
    expect(errorResponse.errors[0].message).toBe("Test error message");
    expect(errorResponse.version).toBe(ComposerApiVersion.v1);
    expect(errorResponse.verification?.status).toBe(VerificationStatus.FAILED);
    expect(errorResponse.verification?.outcome).toBe(VerificationOutcome.ERROR);
  });
});
