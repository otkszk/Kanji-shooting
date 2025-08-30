/* =====================
   漢字読みシューティング - script
   ===================== */

// --- 定数・状態 ---
const FILE_MAP = {
  "1nen": "01.json",
  "2nen_1": "0201.json",
  "2nen_2": "0202.json",
  "3nen_1": "0301.json",
  "3nen_2": "0302.json",
  "4nen_1": "0401.json",
  "4nen_2": "0402.json",
  "5nen_1": "0501.json",
  "5nen_2": "0502.json",
  "6nen_1": "0601.json",
  "6nen_2": "0602.json"
};
const STORAGE_KEY = 'kanjiShootingHistory';

let questionsAll = [];
let questionsInPlay = [];
let remaining = [];
let current = null;
let startTime = 0;
let timerId = null;
let totalMs = 0;
let yomikakiMode = "kanji";
let correctCount = 0;
let power = 3;
let modeType = 'fixed';

// 落下制御
let animId = null;
let fallStart = 0;
let fallDuration = 5000;
let fallingY = -80;

// DOM helper
const el = (id) => document.getElementById(id);

// DOM キャッシュ（DOMContentLoaded 後にセット）
let menu = null, game = null, result = null, historyView = null;
let playfield = null, falling = null, lineEl = null, choices = null;

/* ----------------
   ここではイベント登録の際に直接関数名を渡さず、
   クリック時に関数の存在を確認してから呼ぶようにする（安全化）。
   ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  // キャッシュ
  menu = el('menu');
  game = el('game');
  result = el('result');
  historyView = el('history');
  playfield = el('playfield');
  falling = el('falling');
  lineEl = el('line');
  choices = el('choices');

  // 「はじめから」等のボタン（クリック時に関数があれば呼ぶ）
  const btnStartFromMenu = el('btn-start-from-menu');
  if (btnStartFromMenu) btnStartFromMenu.addEventListener('click', () => {
    if (typeof handleStartFromMenu === 'function') handleStartFromMenu();
    else console.warn('handleStartFromMenu not defined');
  });

  const btnShowHistory = el('btn-show-history');
  if (btnShowHistory) btnShowHistory.addEventListener('click', () => {
    if (typeof showHistory === 'function') showHistory();
    else {
      console.warn('showHistory not defined - falling back to switch');
      if (menu && historyView) switchScreen(menu, historyView);
    }
  });

  const btnStart = el('btn-start');
  if (btnStart) btnStart.addEventListener('click', () => {
    if (typeof startGameLogic === 'function') startGameLogic();
  });

  const btnRetry = el('btn-retry');
  if (btnRetry) btnRetry.addEventListener('click', () => {
    if (typeof retryGame === 'function') retryGame();
  });

  // 「中断してメニューに戻る」ゲーム内ボタン（右上）
  const btnQuitGame = el('btn-quit-game');
  if (btnQuitGame) btnQuitGame.addEventListener('click', () => {
    if (typeof quitGame === 'function') quitGame();
    else {
      if (timerId) clearInterval(timerId);
      if (animId) cancelAnimationFrame(animId);
      if (game && menu) switchScreen(game, menu);
    }
  });

  const btnResultMenu = el('btn-result-menu');
  if (btnResultMenu) btnResultMenu.addEventListener('click', () => {
    if (result && menu) switchScreen(result, menu);
  });

  const btnHistoryBack = el('btn-history-back');
  if (btnHistoryBack) btnHistoryBack.addEventListener('click', () => {
    if (historyView && menu) switchScreen(historyView, menu);
  });

  // ゲームオーバー用ボタン（HTML で btn-retry-over / btn-quit-over を使っている前提）
  const btnRetryOver = el('btn-retry-over');
  if (btnRetryOver) btnRetryOver.addEventListener('click', () => {
    if (typeof hideGameOver === 'function') hideGameOver();
    if (typeof retryGame === 'function') retryGame();
  });

  const btnQuitOver = el('btn-quit-over');
  if (btnQuitOver) btnQuitOver.addEventListener('click', () => {
    if (typeof hideGameOver === 'function') hideGameOver();
    if (menu && game) switchScreen(game, menu);
  });
});

/* ---------------- UI / 画面切替 ---------------- */
function switchScreen(hide, show){
  if (hide) hide.style.display = 'none';
  if (show) show.style.display = 'flex';
}

