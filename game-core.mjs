export function chooseNextHole(holeCount, previousHole, random = Math.random, excludedHoles = []) {
  if (!Number.isInteger(holeCount) || holeCount < 1) throw new RangeError('holeCount must be positive');
  const excluded = new Set(excludedHoles);
  let candidates = Array.from({ length: holeCount }, (_, index) => index)
    .filter((index) => index !== previousHole && !excluded.has(index));
  if (candidates.length === 0) {
    candidates = Array.from({ length: holeCount }, (_, index) => index).filter((index) => !excluded.has(index));
  }
  if (candidates.length === 0) return null;
  const value = Math.min(Math.max(Number(random()) || 0, 0), 0.999999999999);
  return candidates[Math.floor(value * candidates.length)];
}

export const GAME_DURATION_MS = 60_000;

export function progressionForHits(hits) {
  const level = Math.min(5, Math.floor(Math.max(0, hits) / 10) + 1);
  const sizes = [3, 4, 4, 5, 5];
  const visibleDurations = [1100, 950, 800, 700, 600];
  const maxMoles = [1, 1, 2, 2, 3];
  const spawnIntervals = [520, 460, 400, 350, 300];
  return {
    level,
    size: sizes[level - 1],
    holeCount: sizes[level - 1] ** 2,
    visibleMs: visibleDurations[level - 1],
    maxMoles: maxMoles[level - 1],
    spawnIntervalMs: spawnIntervals[level - 1]
  };
}

export function staggerDelay(progression, random = Math.random) {
  const value = Math.min(Math.max(Number(random()) || 0, 0), 0.999999999999);
  return Math.round(progression.spawnIntervalMs * (0.75 + value * 0.5));
}

export function separatedExpiry({
  spawnedAt,
  visibleMs,
  existingDeadlines,
  minGapMs = 120,
  minVisibleMs = 300,
  maxExtensionMs = 150
}) {
  const desired = spawnedAt + visibleMs;
  const deadlines = Array.from(existingDeadlines).filter(Number.isFinite);
  const isSafe = (candidate) => deadlines.every((deadline) => Math.abs(candidate - deadline) >= minGapMs);
  if (isSafe(desired)) return { deadline: desired, visibleMs };

  for (let offset = minGapMs; offset <= visibleMs - minVisibleMs; offset += minGapMs) {
    const candidate = desired - offset;
    if (isSafe(candidate)) return { deadline: candidate, visibleMs: candidate - spawnedAt };
  }
  for (let offset = minGapMs; offset <= maxExtensionMs; offset += minGapMs) {
    const candidate = desired + offset;
    if (isSafe(candidate)) return { deadline: candidate, visibleMs: candidate - spawnedAt };
  }
  return { deadline: desired, visibleMs };
}

export class MoleRound {
  constructor({ holeCount = 9, random = Math.random, typeRandom = () => 1 } = {}) {
    this.holeCount = holeCount;
    this.random = random;
    this.typeRandom = typeRandom;
    this.activeMoles = new Map();
    this.previousHole = null;
    this.appearanceId = 0;
    this.resolvedByHole = new Map();
    this.hits = 0;
    this.misses = 0;
    this.score = 0;
    this.level = 1;
    this.running = false;
    this.startedAt = null;
    this.endsAt = null;
    this.ended = false;
    this.paused = false;
    this.pausedRemainingMs = null;
  }

  get activeHoles() {
    return new Set(Array.from(this.activeMoles.values(), (mole) => mole.hole));
  }

  get moleByHole() {
    return new Map(Array.from(this.activeMoles.values(), (mole) => [mole.hole, mole]));
  }

  get activeHole() {
    return this.activeMoles.values().next().value?.hole ?? null;
  }

  set activeHole(value) {
    if (value === null) this.clearActiveMoles();
  }

  start(now = 0) {
    if (this.running) return false;
    this.running = true;
    this.ended = false;
    this.paused = false;
    this.pausedRemainingMs = null;
    this.startedAt = now;
    this.endsAt = now + GAME_DURATION_MS;
    return true;
  }

