import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserFailureFacts, browserNetworkCode } from '../scripts/browser-failure-diagnostics.mjs';

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

test('network codes retain known browser errors and never echo arbitrary text',()=>{
  for(const code of ['ERR_UNSAFE_PORT','ERR_CONNECTION_REFUSED','ERR_ABORTED','ERR_EMPTY_RESPONSE','ERR_TOO_MANY_RETRIES']) {
    assert.equal(browserNetworkCode(`page.goto: net::${code} at http://private-host/private-token`),code);
    assert.equal(browserNetworkCode(`net::${code}`),code);
  }
  assert.equal(browserNetworkCode('net::ERR_PRIVATE_PASSWORD'),'OTHER_NETWORK_ERROR');
  assert.equal(browserNetworkCode('NS_ERROR_PRIVATE_TOKEN'),'OTHER_NETWORK_ERROR');
  assert.equal(browserNetworkCode('private-token'),null);
  assert.equal(browserNetworkCode(null),null);
});


test('assertion facts expose only finite numbers and booleans, never records or strings',()=>{
  const facts=browserFailureFacts({name:'AssertionError',actual:false,expected:true});
  assert.equal(facts.assertionActual,false);assert.equal(facts.assertionExpected,true);
  assert.equal(browserFailureFacts({actual:3,expected:2}).assertionActual,3);
  const privateFacts=browserFailureFacts({actual:{token:'private'},expected:'private-password'});
  assert.equal(privateFacts.assertionActual,null);assert.equal(privateFacts.assertionExpected,null);
  assert.equal(browserFailureFacts({actual:Infinity,expected:NaN}).assertionActual,null);
  assert.equal(JSON.stringify(privateFacts).includes('private'),false);
});