/* ---- メニューから開始 ---- */
async function handleStartFromMenu(){
  const modeVal = el('mode') ? el('mode').value : '5';
  modeType = modeVal === 'all' ? 'all' : 'fixed';
  correctCount = 0;
  power = 3;
  updatePowerDisplay();

  const setKey = el('grade-set') ? el('grade-set').value : '';
  const count = parseInt(el('mode') ? el('mode').value : '5', 10);
  yomikakiMode = el('yomikaki') ? el('yomikaki').value : 'kanji';

  if (!setKey){
    await showModal('学年とセットを選んでください');
    return;
  }

  try {
    const filename = FILE_MAP[setKey] || `${setKey}.json`;
    const res = await fetch(`data/${filename}`);
    if (!res.ok) throw new Error(`${filename} の読み込みに失敗しました`);
    const data = await res.json();
    questionsAll = Array.isArray(data) ? data : [];
    if (questionsAll.length === 0) throw new Error('問題が空です');

    const shuffled = [...questionsAll].sort(()=>Math.random()-0.5);
    questionsInPlay = (modeType === 'all') ? shuffled.slice() : shuffled.slice(0, count);
    remaining = [...questionsInPlay];

    if (el('btn-start')) el('btn-start').disabled = false;
    if (el('timer')) el('timer').textContent = '0:00';
    resetFalling();

    switchScreen(menu, game);
  } catch (err) {
    console.error(err);
    await showModal(`問題データの読み込みに失敗しました\n${err.message}`);
  }
}

/* ---- ゲーム進行 ---- */
function startGameLogic(){
  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  startTime = Date.now();
  updateTimer();
  timerId = setInterval(updateTimer, 1000);

  if (el('btn-start')) el('btn-start').disabled = true;
  nextQuestion();
}

async function quitGame(){
  const ok = await showModal('ゲームを中断してメニューにもどりますか？', true);
  if (ok){
    if (timerId) clearInterval(timerId);
    if (animId) cancelAnimationFrame(animId);
    if (game && menu) switchScreen(game, menu);
  }
}

function retryGame(){
  power = 3;
  updatePowerDisplay();

  const count = parseInt(el('mode') ? el('mode').value : '5', 10);
  const shuffled = [...questionsAll].sort(()=>Math.random()-0.5);
  questionsInPlay = (modeType === 'all') ? shuffled.slice() : shuffled.slice(0, count);
  remaining = [...questionsInPlay];

  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  startTime = Date.now();
  updateTimer();
  timerId = setInterval(updateTimer, 1000);

  nextQuestion();
}

function updateTimer(){
  const ms = Date.now() - startTime;
  const m = Math.floor(ms/60000);
  const s = Math.floor((ms%60000)/1000).toString().padStart(2,'0');
  if (el('timer')) el('timer').textContent = `${m}:${s}`;
}

/* ---- 問題の流れ ---- */
function nextQuestion(){
  if (!remaining || remaining.length === 0){
    finishGame();
    return;
  }
  current = remaining.shift();
  buildChoices();
  startFalling();
}

function buildChoices(){
  if (!choices || !current) return;
  const correctLabel = yomikakiMode === 'kanji' ? current.reading : current.kanji;
  const pool = questionsAll.filter(q => q !== current);
  const shuffled = pool.sort(()=>Math.random()-0.5).slice(0, 10);
  const wrongs = [];
  for (const q of shuffled){
    const w = yomikakiMode === 'kanji' ? q.reading : q.kanji;
    if (w !== correctLabel && !wrongs.includes(w)) wrongs.push(w);
    if (wrongs.length >= 2) break;
  }
  const items = [correctLabel, ...wrongs].sort(()=>Math.random()-0.5);

  choices.innerHTML = '';
  items.forEach((label)=>{
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = label;
    btn.addEventListener('click', ()=>onChoose(btn, label === correctLabel));
    choices.appendChild(btn);
  });
}

/* ---- 選択時の挙動 ---- */
function onChoose(btn, isCorrect){
  document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  if (isCorrect){
    correctCount++;
    if (falling) falling.classList.add('falling-correct');
    playSE('pinpon');
    // 正解: ビームで当てる。正解時は falling の位置リセットをしない（ずれ防止）
    fireBeam(btn, falling, ()=>{
      stopFalling(false); // reset=false → 位置を保つ
      setTimeout(()=>{
        if (falling) falling.classList.remove('falling-correct');
        nextQuestion();
      }, 400);
    }, true, false);
  } else {
    // 不正解: ダメージ演出、落下停止、赤い跳ね返りビーム、次の問題へ
    power--;
    updatePowerDisplay();
    playSE('bu');
    btn.classList.add('incorrect');
    doc
