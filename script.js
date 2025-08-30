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

let questionsAll = [];        // 全問題（{kanji, reading}）
let questionsInPlay = [];     // 今回分
let remaining = [];           // 残り
let current = null;           // 現在の問題オブジェクト
let startTime = 0;
let timerId = null;
let totalMs = 0;
let yomikakiMode = "kanji";   // 'kanji' or 'reading'
let correctCount = 0;
let power = 3;
let modeType = 'fixed'; // 'fixed' or 'all'

// 落下制御
let animId = null;
let fallStart = 0;
let fallDuration = 5000;      // 1問の落下時間(ms)
let fallingY = -80;

// DOM helper
const el = (id)=>document.getElementById(id);

// Elements (may be null until DOMContentLoaded)
let menu = null;
let game = null;
let result = null;
let historyView = null;
let playfield = null;
let falling = null;
let lineEl = null;
let choices = null;

document.addEventListener('DOMContentLoaded', () => {
  // cache elements after DOM loaded
  menu = el('menu');
  game = el('game');
  result = el('result');
  historyView = el('history');
  playfield = el('playfield');
  falling = el('falling');
  lineEl = el('line');
  choices = el('choices');

  // main UI buttons
  el('btn-start-from-menu')?.addEventListener('click', handleStartFromMenu);
  el('btn-show-history')?.addEventListener('click', showHistory);
  el('btn-start')?.addEventListener('click', startGameLogic);
  el('btn-retry')?.addEventListener('click', retryGame);
  el('btn-quit')?.addEventListener('click', quitGame);
  el('btn-result-menu')?.addEventListener('click', () => switchScreen(result, menu));
  el('btn-history-back')?.addEventListener('click', () => switchScreen(historyView, menu));

  // Game-over buttons: support both _over IDs and plain IDs so HTML can use either
  const retryIds = ['btn-retry-over','btn-retry'];
  const quitIds  = ['btn-quit-over','btn-quit'];
  retryIds.forEach(id=>{
    const b = el(id);
    if (b) b.addEventListener('click', ()=>{ hideGameOver(); retryGame(); });
  });
  quitIds.forEach(id=>{
    const b = el(id);
    if (b) b.addEventListener('click', ()=>{ hideGameOver(); switchScreen(game, menu); });
  });
});

/* ---------------- UI / Screen ---------------- */
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
  const count = parseInt(el('mode') ? el('mode').value : '5',10);
  yomikakiMode = el('yomikaki') ? el('yomikaki').value : 'kanji';

  if (!setKey){
    await showModal('学年とセットを選んでください');
    return;
  }

  try{
    const filename = FILE_MAP[setKey] || `${setKey}.json`;
    const res = await fetch(`data/${filename}`);
    if (!res.ok) throw new Error(`${filename} の読み込みに失敗しました`);
    const data = await res.json();
    questionsAll = Array.isArray(data) ? data : [];
    if (questionsAll.length === 0) throw new Error('問題が空です');

    // ランダムに count 件を選ぶ（固定モード）
    const shuffled = [...questionsAll].sort(()=>Math.random()-0.5);
    questionsInPlay = (modeType === 'all') ? shuffled.slice() : shuffled.slice(0, count);
    remaining = [...questionsInPlay];

    // UI初期化
    if (el('btn-start')) el('btn-start').disabled = false;
    if (el('btn-retry')) el('btn-retry').disabled = true;
    if (el('timer')) el('timer').textContent = '0:00';
    resetFalling();

    // 画面遷移
    switchScreen(menu, game);
  }catch(err){
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
  if (el('btn-retry')) el('btn-retry').disabled = false;

  nextQuestion();
}

