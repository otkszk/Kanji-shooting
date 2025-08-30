/* =====================
   漢字読みシューティング - script
   ===================== */

const FILE_MAP = {
  "1nen": "01.json","2nen_1": "0201.json","2nen_2": "0202.json",
  "3nen_1": "0301.json","3nen_2": "0302.json","4nen_1": "0401.json","4nen_2": "0402.json",
  "5nen_1": "0501.json","5nen_2": "0502.json","6nen_1": "0601.json","6nen_2": "0602.json"
};
const STORAGE_KEY = 'kanjiShootingHistory';

let questionsAll = [], questionsInPlay = [], current = null;
let startTime = 0, timerId = null;
let animId = null, fallStart = 0, fallDuration = 5000, isFalling = false;
let goalCount = 0, solvedCount = 0;
let power = 3;
let isGameActive = false;
let yomikakiMode = "kanji";

const dataUrl = new URL(`data/${filename}`, window.location.href);
    const res = await fetch(dataUrl);
const menu = el('menu'), game = el('game'), result = el('result'), historyView = el('history');
const playfield = el('playfield'), falling = el('falling'), lineEl = el('line'), choices = el('choices');
const gameover = el('gameover');

document.addEventListener('DOMContentLoaded', () => {
  el('btn-start-from-menu').addEventListener('click', handleStartFromMenu);
  el('btn-show-history').addEventListener('click', showHistory);
  el('btn-start').addEventListener('click', startGameLogic);
  el('btn-retry').addEventListener('click', retryGame);
  el('btn-quit').addEventListener('click', quitGame);
  el('btn-result-menu').addEventListener('click', () => switchScreen(result, menu));
  el('btn-history-back').addEventListener('click', () => switchScreen(historyView, menu));
  el('btn-gameover-retry').addEventListener('click', restartAfterGameover);
  el('btn-gameover-menu').addEventListener('click', () => { gameover.style.display = 'none'; switchScreen(game, menu) });
});

function switchScreen(hide, show) { hide.style.display = 'none'; show.style.display = 'flex'; }

async function handleStartFromMenu() {
  const setKey = el('grade-set').value;
  const modeVal = el('mode').value;
  yomikakiMode = el('yomikaki').value;
  const diff = parseInt(el('difficulty').value, 10);

  if (!setKey) { await showModal('学年とセットを選んでください'); return; }

  try {
    const filename = FILE_MAP[setKey] || `${setKey}.json`;
    const res = await fetch(`./data/${filename}`);
    if (!res.ok) throw new Error(`${filename} の読み込みに失敗しました`);
    const data = await res.json();
    questionsAll = Array.isArray(data) ? data : [];
    if (questionsAll.length === 0) throw new Error('問題が空です');

    if (modeVal === "all") {
      goalCount = questionsAll.length;
      questionsInPlay = questionsAll.map(q => ({ q, solved: false }));
    } else {
      const count = parseInt(modeVal, 10);
      goalCount = count;
      questionsInPlay = [...questionsAll].sort(() => Math.random() - 0.5).slice(0, count * 2).map(q => ({ q, solved: false }));
    }

    solvedCount = 0;
    power = 3;
    updatePowerDisplay();
    gameover.style.display = 'none';

    el('btn-start').disabled = false;
    el('btn-retry').disabled = true;
    el('timer').textContent = '0:00';
    resetFalling();
    choices.innerHTML = '';

    const diffMap = { 1: 1.6, 2: 1.3, 3: 1.0, 4: 0.8, 5: 0.6 };
    fallDuration = 6000 * diffMap[diff];

    switchScreen(menu, game);
  } catch (err) { console.error(err); await showModal(`問題データの読み込みに失敗しました\n${err.message}`); }
}

function startGameLogic() {
  if (isGameActive) return;
  isGameActive = true;
  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);

  startTime = Date.now();
  updateTimer();
  timerId = setInterval(updateTimer, 1000);
  el('btn-start').disabled = true;
  el('btn-retry').disabled = false;
  nextQuestion();
}

function retryGame() {
  stopGame();
  startGameLogic();
}

async function quitGame() {
  const ok = await showModal('ゲームを中断してメニューにもどりますか？', true);
  if (ok) {
    stopGame();
    switchScreen(game, menu);
  }
}

function stopGame() {
  isGameActive = false;
  if (timerId) clearInterval(timerId);
  if (animId) cancelAnimationFrame(animId);
  timerId = null;
  animId = null;
  isFalling = false;
}

function updateTimer() {
  const ms = Date.now() - startTime;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  el('timer').textContent = `${m}:${s}`;
}

function updatePowerDisplay() {
  const hearts = document.querySelectorAll('#power-display .heart');
  hearts.forEach((heart, index) => {
    heart.classList.toggle('full', index < power);
  });
}

function nextQuestion() {
  if (solvedCount >= goalCount) { finishGame(); return; }
  const unsolved = questionsInPlay.filter(e => !e.solved);
  if (unsolved.length === 0) { finishGame(); return; }

  // 選択肢の色をリセット
  Array.from(choices.children).forEach(btn => btn.className = 'choice-btn');

  current = unsolved[Math.floor(Math.random() * unsolved.length)];
  buildChoices();
  startFalling();
}

