# Spreedly Composer Server SDK for NodeJS

## Table of Contents

- [Purpose](#purpose)
- [Prerequisites](#prerequisites)
- [Related](#related)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Development](#development)
- [License](#license)
- [Support](#support)

## Purpose

[Spreedly Composer](https://developer.spreedly.com) enables developers to decouple security logic from their application code. This has several benefits including:

- The ability to toggle and compare security services like fraud engines, MFA, KYC, and bot prevention.
- Faster responses to new attacks. When threats evolve and new vulnerabilities are identified, your application's security logic can be updated without changing a single line of code.
- The ability to put in placeholders for future security improvements while focusing on product development.
- A way to visualize all application security logic in one place.

The Composer Server SDK for NodeJS makes integration with the Composer API easy and is maintained by the Spreedly team.

## Prerequisites

- Node.js 22 or higher
- You will need to obtain an API key for your application from the Composer developer center.

## Related

Check out the [Client SDK](https://npmjs.com/package/@dodgeball/trust-sdk-client) for how to integrate Composer into your frontend applications.

[Composer examples](https://github.com/spreedly/composer-examples) has a runnable example server for this SDK in `server/node-ts`, and a web client that calls it.

## Installation

Use `npm` to install the Composer module:

```sh
npm install @spreedly/composer-sdk-server
```

Alternatively, using `yarn`:

```sh
yarn add @spreedly/composer-sdk-server
```

## Usage

This example protects an order endpoint end to end. Your API calls a checkpoint before placing the order. When the workflow needs more input from the user, such as MFA, your frontend gathers it with the Client SDK and calls your API again with the verification ID. See [Identifiers](#identifiers) for what each ID is and [useVerification](#useverification) for how the second call works.

```ts
// In your API
import { Composer } from '@spreedly/composer-sdk-server';
import express from 'express';
import { isIP } from 'net';

const app = express();
app.use(express.json());
// const composer = new Dodgeball(process.env.DODGEBALL_SECRET_KEY); // The prior name is still supported.
const composer = new Composer(process.env.SPREEDLY_SECRET_KEY);

// Client IP for the risk engine. Callers must not choose this value.
// Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
// Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
// Set TRUSTED_PROXY_COUNT only if your app runs behind trusted reverse proxies.
const getIp = (req) => {
  const hops = Number(process.env.TRUSTED_PROXY_COUNT ?? '0');
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count');
  }

  const header = req.headers['x-forwarded-for'];
  const parts = (Array.isArray(header) ? header.join(',') : (header ?? '')).split(',').map((part) => part.trim());
  const candidate =
    hops === 0 ? req.socket.remoteAddress : hops <= parts.length ? parts[parts.length - hops] : undefined;
  if (!candidate || !isIP(candidate)) {
    throw new Error('Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT');
  }
  return candidate;
};

app.post('/api/orders', async (req, res) => {
  const checkpointResponse = await composer.checkpoint({
    checkpointName: 'PLACE_ORDER',
    event: {
      ip: getIp(req),
      data: {
        order: req.body.order
      }
    },
    sourceToken: req.headers['x-dodgeball-source-token'],
    sessionId: req.session.id,
    userId: req.session.userId,
    useVerificationId: req.headers['x-dodgeball-verification-id']
  });

  if (composer.isAllowed(checkpointResponse)) {
    const placedOrder = await database.createOrder(req.body.order);
    return res.status(200).json({ order: placedOrder });
  } else if (composer.isDenied(checkpointResponse)) {
    // Return the verification so the frontend can show the reason
    return res.status(403).json({ verification: checkpointResponse.verification });
  } else if (composer.isRunning(checkpointResponse)) {
    // The workflow needs more input from the user (such as MFA or KYC)
    return res.status(202).json({ verification: checkpointResponse.verification });
  } else {
    // No verdict: decide whether to return the error, proceed, retry, or reject. See Errors.
    return res.status(500).json({ message: checkpointResponse.errors });
  }
});

app.listen(process.env.APP_PORT, () => {
  console.log(`Listening on port ${process.env.APP_PORT}`);
});
```

```js
// In your frontend, with the Client SDK
const placeOrder = async (order, previousVerificationId = null) => {
  const sourceToken = await dodgeball.getSourceToken();

  const endpointResponse = await axios.post("/api/orders", { order }, {
    headers: {
      "x-dodgeball-source-token": sourceToken,
      "x-dodgeball-verification-id": previousVerificationId
    },
    // Let the 202 and 403 responses through instead of throwing
    validateStatus: (status) => [200, 202, 403].includes(status)
  });

  if (endpointResponse.status === 200) {
    setIsOrderPlaced(true);
    return;
  }

  dodgeball.handleVerification(endpointResponse.data.verification, {
    onVerified: async (verification) => {
      // The user completed the extra step: call your API again with the verification ID
      await placeOrder(order, verification.id);
    },
    onApproved: async () => {
      setIsOrderPlaced(true);
    },
    onDenied: async (verification) => {
      setIsOrderDenied(true);
    },
    onError: async (error) => {
      setError(error);
      setIsPlacingOrder(false);
    }
  });
}
```

## API

### Configuration

---

The package requires a secret API key as the first argument to the constructor.

```js
const composer = new Composer("secret-api-key...");
```

Optionally, you can pass in several configuration options to the constructor:

```js
const composer = new Composer("secret-api-key...", {
  // Optional configuration
  apiVersion: "v1",
  apiUrl: "https://api.dodgeballhq.com",
  logLevel: "ERROR"
});
```

| Option | Default | Description |
| --- | --- | --- |
| `apiVersion` | `v1` | The Composer API version to use. |
| `apiUrl` | `https://api.dodgeballhq.com` | The base URL of the Spreedly Composer API. Useful for sending requests to different environments such as `https://api.sandbox.dodgeballhq.com`. |
| `logLevel` | `INFO` | `TRACE`, `INFO`, `ERROR` or `NONE`. The SDK logs errors, plus redacted request and response payloads at `TRACE`, so `INFO` and `ERROR` currently log the same thing. See [Safe logging](#safe-logging). |
| `requestTimeoutMs` | `30000` | How long a single HTTP request may take, in milliseconds. Applies to every call the SDK makes. See [Timeouts](#timeouts). |
| `isEnabled` | `true` | When `false`, the SDK makes no API calls: `checkpoint` returns an approved response and `event` returns without sending anything. |

### Safe logging

---

At the default `INFO` level the SDK writes no request or response payloads: a successful checkpoint logs nothing, and `ERROR` reports request failures. Payload logging is opt-in through `TRACE`, and even there the fields that describe your end users or carry provider credentials (`ip`, `data`, `stepData` and `nextSteps`) are replaced with `[REDACTED]`, so a verbose log shows the shape of a request or response without carrying PII. Turn `TRACE` on only in environments where you are comfortable with that extra detail.

### Identifiers

---

`checkpoint` and `event` both take these. Provide a `sessionId`, a `sourceToken`, or both.

| Parameter | Required | Description |
| --- | --- | --- |
| `sourceToken` | Either this or `sessionId` | A token representing the device making the request. Obtained from the [Client SDK](https://npmjs.com/package/@dodgeball/trust-sdk-client). |
| `sessionId` | Either this or `sourceToken` | The current session ID of the request. |
| `userId` | No | The ID of the user in your database, once you know it (for example, after registration). |
| `useVerificationId` | No | `checkpoint` only. The ID of a verification the user already completed. See [useVerification](#useverification). |

### Call a Checkpoint

---

Checkpoints represent key moments of risk in an application and are at the core of how Composer works. A checkpoint can represent any activity deemed to be a risk. Some common examples include: login, placing an order, redeeming a coupon, posting a review, changing bank account information, making a donation, transferring funds, creating a listing.

```js
const checkpointResponse = await composer.checkpoint({
  checkpointName: "CHECKPOINT_NAME",
  event: {
    ip: "127.0.0.1",
    data: {
      transaction: { amount: 100, currency: "USD" },
      paymentMethod: { token: "ghi789" }
    }
  },
  sessionId: "session_def456"
});
```

Along with the [identifiers](#identifiers), `checkpoint` takes:

| Parameter | Required | Description |
| --- | --- | --- |
| `checkpointName` | Yes | The name of the checkpoint to call. |
| `event` | Yes | The event to send to the checkpoint. |
| `event.ip` | No | The IP address of the device where the request originated. Recommended whenever an end user is present; leave it out for checkpoints with no user, such as renewals. |
| `event.data` | Yes | Data your checkpoint's workflow uses. Pass `{}` if there is none. |
| `options` | No | Checkpoint options, with the fields below. |
| `options.sync` | No | Defaults to `false`. See [Timeouts](#timeouts). |
| `options.timeout` | No | How long the SDK keeps polling an unresolved verification, in milliseconds. Defaults to 10 minutes. See [Timeouts](#timeouts). |

### Timeouts

---

Two settings control timing and neither one caps the other. `requestTimeoutMs` limits how long a single HTTP request may take, and applies to every call the SDK makes. The `timeout` in checkpoint options limits how long the SDK keeps polling for an unresolved verification, and defaults to 10 minutes. The SDK always polls at least once.

```js
const composer = new Composer("secret-api-key...", {
  requestTimeoutMs: 5000 // No single HTTP call may hang longer than 5 seconds
});

const checkpointResponse = await composer.checkpoint({
  checkpointName: "CHECKPOINT_NAME",
  event: { ip: "127.0.0.1", data: {} },
  sessionId: "session_def456",
  options: {
    timeout: 10000 // Stop polling after 10 seconds and return whatever we have
  }
});
```

This example uses the default `sync: false`, which we recommend. The first request returns right away with a pending verification, and the SDK polls until it resolves, so each request is short and `requestTimeoutMs` only guards against a hung connection. With `sync: true`, the first request waits on the server until the workflow finishes, so `requestTimeoutMs` must be longer than your slowest workflow. Otherwise a slow but healthy checkpoint comes back as a failure.

When the polling budget runs out, the verification is simply still pending, which is not an error: `isRunning` returns `true`, and you can resume later by passing the verification ID to `useVerificationId`. The exception is when the last poll before the budget ran out failed: you get that failure instead, with `success` `false`, and `hasError` returns `true`.

### Checkpoint Responses

---

Calling a checkpoint creates a verification in Composer. Its `status` and `outcome` determine how your application should proceed. Use the [utility methods](#utility-methods) rather than reading these fields directly.

```ts
const checkpointResponse = {
  success: boolean,
  errors: [
    {
      code: number,
      message: string
    }
  ],
  version: string,
  verification: {
    id: string,
    status: string,
    outcome: string,
    stepData: object,
    nextSteps: object[]
  }
};
```

#### Response fields

| Property | Description |
| --- | --- |
| `success` | `false` when no verification result could be produced. See [Errors](#errors). A verification that failed while running still has `success: true`. |
| `errors` | Error objects with a `message`, and a `code` when there is one. Usually empty when `success` is `true`. |
| `version` | The version of the Composer API that was used to make the request. |
| `verification` | The verification. Can be `undefined` when `success` is `false`. |
| `verification.id` | The ID of the verification that was created. |
| `verification.status` | `COMPLETE`, `PENDING`, `BLOCKED` or `FAILED`. |
| `verification.outcome` | `APPROVED`, `DENIED`, `PENDING`, `ERROR`, `USAGE_LIMIT` or `API_LIMIT`. |
| `verification.stepData` | Data from the workflow's steps. |
| `verification.nextSteps` | Steps the Client SDK runs next, such as MFA. Return the verification to your frontend unchanged so the Client SDK can start them right away. |

#### Statuses and outcomes

| `status` | `outcome` | Utility method | Meaning |
| --- | --- | --- | --- |
| `COMPLETE` | `APPROVED` | `isAllowed` | Let the request proceed. |
| `COMPLETE` | `DENIED` | `isDenied` | Deny the request. Return the verification to the frontend to show the reason. |
| `BLOCKED` | `PENDING` | `isRunning` | The workflow is waiting for input from the user, such as MFA or KYC. See [useVerification](#useverification). |
| `PENDING` | `PENDING` | `isRunning` | Still processing when the polling budget ran out. Resume later with `useVerificationId`. |
| `COMPLETE` | `PENDING` | `isUndecided` | The workflow finished without reaching a verdict. Your application decides how to proceed. |
| `FAILED` | `ERROR` | `hasError` | The workflow failed while running, for example a third-party service was unavailable. |
| `FAILED` | `USAGE_LIMIT` | `hasError` | Your account reached its usage limit. |
| `FAILED` | `API_LIMIT` | `hasError` | Your account is sending too many requests right now, or is deactivated. |

### Utility Methods

---

Each method takes a checkpoint response and returns a boolean.

| Method | Returns `true` when |
| --- | --- |
| `composer.isAllowed(checkpointResponse)` | The request is allowed to proceed. |
| `composer.isDenied(checkpointResponse)` | The request is denied. |
| `composer.isRunning(checkpointResponse)` | No verdict yet: the workflow is still processing or waiting on the user. |
| `composer.isUndecided(checkpointResponse)` | The workflow finished without a verdict. |
| `composer.hasError(checkpointResponse)` | `success` is `false`, or the workflow failed while running. |
| `composer.isTimeout(checkpointResponse)` | Polling stopped after 3 failed polls in a row. Running out of the polling `timeout` is not a timeout in this sense; see [Timeouts](#timeouts). |

### Errors

---

Only invalid input throws. Everything else comes back as a response, so a checkpoint never throws because of the network or the API.

| What happened | Throws? | What you get | Utility method |
| --- | --- | --- | --- |
| Missing secret key, or an invalid `apiVersion` or `logLevel` | Yes, from the constructor: `ComposerMissingConfigError` or `ComposerInvalidConfigError` | | |
| Missing `checkpointName` or `event`, or neither `sessionId` nor `sourceToken` | Yes, from `checkpoint`: `ComposerMissingParameterError` | | |
| The API rejected the request, for example there is no published workflow for the checkpoint name, or a usage or API limit was reached | No | `success: false`, the API's message in `errors` | `hasError` |
| Network error, request timeout, or a response the SDK can't read | No | `success: false`, a `500` in `errors` | `hasError` |
| 3 polls failed in a row | No | `success: false`, a `503` in `errors` | `hasError`, `isTimeout` |
| The workflow failed while running | No | `success: true`, status `FAILED`, outcome `ERROR` | `hasError` |
| Invalid input to `event` | Never | Nothing; the SDK logs it (see [Track an Event](#track-an-event)) | |

When `success` is `false` there is no verdict at all. Don't treat it as a denial; decide whether to retry, proceed, or reject.

### useVerification

---

Sometimes the workflow needs more input from the user before it can reach a verdict. For example, if the user must complete MFA, the checkpoint response has `status` `BLOCKED` and `outcome` `PENDING`, and `isRunning` returns `true`. Return the verification to your frontend and pass it to the Client SDK's `handleVerification()` method, which gathers the input from the user. When the user is done, the frontend calls your API again with the verification ID, and your API passes it to `useVerificationId`. The checkpoint then uses that verification instead of creating a new one, so the user isn't asked twice. The [Usage](#usage) example shows the full flow.

**Important Note:** To prevent replay attacks, each verification ID can only be passed to `useVerificationId` once.

### Track an Event

---

You can track additional information about a user's journey by submitting tracking events from your server. This information will be added to the user's profile and is made available to checkpoints.

```js
await composer.event({
  event: {
    type: "ADD_TO_CART",
    data: {
      product: { id: "sku_123", quantity: 1 }
    }
  },
  sessionId: "session_def456"
});
```

Along with the [identifiers](#identifiers), `event` takes:

| Parameter | Required | Description |
| --- | --- | --- |
| `event` | Yes | The event to track. |
| `event.type` | Yes | A name for where the user is in their journey. Can be any non-blank string you choose. |
| `event.data` | Yes | Data to track. Pass `{}` if there is none. |
| `event.eventTime` | No | When the event happened, in milliseconds since the epoch. Defaults to now. |

`event` doesn't throw for invalid input and returns nothing, so tracking can't break your request. Problems are logged at `ERROR` instead:

- If `event` or `event.type` is missing, or neither `sessionId` nor `sourceToken` is provided, the event is not sent and the SDK logs `Composer event was not sent: <reason>`.
- If the API rejects the event, the SDK logs `Composer event was not accepted by the API (HTTP <status>).`
- If the request fails (network error or timeout), the SDK logs `There was an error making a request.`

## Development

### Versioning

The SDK version is declared in two places that must be kept in sync when releasing:

- `package.json` (`version`)
- `src/version.ts` (`VERSION`, sent in the `Composer-SDK-Version` header)

Update both when bumping the version.

### Testing

The project uses Vitest for testing. Tests run against the TypeScript source in `src/`, which Vitest transforms on the fly.

To run tests:

```sh
npm test
```

To run tests with coverage:

```sh
npm run test:cov
```

The test script automatically builds the project before running tests. If you need to build manually:

```sh
npm run build
```

### Testing with the examples

To try local SDK changes end to end, clone [Composer examples](https://github.com/spreedly/composer-examples) next to this repository, point the `server/node-ts` example at your checkout in its `package.json`, and run it as the examples README describes:

```json
"@spreedly/composer-sdk-server": "file:../../../composer-sdk-server-node"
```

The example uses the built `dist/` output, so run `npm run build` here after each change.

## License

Apache License 2.0 -- see [LICENSE](LICENSE)

## Support

For support, please contact:

- Email: support@spreedly.com
- Documentation: https://developer.spreedly.com