  remainingMs(now) {
    if (this.startedAt === null) return GAME_DURATION_MS;
    if (this.paused) return this.pausedRemainingMs;
    return Math.max(0, this.endsAt - now);
  }

  update(now) {
    if (!this.running || this.remainingMs(now) > 0) return false;
    this.running = false;
    this.ended = true;
    this.clearActiveMoles();
    return true;
  }

  pause(now) {
    if (!this.running || this.ended) return false;
    this.pausedRemainingMs = this.remainingMs(now);
    this.running = false;
    this.paused = true;
    return true;
  }

  resume(now) {
    if (!this.paused || this.ended) return false;
    this.startedAt = now;
    this.endsAt = now + this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    this.paused = false;
    this.running = true;
    return true;
  }

  clearActiveMoles() {
    this.activeMoles.clear();
    this.resolvedByHole.clear();
  }

  reset() {
    this.clearActiveMoles();
    this.previousHole = null;
    this.appearanceId += 1;
    this.resolvedByHole.clear();
    this.hits = 0;
    this.misses = 0;
    this.score = 0;
    this.level = 1;
    this.holeCount = 9;
    this.running = false;
    this.startedAt = null;
    this.endsAt = null;
    this.ended = false;
    this.paused = false;
    this.pausedRemainingMs = null;
  }

  showNext() {
    const { maxMoles } = progressionForHits(this.hits);
    if (!this.running || this.activeMoles.size >= maxMoles) return null;
    const hole = chooseNextHole(this.holeCount, this.previousHole, this.random, this.activeHoles);
    if (hole === null) return null;
    this.previousHole = hole;
    this.appearanceId += 1;
    const typeRoll = this.typeRandom();
    const type = typeRoll < 0.1 ? 'giant' : typeRoll < 0.25 ? 'flower' : 'normal';
    const appearance = {
      hole,
      appearanceId: this.appearanceId,
      type,
      status: 'active',
      visibleMs: type === 'giant' ? 450 : progressionForHits(this.hits).visibleMs
    };
    this.activeMoles.set(appearance.appearanceId, appearance);
    return appearance;
  }

  expire(appearanceId) {
    if (!this.running) return false;
    const appearance = this.activeMoles.get(appearanceId);
    if (!appearance || appearance.status !== 'active') return false;
    this.activeMoles.delete(appearanceId);
    return true;
  }


  completeHit(appearanceId) {
    const appearance = this.activeMoles.get(appearanceId);
    if (!appearance || !['hit', 'wilted'].includes(appearance.status)) return false;
    this.activeMoles.delete(appearanceId);
    if (this.resolvedByHole.get(appearance.hole) === appearanceId) {
      this.resolvedByHole.delete(appearance.hole);
    }
    return true;
  }

  press(holeIndex, now = null) {
    if (now !== null) this.update(now);
    if (!this.running || !Number.isInteger(holeIndex) || holeIndex < 0 || holeIndex >= this.holeCount) {
      return { type: 'ignored' };
    }
    const appearance = Array.from(this.activeMoles.values())
      .find((mole) => mole.hole === holeIndex && mole.status === 'active');
    if (!appearance && this.resolvedByHole.has(holeIndex)) return { type: 'ignored' };
    if (appearance) {
      if (appearance.type === 'flower') {
        appearance.status = 'wilted';
        this.resolvedByHole.set(holeIndex, appearance.appearanceId);
        this.score = Math.max(0, this.score - 100);
        return { type: 'flower', appearanceId: appearance.appearanceId, moleType: 'flower', points: -100, levelChanged: false, progression: progressionForHits(this.hits) };
      }
      appearance.status = 'hit';
      this.resolvedByHole.set(holeIndex, appearance.appearanceId);
      this.hits += 1;
      const points = appearance.type === 'giant' ? 300 : 100;
      this.score += points;
      const progression = progressionForHits(this.hits);
      const levelChanged = progression.level !== this.level;
      this.level = progression.level;
      this.holeCount = progression.holeCount;
      return { type: 'hit', appearanceId: appearance.appearanceId, moleType: appearance.type, points, levelChanged, progression };
    }
    this.misses += 1;
    this.score = Math.max(0, this.score - 50);
    return { type: 'miss' };
  }
}
