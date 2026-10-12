/// <reference types="node" />
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { constructApiUrl, constructApiHeaders, isNullOrEmpty, makeRequest } from "../src/utilities";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../src/constants";
import { VERSION } from "../src/version";
import { Logger, Severity } from "../src/logger";
const version = require("../package.json").version;

async function startStallingServer(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer((_req, _res) => {
    // Accept the connection but never send a response.
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/hang`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("VERSION", () => {
  // VERSION is hand-maintained in src/version.ts because package.json is not
  // reliably readable at runtime from the published bundle. This guards against
  // the two sources drifting in either direction.
  test("should stay in sync with the version in package.json", () => {
    expect(VERSION).toEqual(version);
  });
});

describe("constructApiUrl", () => {
  test("should return a properly formatted url", () => {
    const url1 = constructApiUrl("https://api.dodgeballhq.com/", "v1");
    const url2 = constructApiUrl("https://api.dodgeballhq.com", "v1");

    expect(url1).toBe("https://api.dodgeballhq.com/v1/");
    expect(url2).toBe("https://api.dodgeballhq.com/v1/");
  });
});

describe("constructApiHeaders", () => {
  test("should return valid headers when only a token is supplied", () => {
    const headers = constructApiHeaders("test-secret-key");
    expect(headers['Dodgeball-Secret-Key']).toEqual("test-secret-key");
    expect(headers['Composer-SDK-Version']).toEqual(`${version}`);
    expect(headers['Composer-SDK-Source']).toEqual("node-sdk");
    expect(headers['Content-Type']).toEqual("application/json");
  });

  test("should return valid headers when a token and verification are supplied", () => {
    const headers = constructApiHeaders(
      "test-secret-key",
      "test-verification-id"
    );
    expect(headers['Dodgeball-Secret-Key']).toEqual("test-secret-key");
    expect(headers['Dodgeball-Verification-Id']).toEqual("test-verification-id");
    expect(headers['Composer-SDK-Version']).toEqual(`${version}`);
    expect(headers['Composer-SDK-Source']).toEqual("node-sdk");
    expect(headers['Content-Type']).toEqual("application/json");
  });

  test("should return valid headers when a token and source are supplied", () => {
    const headers = constructApiHeaders(
      "test-secret-key",
      "",
      "test-source-token"
    );
    expect(headers['Dodgeball-Secret-Key']).toEqual("test-secret-key");
    expect(headers['Dodgeball-Source-Token']).toEqual("test-source-token");
    expect(headers['Composer-SDK-Version']).toEqual(`${version}`);
    expect(headers['Composer-SDK-Source']).toEqual("node-sdk");
    expect(headers['Content-Type']).toEqual("application/json");
  });

  test("should return valid headers when a token and customer are supplied", () => {
    const headers = constructApiHeaders(
      "test-secret-key",
      "",
      "",
      "test-customer-id"
    );
    expect(headers['Dodgeball-Secret-Key']).toEqual("test-secret-key");
    expect(headers['Dodgeball-Customer-Id']).toEqual("test-customer-id");
    expect(headers['Composer-SDK-Version']).toEqual(`${version}`);
    expect(headers['Composer-SDK-Source']).toEqual("node-sdk");
    expect(headers['Content-Type']).toEqual("application/json");
  });

  test("should return valid headers when a token and a sessionId are supplied", () => {
    const headers = constructApiHeaders(
      "test-secret-key",
      "",
      "",
      "",
      "test-session-id"
    );
    expect(headers['Dodgeball-Secret-Key']).toEqual("test-secret-key");
    expect(headers['Dodgeball-Session-Id']).toEqual("test-session-id");
    expect(headers['Composer-SDK-Version']).toEqual(`${version}`);
    expect(headers['Composer-SDK-Source']).toEqual("node-sdk");
    expect(headers['Content-Type']).toEqual("application/json");
  });
});

describe("isNullOrEmpty", () => {
  test("should return true for null, undefined, empty string, 'null', and 'undefined'", () => {
    expect(isNullOrEmpty(null)).toBe(true);
    expect(isNullOrEmpty(undefined)).toBe(true);
    expect(isNullOrEmpty("")).toBe(true);
    expect(isNullOrEmpty("   ")).toBe(true);
    expect(isNullOrEmpty("null")).toBe(true);
    expect(isNullOrEmpty("undefined")).toBe(true);
  });

  test("should return false for non-empty strings and non-string values", () => {
    expect(isNullOrEmpty("hello")).toBe(false);
    expect(isNullOrEmpty(0)).toBe(false);
    expect(isNullOrEmpty(false)).toBe(false);
    expect(isNullOrEmpty({})).toBe(false);
    expect(isNullOrEmpty([])).toBe(false);
  });
});

describe("makeRequest", () => {
  const mockUrl = "https://api.example.com/test";
  const mockHeaders = { "Content-Type": "application/json" };
  const mockBody = { test: "data" };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("should handle fetch errors gracefully", async () => {
    // Mock fetch to throw an error
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const response = await makeRequest({
      url: mockUrl,
      method: "POST",
      headers: mockHeaders,
      body: mockBody,
    });

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.errors[0].code).toBe(500);
    expect(json.errors[0].message).toBe("Internal Server Error");
  });

  test("should keep an invalid header value out of the log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const filterLevel = Logger.filterLevel;
    Logger.filterLevel = Severity.ERROR;

    let response: Response;
    try {
      response = await makeRequest({
        url: "http://127.0.0.1:1",
        method: "POST",
        headers: { "Dodgeball-Secret-Key": "sk_test_FAKE\n123" },
        body: mockBody,
      });
    } finally {
      Logger.filterLevel = filterLevel;
    }

    const logged = logSpy.mock.calls.flat().join("\n");
    expect(logged).toContain("A request header has a character that can't be sent, such as a newline.");
    expect(logged).not.toContain("sk_test_FAKE");
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.errors[0].code).toBe(500);
  });

  test("should successfully make a request", async () => {
    const mockResponse = { success: true, data: "test" };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await makeRequest({
      url: mockUrl,
      method: "POST",
      headers: mockHeaders,
      body: mockBody,
    });

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toBe("test");
  });

  test("should pass an AbortSignal to fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    await makeRequest({
      url: mockUrl,
      method: "POST",
      headers: mockHeaders,
      body: mockBody,
      requestTimeoutMs: 5000,
    });

    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    fetchSpy.mockRestore();
  });

  test("should abort a stalling upstream within the caller override timeout", async () => {
    const { url, close } = await startStallingServer();

    try {
      const start = Date.now();
      const response = await makeRequest({
        url,
        method: "GET",
        headers: mockHeaders,
        requestTimeoutMs: 200,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(150);
      expect(elapsed).toBeLessThan(2000);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.errors[0].code).toBe(500);
      expect(json.errors[0].message).toBe("Internal Server Error");
    } finally {
      await close();
    }
  });

  test("should use the 30s default when no caller override is provided", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    await makeRequest({
      url: mockUrl,
      method: "GET",
      headers: mockHeaders,
    });

    expect(timeoutSpy).toHaveBeenCalledWith(DEFAULT_REQUEST_TIMEOUT_MS);

    fetchSpy.mockRestore();
    timeoutSpy.mockRestore();
  });

  test("should bound a stalling upstream when no caller override is provided", async () => {
    const { url, close } = await startStallingServer();
    // Shortened from the real 30s default so the test does not wait that long.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => realTimeout(200));

    try {
      const start = Date.now();
      const response = await makeRequest({
        url,
        method: "GET",
        headers: mockHeaders,
      });
      const elapsed = Date.now() - start;

      expect(timeoutSpy).toHaveBeenCalledWith(DEFAULT_REQUEST_TIMEOUT_MS);
      expect(elapsed).toBeLessThan(2000);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.errors[0].code).toBe(500);
    } finally {
      timeoutSpy.mockRestore();
      await close();
    }
  });
});
