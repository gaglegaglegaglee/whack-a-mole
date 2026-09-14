import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseNextHole, GAME_DURATION_MS, MoleRound, progressionForHits, separatedExpiry, staggerDelay } from '../game-core.mjs';

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
  round.completeHit(first.appearanceId);
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
  round.press(oldMole.hole);
  round.completeHit(oldMole.appearanceId);
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
  round.completeHit(mole.appearanceId);
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
  assert.deepEqual(progressionForHits(9), { level: 1, size: 3, holeCount: 9, visibleMs: 1100, maxMoles: 1, spawnIntervalMs: 520 });
  assert.deepEqual(progressionForHits(10), { level: 2, size: 4, holeCount: 16, visibleMs: 950, maxMoles: 1, spawnIntervalMs: 460 });
  assert.deepEqual(progressionForHits(19), { level: 2, size: 4, holeCount: 16, visibleMs: 950, maxMoles: 1, spawnIntervalMs: 460 });
  assert.deepEqual(progressionForHits(20), { level: 3, size: 4, holeCount: 16, visibleMs: 800, maxMoles: 2, spawnIntervalMs: 400 });
  assert.equal(progressionForHits(30).holeCount, 25);
  assert.deepEqual(
    [0, 10, 20, 30, 40].map((hits) => {
      const { level, size, maxMoles } = progressionForHits(hits);
      return [level, size, maxMoles];
    }),
    [[1, 3, 1], [2, 4, 1], [3, 4, 2], [4, 5, 2], [5, 5, 3]]
  );
  assert.equal(progressionForHits(99).level, 5);
  assert.ok(progressionForHits(1).visibleMs > progressionForHits(10).visibleMs);
  assert.ok(progressionForHits(10).visibleMs > progressionForHits(20).visibleMs);
});

test('stagger delay has injectable jitter and never synchronizes all appearances', () => {
  const progression = progressionForHits(20);
  assert.equal(staggerDelay(progression, () => 0), 300);
  assert.equal(staggerDelay(progression, () => 0.5), 400);
  assert.equal(staggerDelay(progression, () => 0.999), 500);
});

test('expiry separation resolves the regular and giant collision example deterministically', () => {
  const result = separatedExpiry({ spawnedAt: 350, visibleMs: 450, existingDeadlines: [800] });
  assert.deepEqual(result, { deadline: 680, visibleMs: 330 });
  assert.ok(Math.abs(result.deadline - 800) >= 120);
});

test('expiry separation checks every existing deadline and bounds giant extension', () => {
  const result = separatedExpiry({ spawnedAt: 350, visibleMs: 450, existingDeadlines: [800, 680] });
  assert.deepEqual(result, { deadline: 920, visibleMs: 570 });
  assert.ok([800, 680].every((deadline) => Math.abs(result.deadline - deadline) >= 120));
  assert.ok(result.visibleMs <= 600);
  assert.deepEqual(
    separatedExpiry({ spawnedAt: 100, visibleMs: 450, existingDeadlines: [1000] }),
    { deadline: 550, visibleMs: 450 }
  );
});

test('giant mole uses injected ten-percent roll, 450ms duration, and 300 points', () => {
  const giantRound = new MoleRound({ random: () => 0.5, typeRandom: () => 0.099 });
  giantRound.start();
  const giant = giantRound.showNext();
  assert.equal(giant.type, 'giant');
  assert.equal(giant.visibleMs, 450);
  const result = giantRound.press(giant.hole);
  assert.deepEqual({ moleType: result.moleType, points: result.points }, { moleType: 'giant', points: 300 });
  assert.equal(giantRound.score, 300);

  const normalRound = new MoleRound({ random: () => 0.5, typeRandom: () => 0.25 });
  normalRound.start();
  const normal = normalRound.showNext();
  assert.equal(normal.type, 'normal');
  assert.equal(normal.visibleMs, 1100);
});

test('type probability boundaries are giant 10%, flower 15%, normal 75%', () => {
  const typeAt = (roll) => {
    const round = new MoleRound({ typeRandom: () => roll });
    round.start();
    return round.showNext().type;
  };
  assert.equal(typeAt(0), 'giant');
  assert.equal(typeAt(0.099999), 'giant');
  assert.equal(typeAt(0.1), 'flower');
  assert.equal(typeAt(0.249999), 'flower');
  assert.equal(typeAt(0.25), 'normal');
  assert.equal(typeAt(0.999), 'normal');
});

test('flower costs 100 with a zero floor, never advances hits, and expires without penalty', () => {
  const round = new MoleRound({ typeRandom: () => 0.15 });
  round.start();
  let flower = round.showNext();
  let result = round.press(flower.hole);
  assert.deepEqual({ type: result.type, points: result.points }, { type: 'flower', points: -100 });
  assert.equal(round.score, 0);
  assert.equal(round.hits, 0);
  assert.equal(round.activeMoles.get(flower.appearanceId).status, 'wilted');
  assert.equal(round.press(flower.hole).type, 'ignored');
  round.completeHit(flower.appearanceId);

  round.score = 250;
  flower = round.showNext();
  result = round.press(flower.hole);
  assert.equal(round.score, 150);
  assert.equal(round.hits, 0);
  round.completeHit(flower.appearanceId);
  flower = round.showNext();
  assert.equal(round.expire(flower.appearanceId), true);
  assert.equal(round.score, 150);
  assert.equal(round.hits, 0);
});

