// Playwright messages can include page text, request headers and URLs.
// Inspect them privately and report fixed labels only.
export function browserFailureFacts(error) {
  const message=typeof error?.message==='string'?error.message:'';
  const operations=['locator.click','locator.waitFor','locator.count','locator.isDisabled','page.waitForEvent','page.waitForResponse','page.waitForFunction','page.goto','page.evaluate','apiRequestContext.get'];
  return {
    type:['TimeoutError','AssertionError','TypeError'].includes(error?.name)?error.name:'BrowserError',
    operation:operations.find(operation=>message.startsWith(`${operation}:`))??'unknown',
    contextDestroyed:/Execution context was destroyed|Cannot find context with specified id/.test(message),
    targetClosed:/Target page, context or browser has been closed|Target closed/.test(message),
    navigationInterrupted:/interrupted by another navigation|Navigation .* interrupted/.test(message),
    strictLocator:/strict mode violation/.test(message),
    networkFailure:/net::ERR_|NS_ERROR_/.test(message),
  };
}
