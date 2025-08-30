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
    // 正解: ビームで当てる。正解時は falling の位置リセットをしない
    fireBeam(btn, falling, ()=>{
      stopFalling(false); // reset=false → 位置を保つ（ずれ防止）
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
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.add('damage'));

    // 停止してから赤いビームを返す（from = falling, to = btn）
    stopFalling(true);
    fireBeam(falling, btn, ()=>{
      setTimeout(()=>{
        btn.classList.remove('incorrect');
        document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('damage'));
        if (power <= 0){
          showGameOver();
        } else {
          nextQuestion();
        }
      }, 400);
    }, false, true); // isCorrect=false, isReturn=true -> red beam
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
    } else {
      // time up: ダメージして次へ
      power--;
      updatePowerDisplay();
      playSE('bu');
      stopFalling(true);
      if (power <= 0){
        showGameOver();
      } else {
        setTimeout(()=> nextQuestion(), 250);
      }
    }
  }
}

function stopFalling(reset = true){
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  if (reset) resetFalling();
}

/* ---- ビーム演出 ----
   fireBeam(fromEl, toEl, onEnd, isCorrect=true, isReturn=false)
   - fromEl / toEl は DOM 要素（ボタン or falling の要素）
   - isCorrect は正解時かどうか（今は visual の違いには使わない）
   - isReturn が true のとき赤いビームにする（不正解で跳ね返る）
*/
function fireBeam(fromEl, toEl, onEnd, isCorrect = true, isReturn = false){
  if (!fromEl || !toEl){ if (onEnd) onEnd(); return; }
  const fromRect = fromEl.getBoundingClientRect();
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
  beam.style.position = 'fixed';
  beam.style.transformOrigin = '0 50%';
  beam.style.left = `${x1}px`;
  beam.style.top = `${y1}px`;
  beam.style.width = `0px`;
  beam.style.height = '6px';
  beam.style.transform = `rotate(${angle}deg)`;
  beam.style.background = isReturn ? 'red' : 'cyan';
  beam.style.zIndex = 9999;
  document.body.appendChild(beam);

  const start = performance.now();
  const duration = 160;
  function grow(now){
    const t = Math.min(1, (now - start) / duration);
    beam.style.width = `${len * t}px`;
    if (t < 1){
      requestAnimationFrame(grow);
    } else {
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
  if (el('final-time')) el('final-time').textContent = `タイム: ${formatMs(totalMs)}`;

  makeResultTable();
  switchScreen(game, result);
}

function formatMs(ms){
  const m = Math.floor(ms/60000);
  const s = Math.floor((ms%60000)/1000).toString().padStart(2,'0');
  return `${m}:${s}`;
}

function buildCurrentRecord(){
  const setLabel = el('grade-set') ? el('grade-set').options[el('grade-set').selectedIndex].text : '';
  const yomikakiLabel = el('yomikaki') ? (el('yomikaki').value === 'kanji' ? 'かんじ' : 'よみがな') : '';
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return { date: dateStr, yomikaki: yomikakiLabel, gradeSet: setLabel, timeMs: totalMs };
}

function loadHistory(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveHistory(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

function makeResultTable(){
  const rec = buildCurrentRecord();
  const history = loadHistory();
  const merged = [rec, ...history];
  merged.sort((a,b)=>a.timeMs - b.timeMs);
  const top10 = merged.slice(0,10);
  saveHistory(top10);
  const html = renderTable(top10);
  const container = el('result-table-container');
  if (container) container.innerHTML = html;
}

function renderTable(rows){
  if (!rows || rows.length === 0) return '<p>まだ記録がありません。</p>';
  const tr = rows.map((r,i)=>{
    return `<tr><td>${i+1}</td><td>${r.date}</td><td>${r.yomikaki}</td><td>${r.gradeSet}</td><td>${formatMs(r.timeMs)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>順位</th><th>日付</th><th>読み書き</th><th>学年とセット</th><th>タイム</th></tr></thead><tbody>${tr}</tbody></table></div>`;
}

/* ---- 効果音 ---- */
function playSE(name){
  try{ new Audio(`sounds/${name}.mp3`).play(); }catch{}
}

/* ---- パワー表示 ---- */
function updatePowerDisplay(){
  const RED_HEART = "\u2764\uFE0F"; // ❤️
  const WHITE = "\u2661"; // ♡ as empty heart
  for (let i = 1; i <= 3; i++){
    const h = el(`heart${i}`);
    if (!h) continue;
    h.textContent = (i <= power) ? RED_HEART : WHITE;
    if (i <= power) h.classList.remove('empty-heart'); else h.classList.add('empty-heart');
  }
}

/* ---- ゲームオーバー ---- */
function showGameOver(){
  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  const go = el('game-over');
  if (!go) return;
  go.style.display = 'flex';
  go.style.color = 'white';
  go.style.flexDirection = 'column';
  go.style.alignItems = 'center';

  const btnWrap = el('game-over-buttons');
  if (btnWrap){
    btnWrap.style.display = 'flex';
    btnWrap.style.flexDirection = 'row';
    btnWrap.style.justifyContent = 'center';
    btnWrap.style.gap = '20px';
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
