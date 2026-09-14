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
  const level = Math.min(3, Math.floor(Math.max(0, hits) / 10) + 1);
  const sizes = [3, 4, 5];
  const visibleDurations = [1100, 850, 650];
  return {
    level,
    size: sizes[level - 1],
    holeCount: sizes[level - 1] ** 2,
    visibleMs: visibleDurations[level - 1],
    maxMoles: level
  };
}

export class MoleRound {
  constructor({ holeCount = 9, random = Math.random } = {}) {
    this.holeCount = holeCount;
    this.random = random;
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
    const appearance = { hole, appearanceId: this.appearanceId };
    this.activeMoles.set(appearance.appearanceId, appearance);
    this.resolvedByHole.clear();
    return appearance;
  }

  expire(appearanceId) {
    if (!this.running) return false;
    const appearance = this.activeMoles.get(appearanceId);
    if (!appearance) return false;
    this.activeMoles.delete(appearanceId);
    return true;
  }

  press(holeIndex, now = null) {
    if (now !== null) this.update(now);
    if (!this.running || !Number.isInteger(holeIndex) || holeIndex < 0 || holeIndex >= this.holeCount) {
      return { type: 'ignored' };
    }
    const appearance = Array.from(this.activeMoles.values()).find((mole) => mole.hole === holeIndex);
    if (!appearance && this.resolvedByHole.has(holeIndex)) return { type: 'ignored' };
    if (appearance) {
      this.activeMoles.delete(appearance.appearanceId);
      this.resolvedByHole.set(holeIndex, appearance.appearanceId);
      this.hits += 1;
      this.score += 100;
      const progression = progressionForHits(this.hits);
      const levelChanged = progression.level !== this.level;
      this.level = progression.level;
      this.holeCount = progression.holeCount;
      if (levelChanged) this.clearActiveMoles();
      return { type: 'hit', appearanceId: appearance.appearanceId, levelChanged, progression };
    }
    this.misses += 1;
    this.score = Math.max(0, this.score - 50);
    return { type: 'miss' };
  }
}