function retryGame(){
  // reset power and UI for a fresh start
  power = 3;
  updatePowerDisplay();

  const count = parseInt(el('mode') ? el('mode').value : '5',10);
  const shuffled = [...questionsAll].sort(()=>Math.random()-0.5);
  questionsInPlay = (modeType === 'all') ? shuffled.slice() : shuffled.slice(0, count);
  remaining = [...questionsInPlay];

  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  startTime = Date.now();
  updateTimer();
  timerId = setInterval(updateTimer, 1000);

  if (el('btn-start')) el('btn-start').disabled = true;
  if (el('btn-retry')) el('btn-retry').disabled = false;

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

function updateTimer(){
  const ms = Date.now() - startTime;
  const m = Math.floor(ms/60000);
  const s = Math.floor((ms%60000)/1000).toString().padStart(2,'0');
  if (el('timer')) el('timer').textContent = `${m}:${s}`;
}

/* ---- 問題の流れ ---- */
function nextQuestion(){
  if (!remaining || remaining.length===0){
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
    fireBeam(btn, falling, ()=>{
      stopFalling();
      setTimeout(()=>{
        if (falling) falling.classList.remove('falling-correct');
        nextQuestion();
      }, 400);
    });
  }else{
    // wrong: reduce power, stop falling, show damage, then next question or game over
    power--;
    updatePowerDisplay();
    playSE('bu');
    btn.classList.add('incorrect');
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.add('damage'));

    // immediately stop the falling text
    stopFalling();

    setTimeout(()=>{
      btn.classList.remove('incorrect');
      document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('damage'));

      if (power <= 0){
        showGameOver();
      } else {
        nextQuestion();
      }
    }, 400);
  }
}

/* ---- 落下アニメーション ---- */
function resetFalling(){
  if (!falling) return;
  falling.textContent = '';
  falling.style.top = '-80px';
  fallingY = -80;
}

function startFalling(){
  if (!falling || !playfield || !current) return;
  falling.textContent = yomikakiMode === 'kanji' ? current.kanji : current.reading;
  fallingY = -80;
  fallStart = performance.now();
  const diffEl = el('difficulty');
  const difficulty = diffEl ? parseInt(diffEl.value) : 3;
  fallDuration = 6000 - difficulty * 1000;

  animId = requestAnimationFrame(step);
  function step(now){
    const t = Math.min(1, (now - fallStart) / fallDuration);
    const fieldH = playfield.clientHeight;
    const targetY = fieldH - 160;
    fallingY = -80 + (targetY + 80) * t;
    falling.style.top = `${fallingY}px`;

    if (t < 1){
      animId = requestAnimationFrame(step);
    }else{
      // time up: reduce power and either game over or next
      power--;
      updatePowerDisplay();
      playSE('bu');
      stopFalling();

      if (power <= 0){
        showGameOver();
      } else {
        setTimeout(()=> nextQuestion(), 250);
      }
    }
  }
}

function stopFalling(){
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  resetFalling();
}

/* ---- ビーム演出 ---- */
function fireBeam(fromBtn, toEl, onEnd){
  if (!fromBtn || !toEl){ if (onEnd) onEnd(); return; }
  const fromRect = fromBtn.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const x1 = fromRect.left + fromRect.width/2;
  const y1 = fromRect.top + fromRect.height/2;
  const x2 = toRect.left + toRect.width/2;
  const y2 = toRect.top + toRect.height/2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  const beam = document.createElement('div');
  beam.className = 'beam';
  beam.style.left = `${x1}px`;
  beam.style.top = `${y1}px`;
  beam.style.width = `0px`;
  beam.style.transform = `rotate(${angle}deg)`;
  document.body.appendChild(beam);

  let start = performance.now();
  const duration = 160;
  function grow(now){
    const t = Math.min(1, (now - start) / duration);
    beam.style.width = `${len * t}px`;
    if (t < 1){
      requestAnimationFrame(grow);
    }else{
      setTimeout(()=>{
        beam.remove();
        if (onEnd) onEnd();
      }, 80);
    }
  }
  requestAnimationFrame(grow);
}

/* ---- 終了と記録 ---- */
function finishGame(){
  if (timerId) clearInterval(timerId);
  totalMs = Date.now() - startTime;

  const m = Math.floor(totalMs/60000);
  const s = Math.floor((totalMs%60000)/1000).toString().padStart(2,'0');
  if (el('final-time')) el('final-time').textContent = `タイム: ${m}:${s}`;

  makeResultTable();
  switchScreen(game, result);
}

