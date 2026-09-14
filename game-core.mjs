export function chooseNextHole(holeCount, previousHole, random = Math.random) {
  if (!Number.isInteger(holeCount) || holeCount < 1) throw new RangeError('holeCount must be positive');
  if (holeCount === 1) return 0;
  const candidates = Array.from({ length: holeCount }, (_, index) => index)
    .filter((index) => index !== previousHole);
  const value = Math.min(Math.max(Number(random()) || 0, 0), 0.999999999999);
  return candidates[Math.floor(value * candidates.length)];
}

export const GAME_DURATION_MS = 60_000;

export function progressionForHits(hits) {
  const level = Math.min(3, Math.floor(Math.max(0, hits) / 10) + 1);
  const sizes = [3, 4, 5];
  const visibleDurations = [1100, 850, 650];
  return { level, size: sizes[level - 1], holeCount: sizes[level - 1] ** 2, visibleMs: visibleDurations[level - 1] };
}

export class MoleRound {
  constructor({ holeCount = 9, random = Math.random } = {}) {
    this.holeCount = holeCount;
    this.random = random;
    this.activeHole = null;
    this.previousHole = null;
    this.appearanceId = 0;
    this.resolvedAppearanceId = null;
    this.resolvedHole = null;
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
    this.activeHole = null;
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

  reset() {
    this.activeHole = null;
    this.previousHole = null;
    this.appearanceId += 1;
    this.resolvedAppearanceId = null;
    this.resolvedHole = null;
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
    if (!this.running) return null;
    this.activeHole = chooseNextHole(this.holeCount, this.previousHole, this.random);
    this.previousHole = this.activeHole;
    this.appearanceId += 1;
    this.resolvedAppearanceId = null;
    this.resolvedHole = null;
    return { hole: this.activeHole, appearanceId: this.appearanceId };
  }

  expire(appearanceId) {
    if (!this.running || appearanceId !== this.appearanceId || this.resolvedAppearanceId === appearanceId) return false;
    this.resolvedAppearanceId = appearanceId;
    this.activeHole = null;
    return true;
  }

  press(holeIndex, now = null) {
    if (now !== null) this.update(now);
    if (!this.running || !Number.isInteger(holeIndex) || holeIndex < 0 || holeIndex >= this.holeCount) {
      return { type: 'ignored' };
    }
    if (this.activeHole === null
      && this.resolvedAppearanceId === this.appearanceId
      && this.resolvedHole === holeIndex) {
      return { type: 'ignored' };
    }
    if (this.activeHole === holeIndex && this.resolvedAppearanceId !== this.appearanceId) {
      this.resolvedAppearanceId = this.appearanceId;
      this.resolvedHole = holeIndex;
      this.activeHole = null;
      this.hits += 1;
      this.score += 100;
      const progression = progressionForHits(this.hits);
      const levelChanged = progression.level !== this.level;
      this.level = progression.level;
      this.holeCount = progression.holeCount;
      return { type: 'hit', appearanceId: this.appearanceId, levelChanged, progression };
    }
    this.misses += 1;
    this.score = Math.max(0, this.score - 50);
    return { type: 'miss' };
  }
}
