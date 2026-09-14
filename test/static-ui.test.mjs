import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('page declares mobile viewport, accessible live regions, and module app', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /name="viewport"/);
  assert.match(html, /id="feedback"[^>]+aria-live="polite"/);
  assert.match(html, /id="countdown"[^>]+aria-live="assertive"/);
  assert.match(html, /type="module" src="app\.js\?v=\d{8}-\d+"/);
  assert.match(html, /styles\.css\?v=\d{8}-\d+/);
});

test('board uses a responsive dynamic-column layout with narrow-screen rules', async () => {
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(css, /grid-template-columns:\s*repeat\(var\(--board-size, 3\), minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 340px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /prefers-reduced-motion/);
});

test('app renders accessible hole buttons based on the current board size', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /index < size \*\* 2/);
  assert.match(source, /setAttribute\('aria-label'/);
  assert.match(source, /hole\.disabled = true/);
});

test('status and result screens expose the sprint two records and restart control', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /id="score"/);
  assert.match(html, /id="level"/);
  assert.match(html, /id="time-left"/);
  assert.match(html, /id="result-score"/);
  assert.match(html, /id="result-level"/);
  assert.match(html, /id="result-hits"/);
  assert.match(html, /id="restart-button"/);
});

test('mole is clipped inside a separate dark tunnel instead of appearing on the soil rim', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8')
  ]);
  assert.match(source, /class="tunnel"[^>]*><span class="mole"/);
  assert.match(css, /\.tunnel\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.tunnel\s*\{[\s\S]*background:\s*radial-gradient/);
});

test('hammer and hit-only star and shockwave effects cannot block input', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8')
  ]);
  assert.match(source, /hammer\.className = 'hammer'/);
  assert.match(source, /hammer\.src = 'assets\/toy-mallet\.png'/);
  assert.match(source, /hammer\.alt = ''/);
  assert.match(source, /showStrikeEffect\(hole, feedbackType\)[\s\S]*if \(result\.type === 'ignored'\) return/);
  assert.match(source, /if \(type === 'hit'\)[\s\S]*shockwave\.className = 'shockwave'[\s\S]*stars\.className = 'stars'/);
  assert.match(css, /\.hammer, \.shockwave, \.stars\s*\{[\s\S]*pointer-events:\s*none/);
  assert.match(css, /animation:\s*hammer-strike 250ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hammer/);
});

test('intro contains every current score, level, obstacle, and miss rule', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /3×3\/1 → 4×4\/1 → 4×4\/2 → 5×5\/2 → 5×5\/3/);
  assert.match(html, /일반 두더지 \+100점/);
  assert.match(html, /10%[^<]*대왕 두더지 \+300점/);
  assert.match(html, /꽃을 누르면 -100점, 빈 구멍은 -50점/);
  assert.match(html, /놓친 두더지와 꽃은 감점되지 않아요/);
  assert.match(html, /두더지 10마리마다 다음 레벨/);
  assert.match(html, /styles\.css\?v=20260914-5/);
  assert.match(html, /app\.js\?v=20260914-5/);
});

test('flower has distinct active and wilted visuals and shares safe appearance lifecycle', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8')
  ]);
  assert.match(source, /classList\.toggle\('flower-appearance'/);
  assert.match(source, /classList\.toggle\('flower-wilted'/);
  assert.match(source, /꽃을 때렸어요! -100/);
  assert.match(css, /\.hole\.flower-appearance \.mole/);
  assert.match(css, /\.hole\.flower-wilted \.mole::before/);
});

