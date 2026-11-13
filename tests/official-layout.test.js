import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkOfficialsByLines } from '../pdf-generator/official-layout.js';

test('wrap-heavy positions reduce the number of officials on the first page', () => {
  const officials = Array.from({ length: 23 }, (_, index) => ({
    name: `Official ${index + 1}`,
    lineCount: index < 2 ? 2 : 1,
  }));

  const chunks = chunkOfficialsByLines(officials, 20);

  assert.equal(chunks[0].length, 18);
  assert.equal(chunks[0].reduce((total, official) => total + official.lineCount, 0), 20);
  assert.equal(chunks[1][0].name, 'Official 19');
});

test('an official that needs more lines than one page is kept together', () => {
  const officials = [
    { name: 'Long position', lineCount: 25 },
    { name: 'Next official', lineCount: 1 },
  ];

  assert.deepEqual(chunkOfficialsByLines(officials, 20), [[officials[0]], [officials[1]]]);
});
