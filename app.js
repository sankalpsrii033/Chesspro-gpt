// ═══════════════════════════════════════════════════════
// CHESS ENGINE — Full implementation
// ═══════════════════════════════════════════════════════

const PIECES = {
  wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',
  bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'
};

let board, turn, selected, legalMoves, gameOver, moveHistory, capturedW, capturedB;
let enPassant, castleRights, lastFrom, lastTo, currentElo;

function initBoard() {
  board = Array(64).fill(null);
  const backRank = ['R','N','B','Q','K','B','N','R'];
  for(let i=0;i<8;i++){
    board[i] = 'b'+backRank[i];
    board[8+i] = 'bP';
    board[48+i] = 'wP';
    board[56+i] = 'w'+backRank[i];
  }
  turn = 'w'; selected = null; legalMoves = []; gameOver = false;
  moveHistory = []; capturedW = []; capturedB = [];
  enPassant = -1; castleRights = {wK:true,wQ:true,bK:true,bQ:true};
  lastFrom = -1; lastTo = -1;
}

function startGame() {
  currentElo = parseInt(document.getElementById('elo-slider').value);
  initBoard();
  renderBoard();
  updateStatus();
  updateMoveList();
  document.getElementById('cap-white').textContent='';
  document.getElementById('cap-black').textContent='';
}

const idx = (r,c) => r*8+c;
const row = i => Math.floor(i/8);
const col = i => i%8;
const color = p => p ? p[0] : null;
const opp = c => c==='w'?'b':'w';

// ── Move Generation ──────────────────────────────────

function getMoves(b, pos, ep, cr) {
  const p = b[pos]; if(!p) return [];
  const c = color(p), type = p[1];
  const r=row(pos), f=col(pos);
  const moves = [];

  const add = (to) => {
    if(to<0||to>63) return;
    if(color(b[to])===c) return;
    moves.push({from:pos,to,special:''});
  };

  const slide = (dr,dc) => {
    for(let i=1;i<8;i++){
      const nr=r+dr*i, nc=f+dc*i;
      if(nr<0||nr>7||nc<0||nc>7) break;
      const ni=idx(nr,nc);
      if(color(b[ni])===c) break;
      moves.push({from:pos,to:ni,special:''});
      if(b[ni]) break;
    }
  };

  if(type==='P'){
    const dir=c==='w'?-1:1, start=c==='w'?6:1, promo=c==='w'?0:7;
    const fwd=idx(r+dir,f);
    if(!b[fwd]){
      if(row(fwd)===promo) ['Q','R','B','N'].forEach(pt=>moves.push({from:pos,to:fwd,special:'promo'+pt}));
      else {
        moves.push({from:pos,to:fwd,special:''});
        if(r===start&&!b[idx(r+dir*2,f)]) moves.push({from:pos,to:idx(r+dir*2,f),special:'dp'});
      }
    }
    [-1,1].forEach(dc=>{
      const nc=f+dc; if(nc<0||nc>7) return;
      const cto=idx(r+dir,nc);
      if(b[cto]&&color(b[cto])===opp(c)){
        if(row(cto)===promo) ['Q','R','B','N'].forEach(pt=>moves.push({from:pos,to:cto,special:'promo'+pt}));
        else moves.push({from:pos,to:cto,special:''});
      }
      if(cto===ep) moves.push({from:pos,to:cto,special:'ep'});
    });
  }

  if(type==='N') [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>{
    const nr=r+dr,nc=f+dc;
    if(nr>=0&&nr<8&&nc>=0&&nc<8) add(idx(nr,nc));
  });

  if(type==='B'||type==='Q') [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc])=>slide(dr,dc));
  if(type==='R'||type==='Q') [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>slide(dr,dc));

  if(type==='K'){
    [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{
      const nr=r+dr,nc=f+dc;
      if(nr>=0&&nr<8&&nc>=0&&nc<8) add(idx(nr,nc));
    });
    if(cr){
      if(c==='w'&&r===7&&cr.wK&&!b[idx(7,5)]&&!b[idx(7,6)]&&!isAttacked(b,idx(7,4),'b')&&!isAttacked(b,idx(7,5),'b')&&!isAttacked(b,idx(7,6),'b'))
        moves.push({from:pos,to:idx(7,6),special:'castle'});
      if(c==='w'&&r===7&&cr.wQ&&!b[idx(7,3)]&&!b[idx(7,2)]&&!b[idx(7,1)]&&!isAttacked(b,idx(7,4),'b')&&!isAttacked(b,idx(7,3),'b')&&!isAttacked(b,idx(7,2),'b'))
        moves.push({from:pos,to:idx(7,2),special:'castle'});
      if(c==='b'&&r===0&&cr.bK&&!b[idx(0,5)]&&!b[idx(0,6)]&&!isAttacked(b,idx(0,4),'w')&&!isAttacked(b,idx(0,5),'w')&&!isAttacked(b,idx(0,6),'w'))
        moves.push({from:pos,to:idx(0,6),special:'castle'});
      if(c==='b'&&r===0&&cr.bQ&&!b[idx(0,3)]&&!b[idx(0,2)]&&!b[idx(0,1)]&&!isAttacked(b,idx(0,4),'w')&&!isAttacked(b,idx(0,3),'w')&&!isAttacked(b,idx(0,2),'w'))
        moves.push({from:pos,to:idx(0,2),special:'castle'});
    }
  }
  return moves;
}