test('generated mallet image is constrained for clear touch feedback and cannot intercept input', async () => {
  const [css, mallet] = await Promise.all([
    readFile(new URL('styles.css', root), 'utf8'),
    readFile(new URL('assets/toy-mallet.png', root))
  ]);
  assert.match(css, /\.hammer\s*\{[\s\S]*width:\s*clamp\(48px, 15vw, 96px\)/);
  assert.match(css, /\.hammer, \.shockwave, \.stars\s*\{[\s\S]*pointer-events:\s*none/);
  assert.deepEqual(Array.from(mallet.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('optional vibration and Web Audio are guarded and mute is user controlled', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('app.js', root), 'utf8')
  ]);
  assert.match(html, /id="mute-button"[^>]+aria-pressed="false"/);
  assert.match(source, /navigator\.vibrate\(type === 'hit' \? \[15, 20, 80\] : 15\)/);
  assert.match(source, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(source, /if \(preferences\.muted \|\| !audioContext\) return/);
  assert.match(source, /muteButton\.addEventListener\('click'/);
});

test('result displays independent best records and one storage notice region', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /id="best-score"/);
  assert.match(html, /id="best-level"/);
  assert.match(html, /id="system-notice"[^>]+role="status"/);
});

test('pause dialog covers play and requires an explicit accessible resume action', async () => {
  const [html, css, source] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8'),
    readFile(new URL('app.js', root), 'utf8')
  ]);
  assert.match(html, /id="pause-screen"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /id="resume-button"[^>]*>계속하기/);
  assert.match(css, /\.pause-screen\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*z-index:\s*30/s);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /window\.addEventListener\('blur', pauseGame\)/);
  assert.match(source, /resumeButton\.addEventListener\('click', resumeGame\)/);
});

test('pause captures mole and next-action deadlines and countdown interruption restarts preparation', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /moleRemaining:\s*Array\.from\(moleTimers\.values\(\)[\s\S]*remaining:\s*Math\.max\(0, dueAt - now\)/);
  assert.match(source, /nextRemaining:\s*nextDueAt === null \? null : Math\.max\(0, nextDueAt - now\)/);
  assert.match(source, /if \(snapshot\.countdown \|\| countdownInterrupted\)[\s\S]*beginGame\(\)/);
  assert.match(source, /if \(!resultScreen\.hidden \|\| pauseScreen\.hidden === false\) return/);
});

test('multiple mole UI uses per-appearance timers and paints all active holes', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /const moleTimers = new Map\(\)/);
  assert.match(source, /moleTimers\.set\(appearance\.appearanceId/);
  assert.match(source, /const moleByHole = round\.moleByHole/);
  assert.doesNotMatch(source, /while \(round\.activeMoles\.size < maxMoles/);
  assert.match(source, /staggerDelay\(progression, Math\.random\)/);
  assert.match(source, /moleTimers\.get\(result\.appearanceId\)/);
});

test('giant and hit lifecycle receive distinct mole classes without replacing tunnel markup', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8')
  ]);
  assert.match(source, /classList\.toggle\('giant-mole'/);
  assert.match(source, /classList\.toggle\('mole-hit'/);
  assert.match(source, /scheduleHitRemoval\(round\.activeMoles\.get\(result\.appearanceId\)\)/);
  assert.match(css, /\.hole\.giant-mole \.mole/);
  assert.match(css, /\.hole\.mole-hit \.mole/);
});

test('level changes show a temporary assertive banner above the board', async () => {
  const [html, source, css] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8')
  ]);
  assert.match(html, /id="level-banner"[^>]+aria-live="assertive"/);
  assert.match(source, /levelBanner\.textContent = `레벨 \$\{progression\.level\}!`/);
  assert.match(source, /levelBannerTimer = window\.setTimeout\([\s\S]*1200\)/);
  assert.match(css, /\.level-banner\s*\{[\s\S]*pointer-events:\s*none/);
});

test('new expiry deadlines are separated from every active expiry timer', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /filter\(\(\{ kind \}\) => kind === 'expiry'\)/);
  assert.match(source, /separatedExpiry\(\{[\s\S]*existingDeadlines/);
  assert.match(source, /scheduleMoleExpiry\(appearance, separated\.visibleMs, separated\.deadline\)/);
});

test('mobile controls have touch target sizing and reduced-motion outcomes remain distinct', async () => {
  const css = await readFile(new URL('styles.css', root), 'utf8');
  assert.match(css, /\.hole\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*\.primary-button\s*\{[^}]*min-height:\s*48px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hole\.hit\s*\{[^}]*double[^}]*\}[\s\S]*\.hole\.wrong\s*\{[^}]*dashed/);
});

test('layout does not rebuild on resize or orientation events', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.doesNotMatch(source, /addEventListener\(['"](?:resize|orientationchange)['"]/);
});
