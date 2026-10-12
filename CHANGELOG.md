# Changelog

## 1.0.0 (unreleased)

First release as `@spreedly/composer-sdk-server`. If you're upgrading from `@dodgeball/trust-sdk-server`, read **Changed** and **Removed**.

### Added
- `requestTimeoutMs` config option: a timeout for each HTTP request, default 30000 ms. Raise it if you use `sync: true` with workflows that run longer than 30 seconds.
- `USAGE_LIMIT` and `API_LIMIT` outcomes. Both come back with `success: false` and status `FAILED`, so `hasError()` is `true`.
- `event()` logs an error when an event isn't sent or the API doesn't accept it.
- At `TRACE`, `ip`, `data`, `stepData` and `nextSteps` are redacted in logged payloads.

### Changed
- The package is now `@spreedly/composer-sdk-server` and the main class is `Composer`. `Dodgeball`, `DodgeballLogLevel`, `DodgeballApiVersion` and `IDodgeballConfig` are still exported as aliases. `DodgeballLogLevel` and `DodgeballApiVersion` are no longer enums, so use `ComposerLogLevel` and `ComposerApiVersion` in type positions.
- Requires Node 22 or later.
- The license is Apache-2.0 (was ISC).
- Error classes are `ComposerMissingConfigError`, `ComposerInvalidConfigError` and `ComposerMissingParameterError`, and messages start with `Composer SDK Error`. Update any code that matches on message text.
- `options.sync` defaults to `false` (was `true`). Pass `sync: true` to keep the old behavior.
- `options.timeout` is now only how long the SDK polls, and defaults to 10 minutes. It's no longer sent to the API, and leaving it out no longer means polling forever.
- Polling backs off from 100 ms to a 2 second ceiling.
- A checkpoint gives up after 3 consecutive failed polls (was 3 failed polls in total) and returns a `503` with `isTimeout` set.
- A network error or request timeout returns `success: false` with a `500` in `errors`, so `hasError()` is `true`. It used to return the raw error object.
- The default `logLevel` is `INFO` (was `TRACE`).
- `event.ip` is optional in `checkpoint()`.
- `checkpoint()` throws `ComposerMissingParameterError` when `checkpointName` or `event` is missing, or when both `sessionId` and `sourceToken` are. Blank strings, `"null"` and `"undefined"` count as missing.
- `checkpoint()` sends only `ip` and `data` from `event`. Move any other properties into `event.data`.
- Only `isEnabled: false` disables the SDK. When disabled, `event()` sends nothing, and the placeholder verification ID is `COMPOSER_IS_DISABLED` (was `DODGEBALL_IS_DISABLED`).
- `event()` doesn't throw for invalid input or failed requests. It logs the problem and sends nothing.
- `isRunning()` requires the outcome to be `PENDING` as well as the status to be `PENDING` or `BLOCKED`.
- `hasError()` is `true` when `success` is `false` or the outcome is `ERROR`.

### Removed
- `options.webhook`. Remove it from your checkpoint options. `checkpoint()` polls a pending verification as before.
- The `axios` and `lodash.clonedeep` dependencies. The SDK uses the built-in `fetch`.

### Fixed
- The `types` entry in `package.json` points to `dist/types/index.d.ts`.
