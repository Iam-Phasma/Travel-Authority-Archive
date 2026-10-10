import test from 'node:test';
import assert from 'node:assert/strict';
import { gzip } from 'pako';
import { createFileOpener, fetchFileSizeBytes } from '../shared/record-files.js';

test('file opening preserves regular links, reconstructs gzip, and falls back on failure', async (t) => {
  const tabs = [];
  const blobs = [];
  const messages = [];
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(URL, 'createObjectURL', (blob) => { blobs.push(blob); return 'blob:rebuilt'; });
  const oldWindow = globalThis.window;
  const oldElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class {};
  globalThis.window = { open: () => { const tab = { location: {}, closed: false }; tabs.push(tab); return tab; } };
  t.after(() => { globalThis.window = oldWindow; globalThis.HTMLElement = oldElement; });
  const open = createFileOpener({ showToast: (...args) => messages.push(args), notifyCompressed: true });
  await open('javascript:alert(1)');
  assert.equal(tabs.length, 0);
  await open('https://example.com/document.pdf');
  assert.equal(tabs[0].location.href, 'https://example.com/document.pdf');
  assert.equal(tabs[0].opener, null);
  t.mock.method(globalThis, 'fetch', async () => new Response(gzip('PDF contents')));
  await open('https://example.com/document.pdf.gz', 'document.pdf.gz');
  assert.equal(tabs[1].location.href, 'blob:rebuilt');
  assert.equal(blobs[0].type, 'application/pdf');
  assert.equal(await blobs[0].text(), 'PDF contents');
  globalThis.fetch = async () => new Response('', { status: 500 });
  await open('https://example.com/broken.pdf.gz');
  assert.equal(tabs[2].location.href, 'https://example.com/broken.pdf.gz');
  assert.ok(messages.some(([message]) => message.includes('Could not reconstruct')));
});

test('file-size lookup caches successful results and uses range totals when HEAD has no size', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(options);
    return options.method === 'HEAD'
      ? new Response(null)
      : new Response('x', { status: 206, headers: { 'Content-Range': 'bytes 0-0/4096' } });
  });
  assert.equal(await fetchFileSizeBytes('https://example.com/range-test.pdf'), 4096);
  assert.equal(await fetchFileSizeBytes('https://example.com/range-test.pdf'), 4096);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].headers.Range, 'bytes=0-0');
  assert.equal(await fetchFileSizeBytes('#'), null);
});
