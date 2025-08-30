/* =====================
   漢字読みシューティング - script
   ===================== */

const FILE_MAP = {
  "1nen": "01.json","2nen_1": "0201.json","2nen_2": "0202.json",
  "3nen_1": "0301.json","3nen_2": "0302.json","4nen_1": "0401.json","4nen_2": "0402.json",
  "5nen_1": "0501.json","5nen_2": "0502.json","6nen_1": "0601.json","6nen_2": "0602.json"
};
const STORAGE_KEY = 'kanjiShootingHistory';

let questionsAll=[],questionsInPlay=[],remaining=[],current=null;
let startTime=0,timerId=null,totalMs=0,yomikakiMode="kanji";
let animId=null,fallStart=0,fallDuration=5000,fallingY=-80;
let goalCount=0,solvedCount=0;
let power=3;

const el=(id)=>document.getElementById(id);
const menu=el('menu'),game=el('game'),result=el('result'),historyView=el('history');
const playfield=el('playfield'),falling=el('falling'),lineEl=el('line'),choices=el('choices');
const gameover=el('gameover');

document.addEventListener('DOMContentLoaded',()=>{
  el('btn-start-from-menu').addEventListener('click',handleStartFromMenu);
  el('btn-show-history').addEventListener('click',showHistory);
  el('btn-start').addEventListener('click',startGameLogic);
  el('btn-retry').addEventListener('click',retryGame);
  el('btn-quit').addEventListener('click',quitGame);
  el('btn-result-menu').addEventListener('click',()=>switchScreen(result,menu));
  el('btn-history-back').addEventListener('click',()=>switchScreen(historyView,menu));
  el('btn-gameover-retry').addEventListener('click',()=>restartAfterGameover());
  el('btn-gameover-menu').addEventListener('click',()=>{gameover.style.display='none';switchScreen(game,menu)});
});

function switchScreen(hide,show){hide.style.display='none';show.style.display='flex';}

/* ---- メニューから開始 ---- */
async function handleStartFromMenu(){
  const setKey=el('grade-set').value;
  const modeVal=el('mode').value;
  yomikakiMode=el('yomikaki').value;
  const diff=parseInt(el('difficulty').value,10);

  if(!setKey){await showModal('学年とセットを選んでください');return;}

  try{
    const filename=FILE_MAP[setKey]||`${setKey}.json`;
    const res=await fetch(`data/${filename}`);
    if(!res.ok)throw new Error(`${filename} の読み込みに失敗しました`);
    const data=await res.json();
    questionsAll=Array.isArray(data)?data:[];
    if(questionsAll.length===0)throw new Error('問題が空です');

    if(modeVal==="all"){goalCount=questionsAll.length;questionsInPlay=questionsAll.map(q=>({q,solved:false}));}
    else{const count=parseInt(modeVal,10);goalCount=count;questionsInPlay=[...questionsAll].sort(()=>Math.random()-0.5).slice(0,count*2).map(q=>({q,solved:false}));}

    solvedCount=0;power=3;updatePowerDisplay();

    el('btn-start').disabled=false;el('btn-retry').disabled=true;
    document.getElementById('timer').textContent='0:00';resetFalling();

    const diffMap={1:1.6,2:1.3,3:1.0,4:0.8,5:0.6};
    fallDuration=5000*diffMap[diff];

    switchScreen(menu,game);
  }catch(err){console.error(err);await showModal(`問題データの読み込みに失敗しました\n${err.message}`);}
}

/* ---- ゲーム進行 ---- */
function startGameLogic(){if(timerId)clearInterval(timerId);if(animId)cancelAnimationFrame(animId);
  startTime=Date.now();updateTimer();timerId=setInterval(updateTimer,1000);
  el('btn-start').disabled=true;el('btn-retry').disabled=false;nextQuestion();}
function retryGame(){handleStartFromMenu();}
async function quitGame(){const ok=await showModal('ゲームを中断してメニューにもどりますか？',true);if(ok){if(timerId)clearInterval(timerId);if(animId)cancelAnimationFrame(animId);switchScreen(game,menu);}}

function updateTimer(){const ms=Date.now()-startTime;const m=Math.floor(ms/60000);const s=Math.floor((ms%60000)/1000).toString().padStart(2,'0');el('timer').textContent=`${m}:${s}`;}

function nextQuestion(){
  if(solvedCount>=goalCount){finishGame();return;}
  const unsolved=questionsInPlay.filter(e=>!e.solved);if(unsolved.length===0){finishGame();return;}
  current=unsolved[Math.floor(Math.random()*unsolved.length)];buildChoices();startFalling();
}
function buildChoices(){const correctLabel=yom
