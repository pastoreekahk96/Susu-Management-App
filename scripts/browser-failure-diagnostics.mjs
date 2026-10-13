// Playwright messages can include page text, request headers and URLs.
// Inspect them privately and report fixed labels only.
const networkCodes=new Set([
  'ERR_ABORTED','ERR_FAILED','ERR_UNSAFE_PORT','ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_RESET','ERR_CONNECTION_CLOSED','ERR_CONNECTION_ABORTED',
  'ERR_CONNECTION_TIMED_OUT','ERR_TIMED_OUT','ERR_EMPTY_RESPONSE',
  'ERR_NAME_NOT_RESOLVED','ERR_ADDRESS_UNREACHABLE','ERR_NETWORK_CHANGED',
  'ERR_INTERNET_DISCONNECTED','ERR_PROXY_CONNECTION_FAILED','ERR_TUNNEL_CONNECTION_FAILED',
  'ERR_BLOCKED_BY_CLIENT','ERR_BLOCKED_BY_RESPONSE','ERR_ACCESS_DENIED',
  'ERR_INSUFFICIENT_RESOURCES','ERR_HTTP_RESPONSE_CODE_FAILURE','ERR_TOO_MANY_RETRIES',
  'ERR_TOO_MANY_REDIRECTS','ERR_INVALID_URL','ERR_INVALID_ARGUMENT','ERR_INVALID_RESPONSE',
  'ERR_CONTENT_LENGTH_MISMATCH','ERR_HTTP2_PROTOCOL_ERROR','ERR_SSL_PROTOCOL_ERROR',
  'ERR_SOCKET_NOT_CONNECTED','ERR_CACHE_MISS','ERR_CACHE_READ_FAILURE','ERR_UNEXPECTED',
]);

export function browserNetworkCode(message) {
  if(typeof message!=='string')return null;
  const code=message.match(/\b(?:net::)?(ERR_[A-Z0-9_]+)\b/)?.[1];
  return networkCodes.has(code)?code:/net::ERR_|NS_ERROR_|\bERR_[A-Z0-9_]+\b/.test(message)?'OTHER_NETWORK_ERROR':null;
}

export function browserFailureFacts(error) {
  const message=typeof error?.message==='string'?error.message:'';
  const operations=['locator.click','locator.waitFor','locator.count','locator.isDisabled','page.waitForEvent','page.waitForResponse','page.waitForFunction','page.waitForLoadState','page.goto','page.evaluate','apiRequestContext.get'];
  return {
    type:['TimeoutError','AssertionError','TypeError'].includes(error?.name)?error.name:'BrowserError',
    operation:operations.find(operation=>message.startsWith(`${operation}:`))??'unknown',
    contextDestroyed:/Execution context was destroyed|Cannot find context with specified id/.test(message),
    targetClosed:/Target page, context or browser has been closed|Target closed/.test(message),
    navigationInterrupted:/interrupted by another navigation|Navigation .* interrupted/.test(message),
    strictLocator:/strict mode violation/.test(message),
    networkFailure:/net::ERR_|NS_ERROR_/.test(message),
    networkCode:browserNetworkCode(message),
  };
}
