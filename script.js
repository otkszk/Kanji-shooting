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

// --- showHistory を先に定義しておく（DOMContentLoaded で参照されるため） ---
function showHistory(){
  // 履歴が取れるならテーブルを埋める
  if (typeof loadHistory === 'function' && typeof renderTable === 'function'){
    const historyArr = loadHistory() || [];
    historyArr.sort((a,b)=>a.timeMs - b.timeMs);
    const container = document.getElementById('history-table-container');
    if (container) container.innerHTML = renderTable(historyArr);
  }
  // 画面遷移（menu, historyView は DOMContentLoaded 内で設定）
  if (typeof switchScreen === 'function' && window.menu && window.historyView){
    switchScreen(window.menu, window.historyView);
  } else {
    // メニューだけでも表示できるように（安全策）
    const m = el('menu'), h = el('history');
    if (m && h) switchScreen(m, h);
  }
}

/* ------------------ DOM キャッシュとイベント登録 ------------------ */
let menu = null, game = null, result = null, historyView = null;
let playfield = null, falling = null, lineEl = null, choices = null;

document.addEventListener('DOMContentLoaded', () => {
  // cache
  menu = el('menu');
  game = el('game');
  result = el('result');
  historyView = el('history');
  playfield = el('playfield');
  falling = el('falling');
  lineEl = el('line');
  choices = el('choices');

  // 基本ボタン
  el('btn-start-from-menu')?.addEventListener('click', handleStartFromMenu);
  el('btn-show-history')?.addEventListener('click', showHistory); // now defined
  el('btn-start')?.addEventListener('click', startGameLogic);

  // 中断してメニューに戻る（ゲーム画面右上などにあるボタン）
  el('btn-quit-game')?.addEventListener('click', quitGame);

  // 結果・履歴戻り
  el('btn-result-menu')?.addEventListener('click', () => switchScreen(result, menu));
  el('btn-history-back')?.addEventListener('click', () => switchScreen(historyView, menu));

  // ゲームオーバー画面のボタン（HTML には btn-retry-over / btn-quit-over がある想定）
  el('btn-retry-over')?.addEventListener('click', ()=>{
    hideGameOver();
    retryGame();
  });
  el('btn-quit-over')?.addEventListener('click', ()=>{
    hideGameOver();
    switchScreen(game, menu);
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
    switchScreen(game, menu);
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
    if (w !== correctLabel && !wrongs.inc