function isAttacked(b, sq, byColor) {
  for(let i=0;i<64;i++){
    if(color(b[i])!==byColor) continue;
    if(getMoves(b,i,-1,null).some(m=>m.to===sq)) return true;
  }
  return false;
}

function findKing(b, c) { return b.findIndex(p=>p===c+'K'); }

function applyMove(b, m, epRef, crRef) {
  const nb=[...b];
  const p=nb[m.from], c=color(p);

  if(m.special==='castle'){
    nb[m.to]=nb[m.from]; nb[m.from]=null;
    if(m.to===idx(7,6)){nb[idx(7,5)]=nb[idx(7,7)];nb[idx(7,7)]=null;}
    else if(m.to===idx(7,2)){nb[idx(7,3)]=nb[idx(7,0)];nb[idx(7,0)]=null;}
    else if(m.to===idx(0,6)){nb[idx(0,5)]=nb[idx(0,7)];nb[idx(0,7)]=null;}
    else if(m.to===idx(0,2)){nb[idx(0,3)]=nb[idx(0,0)];nb[idx(0,0)]=null;}
  } else if(m.special==='ep'){
    nb[m.to]=nb[m.from]; nb[m.from]=null;
    nb[idx(c==='w'?row(m.to)+1:row(m.to)-1, col(m.to))]=null;
  } else if(m.special&&m.special.startsWith('promo')){
    nb[m.to]=c+m.special[5]; nb[m.from]=null;
  } else {
    nb[m.to]=nb[m.from]; nb[m.from]=null;
  }

  if(epRef!==null) epRef.val=(p[1]==='P'&&Math.abs(m.from-m.to)===16)?(c==='w'?m.to+8:m.to-8):-1;
  if(crRef!==null){
    crRef.wK=crRef.wK&&!(m.from===idx(7,4)||m.from===idx(7,7)||m.to===idx(7,7));
    crRef.wQ=crRef.wQ&&!(m.from===idx(7,4)||m.from===idx(7,0)||m.to===idx(7,0));
    crRef.bK=crRef.bK&&!(m.from===idx(0,4)||m.from===idx(0,7)||m.to===idx(0,7));
    crRef.bQ=crRef.bQ&&!(m.from===idx(0,4)||m.from===idx(0,0)||m.to===idx(0,0));
  }
  return nb;
}

function getLegalMoves(b, pos, ep, cr) {
  return getMoves(b,pos,ep,cr).filter(m=>{
    const nb=applyMove(b,m,null,null);
    return !isAttacked(nb,findKing(nb,color(b[pos])),opp(color(b[pos])));
  });
}

function getAllLegalMoves(b, c, ep, cr) {
  const all=[];
  for(let i=0;i<64;i++) if(color(b[i])===c) getLegalMoves(b,i,ep,cr).forEach(m=>all.push(m));
  return all;
}

// ── Evaluation ───────────────────────────────────────

const VALS = {P:100,N:320,B:330,R:500,Q:900,K:20000};
const PST = {
  P:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  N:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  B:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  R:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  Q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  K:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
};

function evaluate(b) {
  let score=0;
  for(let i=0;i<64;i++){
    const p=b[i]; if(!p) continue;
    const c=p[0],t=p[1];
    score+=(c==='w'?1:-1)*((VALS[t]||0)+(PST[t]?(c==='w'?PST[t][i]:PST[t][63-i]):0));
  }
  return score;
}

// ── AI ───────────────────────────────────────────────

function eloToDepth(elo){ return elo<600?1:elo<900?2:elo<1400?3:elo<2000?4:elo<2600?5:6; }
function eloRandomness(elo){ return elo<600?.8:elo<900?.5:elo<1200?.3:elo<1600?.15:elo<2000?.05:0; }

