// REQUEST_TIMEOUT: how long we wait for a request from a socket
export const REQUEST_TIMEOUT_MS = 3_000;

// RESPONSE_TIMEOUT: how long before Express gives up on the full response
export const RESPONSE_TIMEOUT_MS = 10_000;

// FETCH_TIMEOUT: how long to wait on an upstream image fetch.
// Must be well under RESPONSE_TIMEOUT_MS so that AbortSignal fires and
// sendError(404) completes before res.setTimeout sends a 504,
// preventing ERR_HTTP_HEADERS_SENT.
export const FETCH_TIMEOUT_MS = 5_000;

if (FETCH_TIMEOUT_MS >= RESPONSE_TIMEOUT_MS) {
  throw new Error(
    `Invalid timeout config: FETCH_TIMEOUT_MS (${FETCH_TIMEOUT_MS}) must be less than RESPONSE_TIMEOUT_MS (${RESPONSE_TIMEOUT_MS})`,
  );
}
