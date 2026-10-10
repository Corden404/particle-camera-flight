import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VISUAL_DEFAULTS } from '../src/controls/visual-settings.js';

test('published scene uses the approved visual preset', () => {
  const entry = fs.readFileSync(new URL('../src/approved-main.js', import.meta.url), 'utf8');
  assert.match(entry, /const tuning = VISUAL_DEFAULTS;/);
  assert.deepEqual([VISUAL_DEFAULTS.modelBrightness, VISUAL_DEFAULTS.modelSize], [1.25, 0.6]);
  assert.doesNotMatch(entry, /createVisualControls|readVisualSettings|visualControls/);
});

test('published entry excludes the tuner panel, icon and keyboard shortcut', () => {
  const entry = fs.readFileSync(new URL('../src/approved-main.js', import.meta.url), 'utf8');
  const style = fs.readFileSync(new URL('../src/approved.css', import.meta.url), 'utf8');
  for (const marker of ["id='visual-button'", "id='visual-controls'", 'data-visual-groups', "event.key?.toLowerCase() === 'v'"]) {
    assert.ok(!entry.includes(marker), 'Unexpected visual tuner entry: ' + marker);
  }
  assert.ok(!style.includes('.approved-visual-toggle'));
  assert.ok(!style.includes('.visual-controls'));
});
