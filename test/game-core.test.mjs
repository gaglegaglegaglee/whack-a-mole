import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseNextHole, GAME_DURATION_MS, MoleRound, progressionForHits } from '../game-core.mjs';

test('injected random values select deterministic holes without immediate repetition', () => {
  assert.equal(chooseNextHole(9, null, () => 0), 0);
  assert.equal(chooseNextHole(9, 0, () => 0), 1);
  assert.equal(chooseNextHole(9, 4, () => 0.999), 8);
});

test('only one active mole exists and expiry causes no hit or miss', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const first = round.showNext();
  assert.equal(round.activeHole, 0);
  assert.equal(round.expire(first.appearanceId), true);
  assert.equal(round.activeHole, null);
  assert.equal(round.hits, 0);
  assert.equal(round.misses, 0);
  const second = round.showNext();
  assert.notEqual(second.hole, first.hole);
});

test('a visible mole can be hit only once even during rapid input', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const mole = round.showNext();
  assert.equal(round.press(mole.hole).type, 'hit');
  assert.equal(round.press(mole.hole).type, 'ignored');
  assert.equal(round.hits, 1);
  assert.equal(round.misses, 0);
  assert.equal(round.expire(mole.appearanceId), false);
});

test('only the just-resolved mole hole is ignored while another empty hole remains a miss', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const mole = round.showNext();
  round.press(mole.hole);
  assert.equal(round.press(mole.hole).type, 'ignored');
  assert.equal(round.press((mole.hole + 1) % 9).type, 'miss');
  assert.equal(round.misses, 1);
});

test('duplicate guard resets for a new appearance generation', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const first = round.showNext();
  round.press(first.hole);
  const second = round.showNext();
  assert.equal(round.press(first.hole).type, 'miss');
  assert.equal(round.press(second.hole).type, 'hit');
  assert.equal(round.hits, 2);
  assert.equal(round.misses, 1);
});

test('pressing an empty hole after natural expiry is still a miss', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const mole = round.showNext();
  round.expire(mole.appearanceId);
  assert.equal(round.press(mole.hole).type, 'miss');
  assert.equal(round.misses, 1);
});

test('empty holes count one miss per press while out-of-board presses are ignored', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  round.showNext();
  assert.equal(round.press(3).type, 'miss');
  assert.equal(round.misses, 1);
  assert.equal(round.press(-1).type, 'ignored');
  assert.equal(round.press(9).type, 'ignored');
  assert.equal(round.misses, 1);
});

test('stale expiry cannot remove a newer mole', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const oldMole = round.showNext();
  const currentMole = round.showNext();
  assert.equal(round.expire(oldMole.appearanceId), false);
  assert.equal(round.activeHole, currentMole.hole);
});

test('round starts only once', () => {
  const round = new MoleRound();
  assert.equal(round.start(), true);
  assert.equal(round.start(), false);
});

test('hits add 100, misses subtract 50, and score never drops below zero', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  assert.equal(round.press(1).type, 'miss');
  assert.equal(round.score, 0);
  const mole = round.showNext();
  round.press(mole.hole);
  assert.equal(round.score, 100);
  round.showNext();
  round.press(8);
  assert.equal(round.score, 50);
});

test('natural expiry leaves score unchanged', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const mole = round.showNext();
  round.expire(mole.appearanceId);
  assert.equal(round.score, 0);
});

test('progression boundaries produce 3x3, 4x4, then capped 5x5 with faster moles', () => {
  assert.deepEqual(progressionForHits(9), { level: 1, size: 3, holeCount: 9, visibleMs: 1100 });
  assert.deepEqual(progressionForHits(10), { level: 2, size: 4, holeCount: 16, visibleMs: 850 });
  assert.deepEqual(progressionForHits(19), { level: 2, size: 4, holeCount: 16, visibleMs: 850 });
  assert.deepEqual(progressionForHits(20), { level: 3, size: 5, holeCount: 25, visibleMs: 650 });
  assert.equal(progressionForHits(30).holeCount, 25);
  assert.ok(progressionForHits(1).visibleMs > progressionForHits(10).visibleMs);
  assert.ok(progressionForHits(10).visibleMs > progressionForHits(20).visibleMs);
});

test('the tenth and twentieth hits atomically report level changes', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  let result;
  for (let hit = 1; hit <= 20; hit += 1) {
    const mole = round.showNext();
    result = round.press(mole.hole);
    assert.equal(result.levelChanged, hit === 10 || hit === 20);
    if (hit === 10) assert.equal(round.holeCount, 16);
  }
  assert.equal(round.level, 3);
  assert.equal(round.holeCount, 25);
  assert.equal(round.score, 2000);
});

test('remaining time uses elapsed timestamps and ends exactly once at sixty seconds', () => {
  const round = new MoleRound();
  round.start(12_345);
  assert.equal(round.remainingMs(12_345), GAME_DURATION_MS);
  assert.equal(round.remainingMs(72_344), 1);
  assert.equal(round.update(72_344), false);
  assert.equal(round.update(72_345), true);
  assert.equal(round.remainingMs(99_999), 0);
  assert.equal(round.update(99_999), false);
  assert.equal(round.running, false);
  assert.equal(round.ended, true);
});

test('input at or after the end boundary is ignored without changing records', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start(0);
  const mole = round.showNext();
  assert.equal(round.press(mole.hole, GAME_DURATION_MS).type, 'ignored');
  assert.equal(round.hits, 0);
  assert.equal(round.misses, 0);
  assert.equal(round.score, 0);
});

test('reset restores every round value and invalidates the current mole', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start(100);
  const mole = round.showNext();
  round.press(mole.hole);
  round.showNext();
  round.press(8);
  round.reset();
  assert.deepEqual(
    { score: round.score, level: round.level, hits: round.hits, misses: round.misses, holes: round.holeCount, active: round.activeHole, running: round.running, ended: round.ended },
    { score: 0, level: 1, hits: 0, misses: 0, holes: 9, active: null, running: false, ended: false }
  );
  assert.equal(round.remainingMs(200), GAME_DURATION_MS);
  assert.equal(round.expire(mole.appearanceId), false);
});

test('pause and resume preserve exact game time and the active mole state', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start(1_000);
  const mole = round.showNext();
  assert.equal(round.pause(11_000), true);
  assert.equal(round.remainingMs(999_000), 50_000);
  assert.equal(round.activeHole, mole.hole);
  assert.equal(round.press(mole.hole, 999_000).type, 'ignored');
  assert.equal(round.hits, 0);
  assert.equal(round.update(999_000), false);
  assert.equal(round.resume(200_000), true);
  assert.equal(round.remainingMs(249_999), 1);
  assert.equal(round.update(249_999), false);
  assert.equal(round.update(250_000), true);
});

test('repeated pause, resume, and pause after result are idempotent', () => {
  const round = new MoleRound();
  round.start(0);
  assert.equal(round.pause(100), true);
  assert.equal(round.pause(200), false);
  assert.equal(round.resume(500), true);
  assert.equal(round.resume(600), false);
  round.update(60_400);
  assert.equal(round.pause(60_400), false);
  assert.equal(round.ended, true);
});
