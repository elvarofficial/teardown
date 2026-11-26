import assert from 'node:assert/strict';
import test from 'node:test';

// a batch worker runs the page's whole script, and like Node it has no document or matchMedia
test('the page script loads where there is no DOM', async () => {
  assert.equal(typeof globalThis.matchMedia, 'undefined');
  await import('./live.js');
});