function minimax(b, depth, alpha, beta, maximize, ep, cr) {
  if(depth===0) return {score:evaluate(b)};
  const c=maximize?'w':'b';
  const moves=getAllLegalMoves(b,c,ep,cr);
  if(moves.length===0){
    const kPos=findKing(b,c);
    return {score:isAttacked(b,kPos,opp(c))?(maximize?-50000+depth:50000-depth):0};
  }
  moves.sort((a,b2)=>(b[b2.to]?1:0)-(b[a.to]?1:0));
  let best=maximize?{score:-Infinity}:{score:Infinity};
  for(const m of moves){
    const epRef={val:-1},crRef={...cr};
    const nb=applyMove(b,m,epRef,crRef);
    const res=minimax(nb,depth-1,alpha,beta,!maximize,epRef.val,crRef);
    if(maximize){if(res.score>best.score)best={score:res.score,move:m};alpha=Math.max(alpha,res.score);}
    else{if(res.score<best.score)best={score:res.score,move:m};beta=Math.min(beta,res.score);}
    if(beta<=alpha) break;
  }
  return best;
}

function getBestMove(b, c, ep, cr, elo) {
  const moves=getAllLegalMoves(b,c,ep,cr);
  if(!moves.length) return null;
  if(Math.random()<eloRandomness(elo)) return moves[Math.floor(Math.random()*moves.length)];
  const maximize=(c==='w');
  let best=null, bestScore=maximize?-Infinity:Infinity;
  const shuffled=[...moves].sort(()=>Math.random()-.5);
  for(const m of shuffled){
    const epRef={val:-1},crRef={...cr};
    const nb=applyMove(b,m,epRef,crRef);
    const res=minimax(nb,eloToDepth(elo)-1,-Infinity,Infinity,!maximize,epRef.val,crRef);
    if(maximize?res.score>bestScore:res.score<bestScore){bestScore=res.score;best=m;}
  }
  return best;
}

// ── Render ───────────────────────────────────────────

function renderBoard() {
  const container=document.getElementById('board-rows');
  const filesTop=document.getElementById('files-top');
  const filesBot=document.getElementById('files-bot');
  const files='abcdefgh';
  filesTop.innerHTML=filesBot.innerHTML='';
  for(let i=0;i<8;i++) [filesTop,filesBot].forEach(el=>{
    const d=document.createElement('div'); d.className='coord-cell'; d.textContent=files[i]; el.appendChild(d);
  });
  let html='';
  for(let r=0;r<8;r++){
    html+=`<div class="board-row-wrap"><div class="rank-label">${8-r}</div><div style="display:flex">`;
    for(let f=0;f<8;f++){
      const i=idx(r,f), light=(r+f)%2===0, p=board[i];
      let cls=`sq ${light?'light':'dark'}`;
      if(i===selected) cls+=' selected';
      if(legalMoves.some(m=>m.to===i)) cls+=board[i]?' legal-capture':' legal-move';
      if((i===lastFrom||i===lastTo)&&i!==selected) cls+=' last-move';
      if(p&&p[1]==='K'&&!gameOver&&isAttacked(board,i,opp(p[0]))) cls+=' in-check';
      html+=`<div class="${cls}" onclick="handleClick(${i})">${p?PIECES[p]:''}</div>`;
    }
    html+=`</div></div>`;
  }
  container.innerHTML=html;
  document.getElementById('cap-black').textContent=capturedB.map(p=>PIECES[p]).join('');
  document.getElementById('cap-white').textContent=capturedW.map(p=>PIECES[p]).join('');
}

function handleClick(i) {
  if(gameOver||turn!=='w') return;
  if(selected!==null){
    const m=legalMoves.find(mv=>mv.to===i);
    if(m){ doMove(m); return; }
  }
  if(board[i]&&color(board[i])==='w'){
    selected=i; legalMoves=getLegalMoves(board,i,enPassant,castleRights);
  } else { selected=null; legalMoves=[]; }
  renderBoard();
}

function doMove(m) {
  const cap=board[m.to];
  if(m.special==='ep'){
    const capIdx=idx(turn==='w'?row(m.to)+1:row(m.to)-1,col(m.to));
    (turn==='w'?capturedW:capturedB).push(board[capIdx]);
  } else if(cap) { (turn==='w'?capturedW:capturedB).push(cap); }

  const epRef={val:-1}, crRef={...castleRights};
  board=applyMove(board,m,epRef,crRef);
  enPassant=epRef.val; castleRights=crRef;

  const files='abcdefgh', ranks='87654321';
  const notation=m.special?.startsWith('promo')?`${files[col(m.from)]}${ranks[row(m.from)]}${files[col(m.to)]}${ranks[row(m.to)]}=${m.special[5]}`:
    m.special==='castle'?(col(m.to)===6?'O-O':'O-O-O'):
    `${files[col(m.from)]}${ranks[row(m.from)]}${files[col(m.to)]}${ranks[row(m.to)]}`;
  moveHistory.push({color:turn,notation});

  lastFrom=m.from; lastTo=m.to; selected=null; legalMoves=[];
  turn=opp(turn);
  renderBoard(); updateStatus(); updateMoveList();
  if(!gameOver&&turn==='b') setTimeout(aiMove,100);
}

