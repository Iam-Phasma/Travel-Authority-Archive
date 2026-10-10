import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgendaTracker } from '../dashboard/agenda.js';

test('tab switching can schedule Agenda layout without a missing callback', (t) => {
  const oldWindow = globalThis.window;
  const frames = [];
  const delays = [];
  globalThis.window = {
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    setTimeout: (_callback, delay) => { delays.push(delay); return delays.length; },
    clearTimeout() {},
  };
  t.after(() => { globalThis.window = oldWindow; });
  const agenda = createAgendaTracker({
    getRecords: () => [], openViewModalForRecord() {}, queueInsightsLayoutSync() {},
  });
  agenda.renderAgendaTracker();
  agenda.scheduleAgendaCalendarLayoutSync();
  assert.equal(frames.length, 1);
  assert.deepEqual(delays, [180, 420]);
});
