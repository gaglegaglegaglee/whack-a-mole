export const STORAGE_KEY = 'whack-a-mole.preferences.v1';
export const DEFAULT_PREFERENCES = Object.freeze({ bestScore: 0, bestLevel: 1, muted: false });

function sanitize(value) {
  if (!value || typeof value !== 'object') throw new TypeError('invalid preferences');
  return {
    bestScore: Number.isFinite(value.bestScore) && value.bestScore >= 0 ? Math.floor(value.bestScore) : 0,
    bestLevel: Number.isFinite(value.bestLevel) && value.bestLevel >= 1 ? Math.floor(value.bestLevel) : 1,
    muted: value.muted === true
  };
}

export function loadPreferences(storage) {
  try {
    if (!storage) throw new Error('storage unavailable');
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return { preferences: { ...DEFAULT_PREFERENCES }, failed: false };
    return { preferences: sanitize(JSON.parse(raw)), failed: false };
  } catch {
    return { preferences: { ...DEFAULT_PREFERENCES }, failed: true };
  }
}

export function savePreferences(storage, preferences) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitize(preferences)));
    if (!storage) throw new Error('storage unavailable');
    return true;
  } catch {
    return false;
  }
}

export function updateBest(preferences, score, level) {
  return {
    ...preferences,
    bestScore: Math.max(preferences.bestScore, Math.max(0, Math.floor(score))),
    bestLevel: Math.max(preferences.bestLevel, Math.max(1, Math.floor(level)))
  };
}