function aiMove() {
  if(gameOver) return;
  const delay=getThinkTime(currentElo);
  const bar=document.getElementById('think-bar');
  bar.style.transition=`width ${delay}ms linear`; bar.style.width='0%';
  void bar.offsetWidth; bar.style.width='100%';
  document.getElementById('game-status').textContent='🤔 Thinking...';
  setTimeout(()=>{
    bar.style.transition='none'; bar.style.width='0%';
    const m=getBestMove(board,'b',enPassant,castleRights,currentElo);
    if(m) doMove(m); else updateStatus();
  }, delay);
}

function getThinkTime(elo){
  return elo<600?300+Math.random()*400:elo<1000?400+Math.random()*600:elo<1500?600+Math.random()*800:elo<2000?800+Math.random()*1000:elo<2500?1000+Math.random()*1500:1500+Math.random()*2000;
}

function updateStatus() {
  const allMoves=getAllLegalMoves(board,turn,enPassant,castleRights);
  const kPos=findKing(board,turn);
  const inCheck=isAttacked(board,kPos,opp(turn));
  const dot=document.getElementById('turn-dot');
  const status=document.getElementById('game-status');
  const txt=document.getElementById('turn-text');
  if(!allMoves.length){
    gameOver=true;
    if(inCheck){
      const winner=opp(turn)==='w'?'White':'Black';
      status.textContent=`Checkmate! ${winner} wins!`; txt.textContent='Game over';
      setTimeout(()=>showModal('Checkmate!',`${winner} wins the game!`),500);
    } else {
      status.textContent='Stalemate! Draw.'; txt.textContent='Game over';
      setTimeout(()=>showModal('Stalemate!','The game is a draw.'),500);
    }
    return;
  }
  status.textContent=inCheck?`⚠️ ${turn==='w'?'White':'Black'} is in check!`:turn==='w'?'Your turn (White)':'AI is thinking...';
  dot.style.background=turn==='w'?'#eee':'#222';
  dot.style.borderColor=turn==='w'?'#aaa':'#888';
  txt.textContent=turn==='w'?'White to move':'Black to move';
}

function updateMoveList() {
  const ml=document.getElementById('move-list');
  let html='';
  for(let i=0;i<moveHistory.length;i+=2){
    html+=`<div class="move-row"><span class="move-num">${Math.floor(i/2)+1}.</span><span class="move-w">${moveHistory[i]?.notation||''}</span><span class="move-b">${moveHistory[i+1]?.notation||''}</span></div>`;
  }
  ml.innerHTML=html; ml.scrollTop=ml.scrollHeight;
}

function showModal(title,msg){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-msg').textContent=msg;
  document.getElementById('modal').classList.add('active');
}

function closeModal(){ document.getElementById('modal').classList.remove('active'); }

function eloToTitle(elo){
  const map=[[500,'Beginner','#88cc88'],[700,'Novice','#aabb66'],[900,'Casual','#cccc44'],[1100,'Intermediate','#ddaa44'],[1300,'Club Player','#dd8844'],[1500,'Advanced','#cc6644'],[1700,'Expert','#cc4455'],[1900,'Candidate Master','#bb4488'],[2100,'Master','#8844cc'],[2300,'FIDE Master','#6655dd'],[2500,'International Master','#4477ee'],[2700,'Grandmaster','#44aaff'],[3000,'Super-GM','#44ffdd']];
  for(const [cap,title,color] of map) if(elo<cap) return {title,color};
  return {title:'Magnus-Level',color:'#f0c060'};
}

document.getElementById('elo-slider').addEventListener('input',function(){
  const elo=parseInt(this.value);
  const {title,color}=eloToTitle(elo);
  document.getElementById('elo-num').textContent=elo;
  document.getElementById('elo-num').style.color=color;
  document.getElementById('elo-num').style.textShadow=`0 0 20px ${color}66`;
  document.getElementById('elo-title').textContent=title;
  document.getElementById('elo-title').style.color=color;
});

function setElo(v){
  document.getElementById('elo-slider').value=v;
  document.getElementById('elo-slider').dispatchEvent(new Event('input'));
}

document.getElementById('board-rows').style.cssText='display:flex;flex-direction:column';
setElo(1200);
startGame();
