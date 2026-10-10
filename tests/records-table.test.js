import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordsLoader, renderRecordBatch } from '../shared/records-table.js';

// Minimal table fixture for checking batches, row indices, and sentinel behavior.
const tableBody = () => ({
  rows: [],
  set innerHTML(html) { this.rows = [...html.matchAll(/<tr>.*?<\/tr>/g)].map(([html]) => ({ html })); },
  querySelectorAll() { return this.rows; },
  appendChild(row) { this.rows.push(row); },
  ownerDocument: { createElement: () => tableBody() },
});

test('batches preserve existing rows and distinguish record indices from animation indices', () => {
  const body = tableBody();
  const sentinel = { style: {} };
  const bound = [];
  const options = {
    body, sentinel, rows: Array.from({ length: 55 }, (_, i) => i), batchSize: 50,
    buildRow: (row, index, animationIndex) => `<tr>${row}:${index}:${animationIndex}</tr>`,
    applyColumnVisibility() {}, bindRowEvents: (rows) => bound.push(rows.length),
  };
  assert.equal(renderRecordBatch(options), 50);
  assert.equal(sentinel.style.display, 'flex');
  const firstRow = body.rows[0];
  assert.equal(renderRecordBatch({ ...options, from: 50, append: true }), 55);
  assert.equal(body.rows[0], firstRow);
  assert.equal(body.rows[50].html, '<tr>50:50:0</tr>');
  assert.equal(sentinel.style.display, 'none');
  assert.deepEqual(bound, [50, 5]);
  renderRecordBatch({ ...options, rows: [] });
  assert.equal(body.rows.length, 1);
  assert.match(body.rows[0].html, /No records match/);
  assert.equal(sentinel.style.display, 'none');
});

test('overlapping reloads fetch once and stay locked until post-load work completes', async () => {
  let finishFetch;
  let finishLoaded;
  let fetches = 0;
  const started = [];
  const loaded = [];
  const loader = createRecordsLoader({
    onStart: (reset) => started.push(reset),
    fetchRecords: () => { fetches++; return new Promise((resolve) => { finishFetch = resolve; }); },
    onLoaded: (rows) => { loaded.push(rows); return new Promise((resolve) => { finishLoaded = resolve; }); },
    onError: (error) => { throw error; },
  });
  const pending = loader.load(true);
  await loader.load(true);
  assert.equal(fetches, 1);
  assert.equal(loader.loading, true);
  finishFetch({ data: [{ id: 1 }], error: null });
  await Promise.resolve();
  assert.equal(loader.loading, true);
  assert.deepEqual(loaded, [[{ id: 1 }]]);
  finishLoaded();
  await pending;
  assert.equal(loader.loading, false);
  assert.deepEqual(started, [true]);
});

test('failed requests release the lock and allow retry', async () => {
  const errors = [];
  let attempts = 0;
  const loaded = [];
  const loader = createRecordsLoader({
    onStart() {},
    fetchRecords: async () => ++attempts === 1 ? { error: new Error('offline') } : { data: null },
    onLoaded: (rows) => loaded.push(rows),
    onError: (error) => errors.push(error.message),
  });
  await loader.load(true);
  assert.equal(loader.loading, false);
  await loader.load(true);
  assert.deepEqual(errors, ['offline']);
  assert.deepEqual(loaded, [[]]);
});
