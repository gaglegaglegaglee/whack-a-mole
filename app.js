import { MoleRound, progressionForHits } from './game-core.mjs';
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

const round = new MoleRound();
let holes = [];
let countdownRunning = false;
let runId = 0;
let moleTimer = null;
let nextTimer = null;
let clockFrame = null;
let moleDueAt = null;
let nextDueAt = null;
let nextKind = null;
let nextProgression = null;
let pauseSnapshot = null;
let countdownInterrupted = false;
const NEXT_MOLE_MS = 180;
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
    hole.setAttribute('aria-label', `${Math.floor(index / size) + 1}행 ${index % size + 1}열 구멍`);
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
  window.clearTimeout(moleTimer);
  window.clearTimeout(nextTimer);
  window.cancelAnimationFrame(clockFrame);
  moleTimer = null;
  nextTimer = null;
  clockFrame = null;
  moleDueAt = null;
  nextDueAt = null;
  nextKind = null;
  nextProgression = null;
}

function paintMole(activeIndex = null) {
  holes.forEach((hole, index) => {
    const active = index === activeIndex;
    hole.classList.toggle('has-mole', active);
    hole.setAttribute('aria-pressed', String(active));
  });
}

function updateStatus() {
  score.textContent = String(round.score);
  level.textContent = String(round.level);
}

function finishGame() {
  if (!round.ended || !resultScreen.hidden) return;
  clearGameTasks();
  paintMole();
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

function scheduleNext(delayMs = NEXT_MOLE_MS) {
  window.clearTimeout(nextTimer);
  const currentRun = runId;
  nextDueAt = performance.now() + delayMs;
  nextKind = 'show-next';
  nextProgression = null;
  nextTimer = window.setTimeout(() => {
    nextTimer = null;
    nextDueAt = null;
    nextKind = null;
    if (currentRun === runId) showMole();
  }, delayMs);
}

function scheduleMoleExpiry(appearance, delayMs) {
  window.clearTimeout(moleTimer);
  const currentRun = runId;
  moleDueAt = performance.now() + delayMs;
  moleTimer = window.setTimeout(() => {
    moleTimer = null;
    moleDueAt = null;
    if (currentRun !== runId || !round.expire(appearance.appearanceId)) return;
    paintMole();
    feedback.className = 'feedback';
    feedback.textContent = '아깝다! 다음 두더지를 기다리세요.';
    scheduleNext();
  }, delayMs);
}

function showMole() {
  const appearance = round.showNext();
  if (!appearance) return;
  paintMole(appearance.hole);
  const { visibleMs } = progressionForHits(round.hits);
  scheduleMoleExpiry(appearance, visibleMs);
}

function flash(hole, className) {
  hole.classList.remove('hit', 'wrong');
  void hole.offsetWidth;
  hole.classList.add(className);
  window.setTimeout(() => hole.classList.remove(className), 260);
}

function showStrikeEffect(hole, type) {
  const hammer = document.createElement('span');
  hammer.className = 'hammer';
  hammer.textContent = '🔨';
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
    window.clearTimeout(moleTimer);
    moleTimer = null;
    moleDueAt = null;
    paintMole();
    updateStatus();
    feedback.className = 'feedback success';
    feedback.textContent = '잡았다! +100 ★';
    flash(hole, 'hit');
    if (result.levelChanged) changeLevel(result.progression);
    else scheduleNext();
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
  showMole();
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
      moleRemaining: moleDueAt === null ? null : Math.max(0, moleDueAt - now),
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
  if (snapshot.moleRemaining !== null && round.activeHole !== null) {
    scheduleMoleExpiry({ appearanceId: round.appearanceId }, snapshot.moleRemaining);
  } else if (snapshot.nextKind === 'level-change') {
    scheduleLevelChange(snapshot.progression, snapshot.nextRemaining ?? 0);
  } else {
    scheduleNext(snapshot.nextRemaining ?? NEXT_MOLE_MS);
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
    showMole();
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
