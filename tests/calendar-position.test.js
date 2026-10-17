import test from 'node:test';
import assert from 'node:assert/strict';
import { getCalendarPosition } from '../shared/calendar-position.js';

const viewport = { top: 0, left: 0, width: 900, height: 800 };
const calendar = { width: 344, height: 420 };

test('calendar flips above an input near the viewport bottom', () => {
    const position = getCalendarPosition({ top: 650, bottom: 694, left: 100 }, calendar, viewport);
    assert.equal(position.top, 225);
    assert.ok(position.top + calendar.height < 650);
});

test('calendar stays below when it fits and clamps the right edge', () => {
    assert.deepEqual(getCalendarPosition({ top: 100, bottom: 144, left: 800 }, calendar, viewport), {
        top: 149, left: 544,
    });
});

test('a taller month flips above after a shorter month fits below', () => {
    const anchor = { top: 390, bottom: 434, left: 100 };
    assert.equal(getCalendarPosition(anchor, { ...calendar, height: 340 }, viewport).top, 439);
    assert.equal(getCalendarPosition(anchor, calendar, viewport).top, 12);
});

test('calendar stays in a small or zoomed visual viewport when neither side fits', () => {
    const small = { top: 80, left: 30, width: 390, height: 300 };
    const position = getCalendarPosition({ top: 200, bottom: 244, left: 70 }, calendar, small);
    assert.equal(position.top, 92);
    assert.equal(position.left, 64);
});
