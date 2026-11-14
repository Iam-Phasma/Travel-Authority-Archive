import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseSettingsSections } from '../shared/settings-modal.js';

test('closing settings collapses every open disclosure and leaves closed ones alone', () => {
  const sections = [{ open: true }, { open: false }, { open: true }];
  const modal = { querySelectorAll: (selector) => {
    assert.equal(selector, 'details[open]');
    return sections.filter((section) => section.open);
  } };

  collapseSettingsSections(modal);
  assert.deepEqual(sections.map(({ open }) => open), [false, false, false]);
});

test('settings disclosure reset safely skips a missing modal', () => {
  assert.doesNotThrow(() => collapseSettingsSections(null));
});