function buildChoices() {
  const correctQ = current.q;
  const correctLabel = yomikakiMode === 'kanji' ? correctQ.r : correctQ.q;
  const questionText = yomikakiMode === 'kanji' ? correctQ.q : correctQ.r;

  falling.textContent = questionText;

  let options = [correctLabel];
  const distractors = questionsAll
    .filter(q => (yomikakiMode === 'kanji' ? q.r : q.q) !== correctLabel)
    .sort(() => 0.5 - Math.random())
    .slice(0, 2);

  distractors.forEach(d => options.push(yomikakiMode === 'kanji' ? d.r : d.q));
  options.sort(() => 0.5 - Math.random());

  choices.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => handleChoice(btn, opt === correctLabel));
    choices.appendChild(btn);
  });
}

function handleChoice(btn, isCorrect) {
  if (!isFalling || !isGameActive) return;

  btn.classList.add('active');
  createBeam(btn.offsetLeft + btn.offsetWidth / 2, isCorrect);

  if (isCorrect) {
    handleCorrectAnswer();
  } else {
    btn.classList.add('incorrect');
    choices.childNodes.forEach(child => child.classList.add('incorrect'));
    setTimeout(() => {
        choices.childNodes.forEach(child => child.classList.remove('incorrect'));
    }, 350);
    handleIncorrectAnswer();
  }
}

function handleCorrectAnswer() {
    isFalling = false;
    cancelAnimationFrame(animId);
    solvedCount++;
    const currentQuestionRef = questionsInPlay.find(item => item.q === current.q);
    if(currentQuestionRef) currentQuestionRef.solved = true;

    falling.classList.add('glow-hit');

    setTimeout(() => {
        resetFalling();
        if (isGameActive) nextQuestion();
    }, 500);
}

function handleIncorrectAnswer(isFall = false) {
    if (!isGameActive) return;
    power--;
    updatePowerDisplay();

    if (!isFall) { // ビームでの不正解
        // エフェクトは handleChoice で実行
    } else { // 落下での不正解
        isFalling = false;
        cancelAnimationFrame(animId);
        setTimeout(() => {
            resetFalling();
            if (isGameActive) nextQuestion();
        }, 500);
    }

    if (power <= 0) {
        handleGameOver();
    }
}


function startFalling() {
  resetFalling();
  fallStart = Date.now();
  isFalling = true;
  fallLoop();
}

function resetFalling() {
  falling.style.top = '-80px';
  falling.style.opacity = '1';
  falling.className = '';
  isFalling = false;
  if (animId) cancelAnimationFrame(animId);
}

function fallLoop() {
  if (!isFalling) return;

  const elapsed = Date.now() - fallStart;
  const progress = elapsed / fallDuration;
  const playfieldHeight = playfield.clientHeight;
  const newY = -80 + (playfieldHeight + 20) * progress;
  falling.style.top = `${newY}px`;

  if (newY > lineEl.offsetTop - falling.offsetHeight / 2) {
    handleIncorrectAnswer(true); // 落下による不正解
    // ここでは solvedCount をインクリメントしない
    return;
  }
  animId = requestAnimationFrame(fallLoop);
}

function createBeam(startX, isCorrect) {
  const beam = document.createElement('div');
  beam.className = 'beam';
  if (!isCorrect) beam.classList.add('red');

  const playfieldRect = playfield.getBoundingClientRect();
  const fallingRect = falling.getBoundingClientRect();
  const endX = fallingRect.left - playfieldRect.left + fallingRect.width / 2;
  const endY = fallingRect.top - playfieldRect.top + fallingRect.height / 2;
  const startY = playfield.clientHeight;

  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
  const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

  beam.style.left = `${startX}px`;
  beam.style.bottom = `0px`;
  beam.style.width = `${distance}px`;
  beam.style.transform = `rotate(${angle}deg)`;

  playfield.appendChild(beam);
  setTimeout(() => beam.remove(), 300);
}

function handleGameOver() {
  stopGame();
  gameover.style.display = 'flex';
}

function restartAfterGameover() {
    gameover.style.display = 'none';
    power = 3;
    updatePowerDisplay();
    solvedCount = 0;
    questionsInPlay.forEach(q => q.solved = false);
    startGameLogic();
}


function finishGame() {
    stopGame();
    // ここに結果表示のロジックを実装します。
    // 例: switchScreen(game, result);
    alert(`クリア！タイム: ${el('timer').textContent}`);
    switchScreen(game, menu); // とりあえずメニューに戻る
}

// 履歴やモーダルの関数 (元のコードにあると仮定)
function showHistory() { alert('履歴機能は準備中です。'); }
function showModal(message, showCancel = false) {
    return new Promise(resolve => {
        el('modal-message').textContent = message;
        el('modal-cancel').style.display = showCancel ? 'inline-block' : 'none';
        el('modal').style.display = 'flex';
        el('modal-ok').onclick = () => { el('modal').style.display = 'none'; resolve(true); };
        el('modal-cancel').onclick = () => { el('modal').style.display = 'none'; resolve(false); };
    });
}


