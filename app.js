import { MoleRound, progressionForHits, separatedExpiry, staggerDelay } from './game-core.mjs';
import { loadPreferences, savePreferences, updateBest } from './device-preferences.mjs';

const startScreen = document.querySelector('#start-screen');
const gameScreen = document.querySelector('#game-screen');
const startButton = document.querySelector('#start-button');
const restartButton = document.querySelector('#restart-button');
const countdown = document.querySelector('#countdown');
const board = document.querySelector('#board');
const feedback = document.querySelector('#feedback');
const score = document.querySelector('#score');
const level = document.querySelector('#level');
const timeLeft = document.querySelector('#time-left');
const resultScreen = document.querySelector('#result-screen');
const resultScore = document.querySelector('#result-score');
const resultLevel = document.querySelector('#result-level');
const resultHits = document.querySelector('#result-hits');
const bestScore = document.querySelector('#best-score');
const bestLevel = document.querySelector('#best-level');
const muteButton = document.querySelector('#mute-button');
const systemNotice = document.querySelector('#system-notice');
const pauseScreen = document.querySelector('#pause-screen');
const resumeButton = document.querySelector('#resume-button');
const levelBanner = document.querySelector('#level-banner');

const round = new MoleRound({ typeRandom: Math.random });
let holes = [];
let countdownRunning = false;
let runId = 0;
const moleTimers = new Map();
let nextTimer = null;
let clockFrame = null;
let nextDueAt = null;
let nextKind = null;
let nextProgression = null;
let pauseSnapshot = null;
let countdownInterrupted = false;
let levelBannerTimer = null;
let audioContext = null;
let storage = null;
let storageNoticeShown = false;
try { storage = window.localStorage; } catch { storage = null; }
let { preferences, failed: storageLoadFailed } = loadPreferences(storage);

function showStorageNotice() {
  if (storageNoticeShown) return;
  storageNoticeShown = true;
  systemNotice.hidden = false;
  systemNotice.textContent = '기록을 저장할 수 없지만 게임은 계속할 수 있어요.';
  window.setTimeout(() => { systemNotice.hidden = true; }, 3000);
}

function persistPreferences() {
  if (!savePreferences(storage, preferences)) showStorageNotice();
}

function updateMuteButton() {
  muteButton.setAttribute('aria-pressed', String(preferences.muted));
  muteButton.textContent = preferences.muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
}

function unlockAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  } catch { audioContext = null; }
}

function playTone(type) {
  if (preferences.muted || !audioContext) return;
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type === 'hit' ? 'sine' : 'square';
    oscillator.frequency.setValueAtTime(type === 'hit' ? 520 : 145, now);
    if (type === 'hit') oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.09);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch { /* Optional audio must never stop play. */ }
}

function vibrate(type) {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(type === 'hit' ? [15, 20, 80] : 15);
  } catch { /* Optional vibration must never stop play. */ }
}