test('new appearance does not clear flower or mole afterimage guards before cleanup', () => {
  for (const firstRoll of [0.15, 0.5]) {
    const rolls = [firstRoll, 0.5];
    const round = new MoleRound({ random: () => 0, typeRandom: () => rolls.shift() ?? 0.5 });
    round.start();
    round.hits = 20;
    round.level = 3;
    round.holeCount = 16;
    round.score = 500;
    const reacted = round.showNext();
    const reaction = round.press(reacted.hole);
    const scoreAfterReaction = round.score;
    const hitsAfterReaction = round.hits;
    const other = round.showNext();
    assert.ok(other);
    assert.notEqual(other.hole, reacted.hole);
    assert.equal(round.press(reacted.hole).type, 'ignored');
    assert.equal(round.score, scoreAfterReaction);
    assert.equal(round.hits, hitsAfterReaction);
    assert.equal(round.completeHit(reaction.appearanceId), true);
    assert.equal(round.press(reacted.hole).type, 'miss');
    assert.equal(round.score, Math.max(0, scoreAfterReaction - 50));
  }
});

test('natural expiry never installs an afterimage guard', () => {
  const round = new MoleRound({ typeRandom: () => 0.15 });
  round.start();
  const flower = round.showNext();
  assert.equal(round.expire(flower.appearanceId), true);
  assert.equal(round.press(flower.hole).type, 'miss');
});

test('hit mole stays non-interactive until its visual lifecycle completes', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  const mole = round.showNext();
  const result = round.press(mole.hole);
  assert.equal(round.activeMoles.get(result.appearanceId).status, 'hit');
  assert.equal(round.press(mole.hole).type, 'ignored');
  assert.equal(round.expire(mole.appearanceId), false);
  assert.equal(round.completeHit(mole.appearanceId), true);
  assert.equal(round.activeMoles.size, 0);
});

test('every ten hits atomically advances through five capped levels', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  let result;
  for (let hit = 1; hit <= 50; hit += 1) {
    const mole = round.showNext();
    result = round.press(mole.hole);
    assert.equal(result.levelChanged, [10, 20, 30, 40].includes(hit));
    if (hit === 10) assert.equal(round.holeCount, 16);
    round.completeHit(mole.appearanceId);
  }
  assert.equal(round.level, 5);
  assert.equal(round.holeCount, 25);
  assert.equal(round.score, 5000);
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

test('each stage enforces its simultaneous mole maximum without duplicate holes', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  assert.ok(round.showNext());
  assert.equal(round.showNext(), null);
  round.clearActiveMoles();
  round.hits = 20;
  round.level = 3;
  round.holeCount = 16;
  const levelTwo = [round.showNext(), round.showNext()];
  assert.equal(new Set(levelTwo.map(({ hole }) => hole)).size, 2);
  assert.equal(round.showNext(), null);
  round.clearActiveMoles();
  round.hits = 40;
  round.level = 5;
  round.holeCount = 25;
  const levelThree = [round.showNext(), round.showNext(), round.showNext()];
  assert.equal(new Set(levelThree.map(({ hole }) => hole)).size, 3);
  assert.equal(round.showNext(), null);
});

test('simultaneous moles expire and score independently', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  round.hits = 20;
  round.level = 3;
  round.holeCount = 16;
  const first = round.showNext();
  const second = round.showNext();
  assert.equal(round.expire(first.appearanceId), true);
  assert.equal(round.activeHoles.has(second.hole), true);
  assert.equal(round.press(second.hole).type, 'hit');
  assert.equal(round.hits, 21);
  assert.equal(round.score, 100);
});

test('stale timer for one mole cannot remove another or its replacement', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  round.hits = 20;
  round.level = 3;
  round.holeCount = 16;
  const first = round.showNext();
  const second = round.showNext();
  round.press(first.hole);
  round.completeHit(first.appearanceId);
  const replacement = round.showNext();
  assert.equal(round.expire(first.appearanceId), false);
  assert.equal(round.activeHoles.has(second.hole), true);
  assert.equal(round.activeHoles.has(replacement.hole), true);
});

test('level transition invalidates every mole from the previous board', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start();
  round.hits = 29;
  round.level = 3;
  round.holeCount = 16;
  const transitionMole = round.showNext();
  const otherMole = round.showNext();
  const result = round.press(transitionMole.hole);
  assert.equal(result.levelChanged, true);
  round.clearActiveMoles();
  assert.equal(round.activeMoles.size, 0);
  assert.equal(round.expire(otherMole.appearanceId), false);
});

test('pause keeps all simultaneous appearances intact for independent resume timers', () => {
  const round = new MoleRound({ random: () => 0 });
  round.start(0);
  round.hits = 20;
  round.level = 3;
  round.holeCount = 16;
  const appearances = [round.showNext(), round.showNext()];
  round.pause(500);
  assert.deepEqual(new Set(round.activeMoles.keys()), new Set(appearances.map(({ appearanceId }) => appearanceId)));
  round.resume(5_000);
  assert.equal(round.expire(appearances[0].appearanceId), true);
  assert.equal(round.activeMoles.has(appearances[1].appearanceId), true);
});
