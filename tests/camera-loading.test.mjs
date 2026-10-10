import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApprovedCamera } from '../src/camera/ApprovedCamera.js';

test('one abort cancels both concurrent camera and bounds requests', async t => {
  const controller = new AbortController();
  const requests = [];
  t.mock.method(globalThis, 'fetch', (url, options = {}) => {
    requests.push({ url, signal: options.signal });
    return new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  });
  const loading = loadApprovedCamera({ signal: controller.signal });
  t.after(() => controller.abort());
  assert.deepEqual(requests.map(request => request.url), [
    './scene/camera-path.json', './scene/model-bounds.json'
  ]);
  assert.ok(requests.every(request => request.signal === controller.signal),
    'both requests must receive the initialization signal');
  controller.abort();
  await assert.rejects(loading, { name: 'AbortError' });
});
