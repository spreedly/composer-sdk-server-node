import { DEFAULT_REQUEST_TIMEOUT_MS } from "./constants";
import { Logger } from "./logger";
import { VERSION } from "./version";

type Method = "GET" | "POST" | "PUT" | "DELETE";
interface IRequestParams {
  url: string;
  method: Method;
  headers: any;
  body?: any;
  options?: any;
  requestTimeoutMs?: number;
}

// Fields that carry end-user information and are masked before anything is logged.
// nextSteps is included because a blocked checkpoint returns integration config
// (including provider client secrets) alongside the full client integration bundle.
const SENSITIVE_FIELDS = ["ip", "data", "stepData", "nextSteps"];
const REDACTED = "[REDACTED]";

// Returns a copy of a payload with end-user fields masked, so verbose logs show
// the shape of a request or response without exposing PII
export const redactSensitiveFields = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const redacted: { [key: string]: any } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      redacted[key] = REDACTED;
    } else {
      redacted[key] = redactSensitiveFields(entry);
    }
  }

  return redacted;
};

// function to wrap fetch requests
export const makeRequest = async ({
  url,
  method,
  headers,
  body,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}: IRequestParams): Promise<Response> => {
  // Built before fetch because its validation error includes the rejected header value,
  // which can be the secret key, so that error must not reach the log.
  let requestHeaders: Headers;
  try {
    requestHeaders = new Headers(headers);
  } catch {
    Logger.error("A request header has a character that can't be sent, such as a newline.").log();
    return requestFailedResponse();
  }

  try {
    const hasBody = body !== undefined && body !== null;
    if (hasBody && Logger.isTraceEnabled()) {
      Logger.trace(
        `Request body: ${JSON.stringify(redactSensitiveFields(body))}`
      ).log();
    }
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    return response;
  } catch (error) {
    Logger.error("There was an error making a request.", error).log();
    // return error;
    return requestFailedResponse();
  }
};

const requestFailedResponse = () =>
  new RequestFailedResponse(JSON.stringify({ success: false, errors: [{ code: 500, message: "Internal Server Error" }] }), { status: 500 });

// Stand-in 500 returned when a request never got an HTTP response, so callers can tell it apart from a real one.
export class RequestFailedResponse extends Response {}

// function to construct an apiUrl with version appended to the end
export const constructApiUrl = (url: string, version: string) => {
  // ensure that the url ends with a '/'
  if (url.charAt(url.length - 1) !== "/") {
    url += "/";
  }

  return `${url}${version}/`;
};

// function to construct api request headers
export const constructApiHeaders = (
  token: string,
  verificationId = "",
  sourceToken = "",
  customerId = "",
  sessionId = ""
) => {
  let headers: { [key: string]: string } = {
    "Dodgeball-Secret-Key": `${token}`,
    "Composer-SDK-Version": VERSION,
    "Composer-SDK-Source": "node-sdk",
    "Content-Type": "application/json",
  };

  if (!isNullOrEmpty(verificationId)) {
    headers["Dodgeball-Verification-Id"] = `${verificationId}`;
  }

  if (sourceToken) {
    headers["Dodgeball-Source-Token"] = sourceToken;
  }

  if (customerId) {
    headers["Dodgeball-Customer-Id"] = customerId;
  }

  if (sessionId) {
    headers["Dodgeball-Session-Id"] = sessionId;
  }

  return headers;
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const isNullOrEmpty = (value: any) => {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value === "string" && value.toLowerCase() === "null") ||
    (typeof value === "string" && value.toLowerCase() === "undefined")
  );
}
