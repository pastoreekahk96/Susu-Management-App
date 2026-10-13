import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserFailureFacts } from '../scripts/browser-failure-diagnostics.mjs';

test('browser failures expose operation and fixed flags without underlying page or request data',()=>{
  const privateText='susu_session=private-token postgresql://private-password private-member';
  for (const [message,flag] of [
    ['page.evaluate: Execution context was destroyed','contextDestroyed'],
    ['locator.click: Target page, context or browser has been closed','targetClosed'],
    ['page.goto: interrupted by another navigation','navigationInterrupted'],
    ['locator.count: strict mode violation','strictLocator'],
    ['page.goto: net::ERR_CONNECTION_REFUSED','networkFailure'],
  ]) {
    const facts=browserFailureFacts({name:'Error',message:`${message} ${privateText}`});
    assert.equal(facts[flag],true);
    assert.equal(facts.operation,message.split(':')[0]);
    assert.equal(JSON.stringify(facts).includes('private'),false);
  }
  assert.equal(browserFailureFacts({name:privateText,message:privateText}).type,'BrowserError');
  assert.equal(browserFailureFacts(null).operation,'unknown');
});