function renderBoard(size) {
  board.replaceChildren();
  holes = [];
  board.style.setProperty('--board-size', String(size));
  board.setAttribute('aria-label', `${size}행 ${size}열 두더지 구멍`);
  for (let index = 0; index < size ** 2; index += 1) {
    const hole = document.createElement('button');
    hole.type = 'button';
    hole.className = 'hole';
    hole.dataset.index = String(index);
    hole.dataset.label = `${Math.floor(index / size) + 1}행 ${index % size + 1}열 구멍`;
    hole.setAttribute('aria-label', hole.dataset.label);
    hole.disabled = !round.running;
    hole.innerHTML = '<span class="tunnel" aria-hidden="true"><span class="mole"></span></span>';
    board.append(hole);
    holes.push(hole);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function clearGameTasks() {
  moleTimers.forEach(({ timer }) => window.clearTimeout(timer));
  moleTimers.clear();
  window.clearTimeout(nextTimer);
  window.cancelAnimationFrame(clockFrame);
  nextTimer = null;
  clockFrame = null;
  nextDueAt = null;
  nextKind = null;
  nextProgression = null;
  window.clearTimeout(levelBannerTimer);
  levelBannerTimer = null;
  levelBanner.hidden = true;
}

function paintMoles() {
  const moleByHole = round.moleByHole;
  holes.forEach((hole, index) => {
    const mole = moleByHole.get(index);
    const active = Boolean(mole);
    hole.classList.toggle('has-mole', active);
    hole.classList.toggle('giant-mole', mole?.type === 'giant');
    hole.classList.toggle('flower-appearance', mole?.type === 'flower');
    hole.classList.toggle('mole-hit', mole?.status === 'hit');
    hole.classList.toggle('flower-wilted', mole?.status === 'wilted');
    hole.setAttribute('aria-pressed', String(active));
    if (mole?.type === 'giant') hole.setAttribute('aria-label', `${hole.dataset.label}, 대왕 두더지`);
    else if (mole?.type === 'flower') hole.setAttribute('aria-label', `${hole.dataset.label}, 꽃 장애물`);
    else hole.setAttribute('aria-label', hole.dataset.label);
  });
}

function updateStatus() {
  score.textContent = String(round.score);
  level.textContent = String(round.level);
}

function finishGame() {
  if (!round.ended || !resultScreen.hidden) return;
  clearGameTasks();
  paintMoles();
  holes.forEach((hole) => { hole.disabled = true; });
  timeLeft.textContent = '0';
  resultScore.textContent = String(round.score);
  resultLevel.textContent = String(round.level);
  resultHits.textContent = String(round.hits);
  preferences = updateBest(preferences, round.score, round.level);
  persistPreferences();
  bestScore.textContent = String(preferences.bestScore);
  bestLevel.textContent = String(preferences.bestLevel);
  resultScreen.hidden = false;
  muteButton.disabled = true;
  restartButton.focus();
}

function updateClock(currentRun) {
  if (currentRun !== runId || !round.running) return;
  const now = performance.now();
  if (round.update(now)) {
    finishGame();
    return;
  }
  timeLeft.textContent = String(Math.ceil(round.remainingMs(now) / 1000));
  clockFrame = window.requestAnimationFrame(() => updateClock(currentRun));
}

function scheduleNext(delayMs = null) {
  const progression = progressionForHits(round.hits);
  if (nextTimer !== null || round.activeMoles.size >= progression.maxMoles || !round.running) return;
  const waitMs = delayMs ?? staggerDelay(progression, Math.random);
  const currentRun = runId;
  nextDueAt = performance.now() + waitMs;
  nextKind = 'show-next';
  nextProgression = null;
  nextTimer = window.setTimeout(() => {
    nextTimer = null;
    nextDueAt = null;
    nextKind = null;
    if (currentRun === runId && showMole()) scheduleNext();
  }, waitMs);
}

function scheduleMoleExpiry(appearance, delayMs, deadline = performance.now() + delayMs) {
  const currentRun = runId;
  const timer = window.setTimeout(() => {
    moleTimers.delete(appearance.appearanceId);
    if (currentRun !== runId || !round.expire(appearance.appearanceId)) return;
    paintMoles();
    feedback.className = 'feedback';
    feedback.textContent = '아깝다! 다음 두더지를 기다리세요.';
    scheduleNext();
  }, delayMs);
  moleTimers.set(appearance.appearanceId, { timer, dueAt: deadline, appearance, kind: 'expiry' });
}

function scheduleHitRemoval(appearance, delayMs = 250) {
  const currentRun = runId;
  const timer = window.setTimeout(() => {
    moleTimers.delete(appearance.appearanceId);
    if (currentRun !== runId || !round.completeHit(appearance.appearanceId)) return;
    paintMoles();
    scheduleNext();
  }, delayMs);
  moleTimers.set(appearance.appearanceId, { timer, dueAt: performance.now() + delayMs, appearance, kind: 'hit-removal' });
}

function showMole() {
  const appearance = round.showNext();
  if (!appearance) return false;
  paintMoles();
  const spawnedAt = performance.now();
  const existingDeadlines = Array.from(moleTimers.values())
    .filter(({ kind }) => kind === 'expiry')
    .map(({ dueAt }) => dueAt);
  const separated = separatedExpiry({
    spawnedAt,
    visibleMs: appearance.visibleMs,
    existingDeadlines,
    minVisibleMs: appearance.type === 'giant' ? 300 : 350
  });
  scheduleMoleExpiry(appearance, separated.visibleMs, separated.deadline);
  return true;
}

function startStaggeredMoles() {
  if (round.activeMoles.size === 0) showMole();
  scheduleNext();
}

function flash(hole, className) {
  hole.classList.remove('hit', 'wrong');
  void hole.offsetWidth;
  hole.classList.add(className);
  window.setTimeout(() => hole.classList.remove(className), 260);
}

function showStrikeEffect(hole, type) {
  const hammer = document.createElement('img');
  hammer.className = 'hammer';
  hammer.src = 'assets/toy-mallet.png';
  hammer.alt = '';
  hammer.draggable = false;
  hammer.setAttribute('aria-hidden', 'true');
  hole.append(hammer);
  const effects = [hammer];
  if (type === 'hit') {
    const shockwave = document.createElement('span');
    shockwave.className = 'shockwave';
    shockwave.setAttribute('aria-hidden', 'true');
    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.textContent = '★ ✦ ★';
    stars.setAttribute('aria-hidden', 'true');
    hole.append(shockwave, stars);
    effects.push(shockwave, stars);
  }
  window.setTimeout(() => effects.forEach((effect) => effect.remove()), 280);
}

function changeLevel(progression) {
  clearGameTasks();
  round.activeHole = null;
  holes.forEach((hole) => { hole.disabled = true; });
  feedback.className = 'feedback success';
  feedback.textContent = `${progression.level}단계! 판이 더 빠르고 커졌어요.`;
  levelBanner.textContent = `레벨 ${progression.level}!`;
  levelBanner.hidden = false;
  levelBannerTimer = window.setTimeout(() => {
    levelBanner.hidden = true;
    levelBannerTimer = null;
  }, 1200);
  updateClock(runId);
  scheduleLevelChange(progression, 280);
}

board.addEventListener('click', (event) => {
  const hole = event.target.closest('.hole');
  if (!hole || !board.contains(hole)) return;
  const result = round.press(Number(hole.dataset.index), performance.now());
  if (round.ended) {
    finishGame();
    return;
  }
  unlockAudio();
  const feedbackType = result.type === 'hit' ? 'hit' : 'miss';
  showStrikeEffect(hole, feedbackType);
  vibrate(feedbackType);
  if (result.type === 'ignored') return;
  playTone(result.type);
  if (result.type === 'hit') {
    const hitTimer = moleTimers.get(result.appearanceId);
    if (hitTimer) window.clearTimeout(hitTimer.timer);
    moleTimers.delete(result.appearanceId);
    paintMoles();
    updateStatus();
    feedback.className = 'feedback success';
    feedback.textContent = result.moleType === 'giant' ? '대왕 두더지! +300 ★' : '잡았다! +100 ★';
    flash(hole, 'hit');
    if (result.levelChanged) changeLevel(result.progression);
    else scheduleHitRemoval(round.activeMoles.get(result.appearanceId));
    return;
  }
  if (result.type === 'flower') {
    const flowerTimer = moleTimers.get(result.appearanceId);
    if (flowerTimer) window.clearTimeout(flowerTimer.timer);
    moleTimers.delete(result.appearanceId);
    paintMoles();
    updateStatus();
    feedback.className = 'feedback failure';
    feedback.textContent = '앗, 꽃을 때렸어요! -100 ✿';
    flash(hole, 'wrong');
    scheduleHitRemoval(round.activeMoles.get(result.appearanceId));
    return;
  }
  updateStatus();
  feedback.className = 'feedback failure';
  feedback.textContent = '앗, 빈 구멍! -50 ×';
  flash(hole, 'wrong');
});

async function beginGame() {
  if (countdownRunning || round.running) return;
  const currentRun = ++runId;
  countdownRunning = true;
  countdownInterrupted = false;
  startButton.disabled = true;
  restartButton.disabled = true;
  muteButton.disabled = false;
  resultScreen.hidden = true;
  countdown.hidden = false;
  for (const number of [3, 2, 1]) {
    if (currentRun !== runId) return;
    countdown.textContent = String(number);
    await delay(1000);
  }
  if (currentRun !== runId) return;
  countdown.hidden = true;
  startScreen.hidden = true;
  gameScreen.hidden = false;
  round.start(performance.now());
  renderBoard(3);
  updateStatus();
  timeLeft.textContent = '60';
  feedback.className = 'feedback';
  feedback.textContent = '두더지를 기다리세요!';
  countdownRunning = false;
  restartButton.disabled = false;
  startStaggeredMoles();
  updateClock(currentRun);
}

function pauseGame() {
  if (!resultScreen.hidden || pauseScreen.hidden === false) return;
  if (countdownRunning) {
    runId += 1;
    countdownRunning = false;
    countdownInterrupted = true;
    countdown.hidden = true;
    pauseSnapshot = { countdown: true };
  } else if (round.running) {
    const now = performance.now();
    pauseSnapshot = {
      countdown: false,
      moleRemaining: Array.from(moleTimers.values(), ({ dueAt, appearance, kind }) => ({
        appearance,
        kind,
        remaining: Math.max(0, dueAt - now)
      })),
      nextRemaining: nextDueAt === null ? null : Math.max(0, nextDueAt - now),
      nextKind,
      progression: nextProgression
    };
    if (!round.pause(now)) return;
    clearGameTasks();
    holes.forEach((hole) => { hole.disabled = true; });
  } else {
    return;
  }
  pauseScreen.hidden = false;
  muteButton.disabled = true;
  resumeButton.focus();
}

function resumeGame() {
  if (pauseScreen.hidden || !pauseSnapshot) return;
  const snapshot = pauseSnapshot;
  pauseSnapshot = null;
  pauseScreen.hidden = true;
  muteButton.disabled = false;
  if (snapshot.countdown || countdownInterrupted) {
    countdownInterrupted = false;
    startButton.disabled = false;
    beginGame();
    return;
  }
  if (!round.resume(performance.now())) return;
  holes.forEach((hole) => { hole.disabled = false; });
  updateClock(runId);
  if (snapshot.moleRemaining.length > 0 && round.activeMoles.size > 0) {
    snapshot.moleRemaining.forEach(({ appearance, remaining, kind }) => {
      if (!round.activeMoles.has(appearance.appearanceId)) return;
      if (kind === 'hit-removal') scheduleHitRemoval(appearance, remaining);
      else scheduleMoleExpiry(appearance, remaining);
    });
  }
  if (snapshot.nextKind === 'level-change') {
    scheduleLevelChange(snapshot.progression, snapshot.nextRemaining ?? 0);
  } else if (snapshot.nextRemaining !== null) {
    scheduleNext(snapshot.nextRemaining);
  } else if (round.activeMoles.size === 0) {
    scheduleNext();
  }
}

function scheduleLevelChange(progression, delayMs) {
  const currentRun = runId;
  nextDueAt = performance.now() + delayMs;
  nextKind = 'level-change';
  nextProgression = progression;
  nextTimer = window.setTimeout(() => {
    nextTimer = null;
    nextDueAt = null;
    nextKind = null;
    nextProgression = null;
    if (currentRun !== runId || !round.running) return;
    renderBoard(progression.size);
    startStaggeredMoles();
  }, delayMs);
}

startButton.addEventListener('click', beginGame);
startButton.addEventListener('click', unlockAudio);
muteButton.addEventListener('click', () => {
  unlockAudio();
  preferences = { ...preferences, muted: !preferences.muted };
  updateMuteButton();
  persistPreferences();
});
restartButton.addEventListener('click', () => {
  if (countdownRunning) return;
  clearGameTasks();
  round.reset();
  renderBoard(3);
  updateStatus();
  timeLeft.textContent = '60';
  beginGame();
});
resumeButton.addEventListener('click', resumeGame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('blur', pauseGame);

renderBoard(3);
updateMuteButton();
if (storageLoadFailed) showStorageNotice();
window.addEventListener('pagehide', pauseGame);
