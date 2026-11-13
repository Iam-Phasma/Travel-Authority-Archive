import test from 'node:test';
import assert from 'node:assert/strict';
import { createInsightsLayout } from '../dashboard/insights-layout.js';

test('official count card height follows the two insight cards and does not measure the agenda', (t) => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const style = {};
  const leftCards = [
    { getBoundingClientRect: () => ({ height: 280 }) },
    { getBoundingClientRect: () => ({ height: 320 }) },
  ];
  const leftColumn = {
    querySelectorAll: () => leftCards,
    getBoundingClientRect: () => ({ height: 900 }),
  };
  const officialsListWrap = { style: {} };
  const officialsCard = {
    style,
    querySelector: (selector) => selector === ".os-list-wrap" ? officialsListWrap : { getBoundingClientRect: () => ({ height: 40 }) },
    getBoundingClientRect: () => ({ height: 920 }),
  };
  const pane = { classList: { contains: (name) => name === "active" } };
  const root = {
    querySelector: (selector) => ({
      ".insights-left-col": leftColumn,
      ".insight-card-os": officialsCard,
      "#tab-insights": pane,
    })[selector] || null,
  };
  globalThis.window = {
    requestAnimationFrame: (callback) => callback(),
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (element) => element === leftColumn ? { rowGap: "20px", gap: "20px" } : { paddingTop: "24px", paddingBottom: "24px" },
  };
  globalThis.document = { querySelector: () => null, getElementById: () => null };
  t.after(() => { globalThis.window = oldWindow; globalThis.document = oldDocument; });
  const layout = createInsightsLayout({
    queueAgendaCalendarLayoutSync() {}, syncAllSegmentedControls() {}, root,
  });
  layout.queueInsightsLayoutSync();
  assert.equal(style.height, "620px");
  assert.equal(officialsListWrap.style.height, "520px");
});

test('resize scheduling coordinates Agenda and cancels superseded settle timers', (t) => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const frames = [];
  const timers = [];
  const cleared = [];
  let agendaSyncs = 0;
  let controlSyncs = 0;
  globalThis.window = {
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: (id) => cleared.push(id),
  };
  globalThis.document = { querySelector: () => null, getElementById: () => null };
  t.after(() => { globalThis.window = oldWindow; globalThis.document = oldDocument; });
  const layout = createInsightsLayout({
    queueAgendaCalendarLayoutSync: () => agendaSyncs++,
    syncAllSegmentedControls: () => controlSyncs++,
  });
  layout.scheduleInsightsLayoutSync();
  layout.scheduleInsightsLayoutSync();
  assert.equal(frames.length, 1);
  assert.deepEqual(cleared, [1, 2]);
  assert.deepEqual(timers.map(({ delay }) => delay), [180, 420, 180, 420]);
  frames[0]();
  timers[2].callback();
  assert.equal(frames.length, 2);
  assert.equal(agendaSyncs, 3);
  assert.equal(controlSyncs, 3);
  layout.initInsightsLayoutSync(); // Missing card safely skips observer setup.
});
