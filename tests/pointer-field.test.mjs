import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerField } from '../src/interaction/PointerField.js';

test('left click starts exactly one independent ripple without pointer movement', () => {
  const field = new PointerField();
  field.click(0.23, -0.31, 10);
  assert.equal(field.clickRipple.x, 0.23);
  assert.equal(field.clickRipple.y, -0.31);
  assert.equal(field.clickRipple.z, 0);
  assert.equal(field.clickRipple.w, 1);
  field.update(10.016);
  assert.ok(field.clickRipple.z > 0);
  assert.ok(field.clickRipple.w > 0);
  for (let t = 10.032; t < 12; t += 0.016) field.update(t);
  assert.equal(field.clickRipple.w, 0);
});

test('left click may be repeated; reducing motion clears its ring', () => {
  const field = new PointerField();
  field.click(0, 0, 4);
  field.update(4.016);
  field.click(-0.7, 0.4, 4.4);
  assert.equal(field.clickRipple.z, 0);
  assert.equal(field.clickRipple.x, -0.7);
  field.update(4.42, false);
  assert.equal(field.clickRipple.w, 0);
  assert.equal(field.clickRipple.x, 10);
});

test('invalid click values do not create a ripple', () => {
  const field = new PointerField();
  field.click(Number.NaN, 0, 2);
  assert.equal(field.clickRipple.w, 0);
});
