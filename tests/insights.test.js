import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecordsByYear, getInsightYears } from '../dashboard/insights.js';

test('the current calendar year is available and selected even without records', () => {
  assert.deepEqual(getInsightYears([{ travel_date: '2025-04-12' }], '2026'), ['2026', '2025']);
  assert.deepEqual(getInsightYears([], '2026'), ['2026']);
});

test('insight records are limited to the selected calendar year', () => {
  const filters = [];
  const query = {
    gte: (column, value) => { filters.push(['gte', column, value]); return query; },
    lte: (column, value) => { filters.push(['lte', column, value]); return query; },
  };

  assert.equal(filterRecordsByYear(query, '2026'), query);
  assert.deepEqual(filters, [
    ['gte', 'travel_date', '2026-01-01'],
    ['lte', 'travel_date', '2026-12-31'],
  ]);
});
