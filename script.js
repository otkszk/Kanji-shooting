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

// DOM
const el = (id)=>document.getElementById(id);
const menu = el('menu');
const game = el('game');
const result = el('result');
const historyView = el('history');
const playfield = el('playfield');
const falling = el('falling');
const lineEl = el('line');
const choices = el('choices');

document.addEventListener('DOMContentLoaded', () => {
  el('btn-start-from-menu')?.addEventListener('click', handleStartFromMenu);
  el('btn-show-history')?.addEventListener('click', showHistory);
  el('btn-start')?.addEventListener('click', startGameLogic);
  el('btn-retry')?.addEventListener('click', retryGame);
  el('btn-quit')?.addEventListener('click', quitGame);
  el('btn-result-menu')?.addEventListener('click', () => switchScreen(result, menu));
  el('btn-history-back')?.addEventListener('click', () => switchScreen(historyView, menu));

  // ゲームオーバー用ボタン
  el('btn-retry-over')?.addEventListener('click', ()=>{
    hideGameOver();
    retryGame();
  });
  el('btn-quit-over')?.addEventListener('click', ()=>{
    hideGameOver();
    switchScreen(game, menu);
  });
});

function switchScreen(hide, show){
  hide.style.display = 'none';
  show.style.display = 'flex';
}

/* ---- メニューから開始 ---- */
async function handleStartFromMenu(){
  const modeVal = el('mode').value;
  modeType = modeVal === 'all' ? 'all' : 'fixed';
  correctCount = 0;
  power = 3;
  updatePowerDisplay();

  const setKey = el('grade-set').value;
  const count = parseInt(el('mode').value,10);
  yomikakiMode = el('yomikaki').value;

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

    const shuffled = [...questionsAll].sort(()=>Math.random()-0.5);
    questionsInPlay = shuffled.slice(0, count);
    remaining = [...questionsInPlay];

    el('btn-start').disabled = false;
    el('btn-retry').disabled = true;
    el('timer').textContent = '0:00';
    resetFalling();

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

  el('btn-start').disabled = true;
  el('btn-retry').disabled = false;

  nextQuestion();
}

function retryGame(){
  const count = parseInt(el('mode').value,10);
  const shuffled = [...questionsAll].sort(()=>Math.random()-0.5);
  questionsInPlay = shuffled.slice(0, count);
  remaining = [...questionsInPlay];

  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  startTime = Date.now();
  updateTimer();
  timerId = setInterval(updateTimer, 1000);

  el('btn-start').disabled = true;
  el('btn-retry').disabled = false;

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
  el('timer').textContent = `${m}:${s}`;
}

function nextQuestion(){
  if (remaining.length===0){
    finishGame();
    return;
  }
  current = remaining.shift();
  buildChoices();
  startFalling();
}

function buildChoices(){
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

function onChoose(btn, isCorrect){
  document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  if (isCorrect){
    correctCount++;
    falling.classList.add('falling-correct');
    playSE('pinpon');
    fireBeam(btn, falling, ()=>{
      stopFalling();
      setTimeout(()=>{
        falling.classList.remove('falling-correct');
        nextQuestion();
      }, 400);
    });
  }else{
    power--;
    updatePowerDisplay();
    playSE('bu');
    btn.classList.add('incorrect');
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.add('damage'));
    setTimeout(()=>{
      btn.classList.remove('incorrect');
      document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('damage'));
    }, 400);
    if (power <= 0){
      stopFalling();
      showGameOver();
    }
  }
}

/* ---- 落下アニメーション ---- */
function resetFalling(){
  falling.textContent = '';
  falling.style.top = '-80px';
  fallingY = -80;
}

function startFalling(){
  falling.textContent = yomikakiMode === 'kanji' ? current.kanji : current.reading;
  fallingY = -80;
  fallStart = performance.now();
  const difficulty = parseInt(document.getElementById('difficulty').value);
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
  el('final-time').textContent = `タイム: ${m}:${s}`;

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
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }catch{ return []; }
}

function saveHistory(arr){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function makeResultTable(){
  const rec = buildCurrentRecord();
  const history = loadHistory();
  const merged = [rec, ...history];
  merged.sort((a,b)=>a.timeMs-b.timeMs);
  const top10 = merged.slice(0,10);
  saveHistory(top10);

  const html = renderTable(top10);
  document.getElementById('result-table-container').innerHTML = html;
}

function showHistory(){
  const history = loadHistory();
  history.sort((a,b)=>a.timeMs-b.timeMs);
  document.getElementById('history-table-container').innerHTML = renderTable(history);
  switchScreen(menu, historyView);
}

function renderTable(rows){
  if (!rows || rows.length===0){
    return '<p>まだ記録がありません。</p>';
  }
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
    const heart = document.getElementById(`heart${i}`);
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
  const go = document.getElementById('game-over');
  if (go){
    go.style.display = 'flex';
    go.style.color = 'white';   // 文字を白に
    go.style.flexDirection = 'column';
    go.style.alignItems = 'center';
  }
  // ボタンを横並び
  const btnWrap = document.getElementById('game-over-buttons');
  if (btnWrap){
    btnWrap.style.display = 'flex';
    btnWrap.style.flexDirection = 'row';
    btnWrap.style.justifyContent = 'center';
    btnWrap.style.gap = '20px';
  }
}

function hideGameOver(){
  const go = document.getElementById('game-over');
  if (go) go.style.display = 'none';
}

/* ---- モーダル ---- */
function showModal(message, withCancel=false){
  const modal = document.getElementById('modal');
  const ok = document.getElementById('modal-ok');
  const cancel = document.getElementById('modal-cancel');
  document.getElementById('modal-message').textContent = message;
  cancel.style.display = withCancel ? 'inline-block' : 'none';
  modal.style.display = 'flex';
  return new Promise(resolve=>{
    const close = (val)=>{ modal.style.display='none'; ok.onclick=null; cancel.onclick=null; resolve(val); };
    ok.onclick = ()=>close(true);
    cancel.onclick = ()=>close(false);
  });
}
