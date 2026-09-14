import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFERENCES,
  STORAGE_KEY,
  loadPreferences,
  savePreferences,
  updateBest
} from '../device-preferences.mjs';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, STORAGE_KEY); return value; },
    setItem(key, next) { assert.equal(key, STORAGE_KEY); value = next; },
    value() { return value; }
  };
}

test('missing storage data loads safe defaults without failure', () => {
  assert.deepEqual(loadPreferences(memoryStorage()), { preferences: { ...DEFAULT_PREFERENCES }, failed: false });
});

test('valid preferences round-trip including mute state', () => {
  const storage = memoryStorage();
  const expected = { bestScore: 1200, bestLevel: 3, muted: true };
  assert.equal(savePreferences(storage, expected), true);
  assert.deepEqual(loadPreferences(storage), { preferences: expected, failed: false });
});

test('corrupt, blocked, and unavailable storage return defaults and failure', () => {
  assert.equal(loadPreferences(memoryStorage('{broken')).failed, true);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadPreferences(blocked), { preferences: { ...DEFAULT_PREFERENCES }, failed: true });
  assert.equal(savePreferences(blocked, DEFAULT_PREFERENCES), false);
  assert.equal(loadPreferences(null).failed, true);
  assert.equal(savePreferences(null, DEFAULT_PREFERENCES), false);
});

test('best score and level update independently and never decrease', () => {
  const old = { bestScore: 1000, bestLevel: 2, muted: true };
  assert.deepEqual(updateBest(old, 900, 3), { bestScore: 1000, bestLevel: 3, muted: true });
  assert.deepEqual(updateBest(old, 1400, 1), { bestScore: 1400, bestLevel: 2, muted: true });
  assert.deepEqual(updateBest(old, 500, 1), old);
});
