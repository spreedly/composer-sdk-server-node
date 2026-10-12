import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Composer } from "../src/Composer";
import { DEFAULT_CONFIG } from "../src/constants";
import { ComposerLogLevel, Logger, Severity } from "../src/logger";
import { VerificationOutcome, VerificationStatus } from "../src/types";
import * as utilities from "../src/utilities";

// Regression coverage for the safe logging default: an integrator who passes no
// config must never see request bodies, response bodies or event.ip in their logs.
describe("default logging", () => {
  const eventIp = "203.0.113.7";
  const eventData = { email: "shopper@example.com" };

  let consoleSpy: any;

  function getCheckpointResponse(): Promise<Response> {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          verification: {
            id: "123",
            status: VerificationStatus.COMPLETE,
            outcome: VerificationOutcome.APPROVED,
            stepData: { customer: eventData },
          },
          success: true,
          errors: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
  }

  async function runCheckpoint(logLevel?: ComposerLogLevel): Promise<string> {
    const composer = new Composer("test-secret-key", logLevel ? { logLevel } : undefined);
    vi.spyOn(utilities, "makeRequest").mockReturnValue(getCheckpointResponse());
    consoleSpy.mockClear();

    await composer.checkpoint({
      checkpointName: "CHECKOUT",
      event: { ip: eventIp, data: eventData },
      sessionId: "session-id",
    });

    return consoleSpy.mock.calls.map((call: any[]) => call.join(" ")).join("\n");
  }

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("ships INFO as the default log level", () => {
    expect(DEFAULT_CONFIG.logLevel).toBe(ComposerLogLevel.INFO);
  });

  test("emits nothing for a checkpoint when no log level is configured", async () => {
    const output = await runCheckpoint();

    expect(Logger.filterLevel).toBe(Severity.INFO);
    expect(output).toBe("");
  });

  test("masks end-user fields anywhere in a payload", () => {
    const redacted: any = utilities.redactSensitiveFields({
      event: { type: "CHECKOUT", ip: eventIp, data: eventData },
      verification: { id: "123", stepData: { customer: eventData } },
    });

    expect(redacted.event.type).toBe("CHECKOUT");
    expect(redacted.event.ip).toBe("[REDACTED]");
    expect(redacted.event.data).toBe("[REDACTED]");
    expect(redacted.verification.id).toBe("123");
    expect(redacted.verification.stepData).toBe("[REDACTED]");
  });

  test("masks the nextSteps a blocked checkpoint returns", () => {
    const redacted: any = utilities.redactSensitiveFields({
      verification: {
        id: "123",
        status: VerificationStatus.BLOCKED,
        nextSteps: [
          {
            name: "STRIPE_IDENTITY",
            config: { clientSecret: "vs_secret_value" },
            content: { text: 'console.log("bundle");' },
          },
        ],
      },
    });

    expect(redacted.verification.status).toBe(VerificationStatus.BLOCKED);
    expect(redacted.verification.nextSteps).toBe("[REDACTED]");
    expect(JSON.stringify(redacted)).not.toContain("vs_secret_value");
  });

  test("reports trace as disabled at the default level", () => {
    Logger.filterLevel = Severity.INFO;
    expect(Logger.isTraceEnabled()).toBe(false);

    Logger.filterLevel = Severity.TRACE;
    expect(Logger.isTraceEnabled()).toBe(true);

    Logger.filterLevel = Severity.INFO;
  });

  test("logs redacted payloads when TRACE is opted into", async () => {
    const output = await runCheckpoint(ComposerLogLevel.TRACE);

    expect(output).toContain(VerificationStatus.COMPLETE);
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain(eventIp);
    expect(output).not.toContain(eventData.email);
  });
});