function buildCurrentRecord(){
  const setLabel = el('grade-set').options[el('grade-set').selectedIndex].text;
  const yomikakiLabel = el('yomikaki').value === 'kanji' ? 'かんじ' : 'よみがな';
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return { date: dateStr, yomikaki: yomikakiLabel, gradeSet: setLabel, timeMs: totalMs };
}

function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }catch{ return []; }
}
function saveHistory(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

function makeResultTable(){
  const rec = buildCurrentRecord();
  const history = loadHistory();
  const merged = [rec, ...history];
  merged.sort((a,b)=>a.timeMs-b.timeMs);
  const top10 = merged.slice(0,10);
  saveHistory(top10);

  const html = renderTable(top10);
  const resultContainer = el('result-table-container');
  if (resultContainer) resultContainer.innerHTML = html;
}

function showHistory(){
  const history = loadHistory();
  history.sort((a,b)=>a.timeMs-b.timeMs);
  const histEl = el('history-table-container');
  if (histEl) histEl.innerHTML = renderTable(history);
  switchScreen(menu, historyView);
}

function renderTable(rows){
  if (!rows || rows.length===0) return '<p>まだ記録がありません。</p>';
  const tr = rows.map((r,i)=>{
    const m = Math.floor(r.timeMs/60000);
    const s = Math.floor((r.timeMs%60000)/1000).toString().padStart(2,'0');
    return `<tr><td>${i+1}</td><td>${r.date}</td><td>${r.yomikaki}</td><td>${r.gradeSet}</td><td>${m}:${s}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>順位</th><th>日付</th><th>読み書き</th><th>学年とセット</th><th>タイム</th></tr></thead><tbody>${tr}</tbody></table></div>`;
}

/* ---- 効果音 ---- */
function playSE(name){
  try{ new Audio(`sounds/${name}.mp3`).play(); }catch{}
}

/* ---- パワー表示 ---- */
function updatePowerDisplay(){
  const RED_HEART = "\u2764\uFE0F";
  const WHITE_HEART = "\u2661";
  for (let i = 1; i <= 3; i++){
    const heart = el(`heart${i}`);
    if (!heart) continue;
    if (i <= power){
      heart.classList.remove('empty-heart');
      heart.textContent = RED_HEART;
    }else{
      heart.classList.add('empty-heart');
      heart.textContent = WHITE_HEART;
    }
  }
}

/* ---- ゲームオーバー ---- */
function showGameOver(){
  // stop timers/animation
  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  const go = el('game-over');
  if (!go) return;
  // overlay styling & visible
  go.style.display = 'flex';
  go.style.color = 'white';
  go.style.flexDirection = 'column';
  go.style.alignItems = 'center';
  // make button container horizontal if exists
  const btnWrap = el('game-over-buttons');
  if (btnWrap){
    btnWrap.style.display = 'flex';
    btnWrap.style.flexDirection = 'row';
    btnWrap.style.justifyContent = 'center';
    btnWrap.style.gap = '16px';
  }
}

function hideGameOver(){
  const go = el('game-over');
  if (go) go.style.display = 'none';
}

/* ---- モーダル ---- */
function showModal(message, withCancel=false){
  const modal = el('modal');
  const ok = el('modal-ok');
  const cancel = el('modal-cancel');
  const msgEl = el('modal-message');
  if (msgEl) msgEl.textContent = message;
  if (cancel) cancel.style.display = withCancel ? 'inline-block' : 'none';
  if (modal) modal.style.display = 'flex';
  return new Promise(resolve=>{
    const close = (val)=>{ if (modal) modal.style.display='none'; if (ok) ok.onclick=null; if (cancel) cancel.onclick=null; resolve(val); };
    if (ok) ok.onclick = ()=>close(true);
    if (cancel) cancel.onclick = ()=>close(false);
  });
}
