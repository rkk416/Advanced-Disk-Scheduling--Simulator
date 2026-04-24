
// ─── STATE ─────────────────────────────────────────────────────────────────
let currentAlgo = 'FCFS';
let currentDir = 'up';
let simTimer = null;
let animFrame = null;
let simRunning = false;

// ─── PARTICLES ──────────────────────────────────────────────────────────────
(function initParticles(){
  const container = document.getElementById('particles');
  for(let i=0;i<25;i++){
    const p = document.createElement('div');
    p.className='particle';
    p.style.cssText=`
      left:${Math.random()*100}%;
      bottom:${Math.random()*20}px;
      animation-duration:${8+Math.random()*15}s;
      animation-delay:${-Math.random()*20}s;
      opacity:${Math.random()*0.4};
      width:${Math.random()<0.3?2:1}px;height:${Math.random()<0.3?2:1}px;
      background:${Math.random()<0.5?'#00f5ff':Math.random()<0.5?'#bf5fff':'#39ff14'};
    `;
    container.appendChild(p);
  }
})();

// ─── SPEED SLIDER ────────────────────────────────────────────────────────────
document.getElementById('speedSlider').addEventListener('input',function(){
  document.getElementById('speedVal').textContent=this.value+'x';
});

// ─── ALGO SELECT ─────────────────────────────────────────────────────────────
const algoDescs = {
  FCFS: {cls:'',text:'<b>FCFS — First Come, First Served</b><br>Processes requests in arrival order. Simple to implement but can cause excessive head movement. Best for light loads with clustered requests.'},
  SSTF: {cls:'sstf',text:'<b>SSTF — Shortest Seek Time First</b><br>Always services the nearest cylinder next. Minimizes individual seek time but can cause starvation of distant requests.'},
  SCAN: {cls:'scan',text:'<b>SCAN — Elevator Algorithm</b><br>Head sweeps in one direction servicing all requests, then reverses. Fair and predictable. Like an elevator going up and down floors.'},
  'C-SCAN': {cls:'cscan',text:'<b>C-SCAN — Circular SCAN</b><br>Head moves in one direction only, jumps back to start without servicing on return. Provides more uniform wait times than SCAN.'},
};

function selectAlgo(algo){
  currentAlgo = algo;
  document.querySelectorAll('.algo-btn').forEach(b=>b.classList.remove('active'));
  const map={FCFS:'FCFS',SSTF:'SSTF',SCAN:'SCAN','C-SCAN':'CSCAN'};
  document.getElementById('btn-'+map[algo]).classList.add('active');
  document.getElementById('dirWrap').style.display=(algo==='SCAN'||algo==='C-SCAN')?'block':'none';
  const d=algoDescs[algo];
  const info=document.getElementById('algoInfo');
  info.className='algo-info '+d.cls;
  info.innerHTML=d.text;
}

function selectDir(dir){
  currentDir=dir;
  document.getElementById('dirUp').className='dir-btn'+(dir==='up'?' active':'');
  document.getElementById('dirDown').className='dir-btn'+(dir==='down'?' active':'');
}

// ─── ALGORITHMS ──────────────────────────────────────────────────────────────
function runFCFS(requests,head){
  let seq=[head,...requests],total=0;
  const seeks=[0];
  for(let i=1;i<seq.length;i++){const s=Math.abs(seq[i]-seq[i-1]);total+=s;seeks.push(s);}
  return{seq,total,seeks};
}

function runSSTF(requests,head){
  let q=[...requests],seq=[head],total=0,cur=head;
  const seeks=[0];
  while(q.length){
    let nearest=q.reduce((a,b)=>Math.abs(b-cur)<Math.abs(a-cur)?b:a);
    const s=Math.abs(nearest-cur);total+=s;cur=nearest;seq.push(nearest);seeks.push(s);
    q.splice(q.indexOf(nearest),1);
  }
  return{seq,total,seeks};
}

function runSCAN(requests,head,dir,diskSize){
  let seq=[head],total=0,cur=head;
  const seeks=[0];
  let sorted=[...requests].sort((a,b)=>a-b);
  let left=sorted.filter(r=>r<cur).reverse();
  let right=sorted.filter(r=>r>=cur);
  const process=arr=>arr.forEach(r=>{const s=Math.abs(r-cur);total+=s;cur=r;seq.push(r);seeks.push(s);});
  if(dir==='up'){process(right);process(left);}
  else{process(left);process(right);}
  return{seq,total,seeks};
}

function runCSCAN(requests,head,dir,diskSize){
  let seq=[head],total=0,cur=head;
  const seeks=[0];
  let sorted=[...requests].sort((a,b)=>a-b);
  let left=sorted.filter(r=>r<cur);
  let right=sorted.filter(r=>r>=cur);
  if(dir==='up'){
    right.forEach(r=>{const s=Math.abs(r-cur);total+=s;cur=r;seq.push(r);seeks.push(s);});
    if(left.length){
      const jump=cur+left[0];total+=jump;cur=left[0];seq.push(left[0]);seeks.push(jump);
      for(let i=1;i<left.length;i++){const s=Math.abs(left[i]-cur);total+=s;cur=left[i];seq.push(left[i]);seeks.push(s);}
    }
  }else{
    left.slice().reverse().forEach(r=>{const s=Math.abs(r-cur);total+=s;cur=r;seq.push(r);seeks.push(s);});
    if(right.length){
      right.slice().reverse().forEach(r=>{const s=Math.abs(r-cur);total+=s;cur=r;seq.push(r);seeks.push(s);});
    }
  }
  return{seq,total,seeks};
}

function compute(algo,requests,head,dir,diskSize){
  if(algo==='FCFS') return runFCFS(requests,head);
  if(algo==='SSTF') return runSSTF(requests,head);
  if(algo==='SCAN') return runSCAN(requests,head,dir,diskSize);
  return runCSCAN(requests,head,dir,diskSize);
}

// ─── PLATTER ANIMATION ───────────────────────────────────────────────────────
let platterAngle=0;
let platterRpm=0;
let targetHead=0;
let currentHeadPos=0;

function drawPlatter(headCyl,diskSize,trackHighlights){
  const canvas=document.getElementById('diskPlatter');
  const dpr=window.devicePixelRatio||1;
  const W=canvas.offsetWidth||300;
  const H=180;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  const cx=W/2,cy=H/2+10;
  const maxR=Math.min(cx,cy)-10;

  // Draw tracks
  const numTracks=12;
  for(let i=numTracks;i>=1;i--){
    const r=(i/numTracks)*maxR;
    const highlighted=trackHighlights&&trackHighlights.some(t=>Math.abs(t/diskSize-(i/numTracks))<0.05);
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle=highlighted?'rgba(0,245,255,0.5)':'rgba(30,45,65,0.8)';
    ctx.lineWidth=highlighted?1.5:0.5;
    ctx.stroke();
    if(highlighted){
      ctx.save();
      ctx.globalAlpha=0.08;
      ctx.fillStyle='#00f5ff';
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  // Spinning data sectors
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(platterAngle);
  for(let s=0;s<16;s++){
    const a=(s/16)*Math.PI*2;
    const isData=s%3!==0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*8,Math.sin(a)*8);
    ctx.lineTo(Math.cos(a)*maxR,Math.sin(a)*maxR);
    ctx.strokeStyle=isData?'rgba(0,245,255,0.04)':'rgba(0,245,255,0.02)';
    ctx.lineWidth=0.5;ctx.stroke();
  }
  ctx.restore();

  // Spindle
  ctx.beginPath();ctx.arc(cx,cy,6,0,Math.PI*2);
  ctx.fillStyle='#1a2535';ctx.fill();
  ctx.strokeStyle='rgba(0,245,255,0.3)';ctx.lineWidth=1;ctx.stroke();

  // Read/Write Arm
  const headR=(headCyl/diskSize)*maxR;
  const armAngle=-Math.PI/5;
  const armX=cx+Math.cos(armAngle)*headR;
  const armY=cy+Math.sin(armAngle)*headR;
  const pivX=cx+Math.cos(armAngle+0.3)*(maxR+20);
  const pivY=cy+Math.sin(armAngle+0.3)*(maxR+20);

  // Arm body
  ctx.beginPath();ctx.moveTo(pivX,pivY);ctx.lineTo(armX,armY);
  ctx.strokeStyle='rgba(0,245,255,0.5)';ctx.lineWidth=2;ctx.stroke();

  // Head glow
  const grad=ctx.createRadialGradient(armX,armY,0,armX,armY,10);
  grad.addColorStop(0,'rgba(0,245,255,0.8)');
  grad.addColorStop(1,'rgba(0,245,255,0)');
  ctx.beginPath();ctx.arc(armX,armY,10,0,Math.PI*2);
  ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();ctx.arc(armX,armY,3,0,Math.PI*2);
  ctx.fillStyle='#00f5ff';ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=0.5;ctx.stroke();

  // Track label
  ctx.fillStyle='rgba(0,245,255,0.6)';
  ctx.font=`9px 'Share Tech Mono',monospace`;ctx.textAlign='left';
  ctx.fillText('HEAD @ '+headCyl,8,16);
}

// ─── SEEK PATH CANVAS ────────────────────────────────────────────────────────
function drawSeekPath(seq,currentStep,diskSize){
  const canvas=document.getElementById('seekCanvas');
  const dpr=window.devicePixelRatio||1;
  const W=canvas.offsetWidth||400;
  const H=160;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.fillStyle='#070c14';ctx.fillRect(0,0,W,H);

  const pad={l:44,r:12,t:12,b:22};
  const pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
  const n=seq.length;

  // Grid
  for(let i=0;i<=10;i++){
    const x=pad.l+(i/10)*pw;
    ctx.strokeStyle='rgba(26,37,53,0.8)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+ph);ctx.stroke();
    ctx.fillStyle='rgba(74,96,112,0.8)';
    ctx.font=`9px 'Share Tech Mono',monospace`;ctx.textAlign='center';
    ctx.fillText(Math.round((i/10)*diskSize),x,pad.t+ph+15);
  }
  for(let i=0;i<n;i++){
    const y=pad.t+(i/(n-1||1))*ph;
    ctx.strokeStyle='rgba(26,37,53,0.5)';ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+pw,y);ctx.stroke();
    ctx.fillStyle='rgba(74,96,112,0.7)';
    ctx.font=`9px 'Share Tech Mono',monospace`;ctx.textAlign='right';
    ctx.fillText(i,pad.l-4,y+3);
  }

  // Lines
  for(let i=1;i<=Math.min(currentStep,n-1);i++){
    const x1=pad.l+(seq[i-1]/diskSize)*pw;
    const y1=pad.t+((i-1)/(n-1))*ph;
    const x2=pad.l+(seq[i]/diskSize)*pw;
    const y2=pad.t+(i/(n-1))*ph;
    const t=i/n;
    const r=Math.round(t*255);
    const g=Math.round(245-t*210);
    const b=Math.round(255-t*100);
    ctx.strokeStyle=`rgb(${r},${g},${b})`;
    ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }

  // Dots
  for(let i=0;i<=Math.min(currentStep,n-1);i++){
    const x=pad.l+(seq[i]/diskSize)*pw;
    const y=pad.t+(i/(n-1||1))*ph;
    const isCurrent=i===currentStep;
    if(isCurrent){
      ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);
      ctx.strokeStyle='rgba(0,245,255,0.2)';ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);
      ctx.strokeStyle='rgba(0,245,255,0.5)';ctx.lineWidth=1;ctx.stroke();
    }
    ctx.beginPath();ctx.arc(x,y,i===0?5:3,0,Math.PI*2);
    ctx.fillStyle=i===0?'#00f5ff':(isCurrent?'#00f5ff':(i<currentStep?'rgba(255,255,255,0.6)':'rgba(74,96,112,0.4)'));
    ctx.fill();
  }
}

// ─── COMPARISON BARS ─────────────────────────────────────────────────────────
function renderComparison(requests,head,dir,diskSize){
  const algos=[
    {name:'FCFS',algo:'FCFS',color:'#00c4d4',tag:'tag-fcfs'},
    {name:'SSTF',algo:'SSTF',color:'#bf5fff',tag:'tag-sstf'},
    {name:'SCAN',algo:'SCAN',color:'#39ff14',tag:'tag-scan'},
    {name:'C-SCAN',algo:'C-SCAN',color:'#ff2d6b',tag:'tag-cscan'},
  ];
  const results=algos.map(a=>({...a,r:compute(a.algo,requests,head,dir,diskSize)}));
  const vals=results.map(r=>r.r.total);
  const maxVal=Math.max(...vals);
  const minVal=Math.min(...vals);
  const container=document.getElementById('compareBars');
  container.innerHTML=results.map(a=>{
    const pct=(a.r.total/maxVal*100).toFixed(1);
    const isBest=a.r.total===minVal;
    const isWorst=a.r.total===maxVal;
    return `<div class="compare-row">
      <span class="compare-name" style="color:${a.color}"><span class="tag-algo ${a.tag}">${a.name}</span></span>
      <div class="compare-bar-wrap">
        <div class="compare-bar" style="width:0%;background:${a.color}22;border-right:2px solid ${a.color}" data-target="${pct}">
          <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${a.color};opacity:0.8">${a.r.total}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <span class="compare-val" style="color:${a.color}">${a.r.total}</span>
        ${isBest?'<span class="best-badge">BEST</span>':''}
        ${isWorst?`<span style="font-size:9px;color:var(--muted);font-family:'Share Tech Mono',monospace">WORST</span>`:''}
      </div>
    </div>`;
  }).join('');
  setTimeout(()=>{
    document.querySelectorAll('.compare-bar').forEach(bar=>{
      bar.style.width=bar.dataset.target+'%';
    });
  },100);
}

// ─── SEQUENCE DISPLAY ─────────────────────────────────────────────────────────
function renderSequence(seq,currentStep){
  const box=document.getElementById('seqBox');
  box.innerHTML=seq.map((v,i)=>{
    const cls=i===currentStep?'seq-item current':'seq-item';
    const past=i<=currentStep;
    const style=!past&&currentStep>=0?'opacity:0.3':'';
    return `<span class="${cls}" style="${style}">${v}</span>${i<seq.length-1?'<span class="seq-arrow">→</span>':''}`;
  }).join('');
}

// ─── STEP LOG ────────────────────────────────────────────────────────────────
function renderStepLog(seq,seeks,currentStep){
  const log=document.getElementById('stepLog');
  if(currentStep===0){log.innerHTML='';}
  const maxSeek=Math.max(...seeks);
  for(let i=0;i<=currentStep;i++){
    const existing=log.querySelector(`[data-step="${i}"]`);
    if(!existing){
      const el=document.createElement('div');
      el.className='log-row';el.dataset.step=i;
      const cumulative=seeks.slice(0,i+1).reduce((a,b)=>a+b,0);
      el.innerHTML=`
        <span class="log-idx">${i}</span>
        <span class="log-track">${seq[i]}</span>
        <span class="log-seek">${seeks[i]}</span>
        <div class="log-barwrap"><div class="log-bar" style="width:${maxSeek?seeks[i]/maxSeek*100:0}%;background:${i%2?'#ff2d6b':'#00f5ff'}"></div></div>
        <span class="log-cum">${cumulative}</span>
      `;
      log.appendChild(el);
      setTimeout(()=>el.classList.add('visible'),50);
      log.scrollTop=log.scrollHeight;
    }
  }
}

// ─── UPDATE METRICS ──────────────────────────────────────────────────────────
function updateMetrics(total,n,diskSize){
  const avg=(total/n).toFixed(1);
  const thru=(n*1000/total).toFixed(2);
  // "efficiency" vs worst case (FCFS with reversed requests)
  const eff=Math.max(0,Math.min(100,(1-total/(diskSize*n))*100)).toFixed(0);
  animateCount('mTotal',0,total,500,'');
  animateCount('mAvg',0,parseFloat(avg),600,'');
  animateCount('mThru',0,parseFloat(thru),700,'');
  animateCount('mEff',0,parseFloat(eff),800,'');
}

function animateCount(id,from,to,dur,suffix){
  const el=document.getElementById(id);
  el.classList.remove('metric-glow');void el.offsetWidth;el.classList.add('metric-glow');
  const start=performance.now();
  function step(now){
    const t=Math.min((now-start)/dur,1);
    const ease=1-Math.pow(1-t,3);
    const val=from+(to-from)*ease;
    el.textContent=(Number.isInteger(to)?Math.round(val):val.toFixed(to<10?2:1))+suffix;
    if(t<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── PLATTER SPIN LOOP ───────────────────────────────────────────────────────
let platAnimId=null;
let platHighlights=[];
let platHeadTarget=0;
let platHeadCurrent=0;
let platDiskSize=200;

function startPlatterSpin(){
  if(platAnimId)cancelAnimationFrame(platAnimId);
  function loop(){
    platterAngle+=0.008;
    platHeadCurrent+=(platHeadTarget-platHeadCurrent)*0.08;
    drawPlatter(Math.round(platHeadCurrent),platDiskSize,platHighlights);
    platAnimId=requestAnimationFrame(loop);
  }
  loop();
}

// ─── MAIN SIMULATION ─────────────────────────────────────────────────────────
function startSimulation(){
  if(simRunning)return;
  const diskSize=parseInt(document.getElementById('diskSize').value)||200;
  const head=parseInt(document.getElementById('headPos').value)||53;
  const reqStr=document.getElementById('requests').value;
  const requests=reqStr.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n)&&n>=0&&n<diskSize);
  if(!requests.length){alert('Please enter valid request numbers!');return;}

  const result=compute(currentAlgo,requests,head,currentDir,diskSize);
  const {seq,total,seeks}=result;

  platDiskSize=diskSize;
  platHeadCurrent=head;
  platHeadTarget=head;
  platHighlights=requests;
  startPlatterSpin();

  renderComparison(requests,head,currentDir,diskSize);
  updateMetrics(total,requests.length,diskSize);

  const speed=parseInt(document.getElementById('speedSlider').value);
  const stepDelay=Math.round(1000/speed);

  simRunning=true;
  document.getElementById('runBtn').classList.add('running');
  document.getElementById('runBtn').textContent='● SIMULATING...';

  let step=0;
  document.getElementById('stepLog').innerHTML='';
  drawSeekPath(seq,0,diskSize);
  renderSequence(seq,0);
  renderStepLog(seq,seeks,0);

  const progress=document.getElementById('progressBar');
  progress.style.width='0%';

  function tick(){
    if(step>=seq.length-1){
      simRunning=false;
      document.getElementById('runBtn').classList.remove('running');
      document.getElementById('runBtn').textContent='▶ RUN SIMULATION';
      progress.style.width='100%';
      return;
    }
    step++;
    const pct=(step/(seq.length-1))*100;
    progress.style.width=pct+'%';
    platHeadTarget=seq[step];
    drawSeekPath(seq,step,diskSize);
    renderSequence(seq,step);
    renderStepLog(seq,seeks,step);
    simTimer=setTimeout(tick,stepDelay);
  }
  tick();
}

function resetAll(){
  if(simTimer)clearTimeout(simTimer);
  simRunning=false;
  document.getElementById('runBtn').classList.remove('running');
  document.getElementById('runBtn').textContent='▶ RUN SIMULATION';
  document.getElementById('mTotal').textContent='—';
  document.getElementById('mAvg').textContent='—';
  document.getElementById('mThru').textContent='—';
  document.getElementById('mEff').textContent='—';
  document.getElementById('compareBars').innerHTML='<div style="color:var(--muted);font-family:\'Share Tech Mono\',monospace;font-size:11px">Run simulation to compare all algorithms</div>';
  document.getElementById('seqBox').innerHTML='<span style="color:var(--muted);font-family:\'Share Tech Mono\',monospace;font-size:11px">Awaiting simulation...</span>';
  document.getElementById('stepLog').innerHTML='<div style="color:var(--muted);font-family:\'Share Tech Mono\',monospace;font-size:11px;padding:4px 0">No steps yet. Run a simulation to see the detailed breakdown.</div>';
  document.getElementById('progressBar').style.width='0%';
  const canvas=document.getElementById('seekCanvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
window.addEventListener('load',()=>{
  platDiskSize=200;platHeadCurrent=53;platHeadTarget=53;
  platHighlights=[98,183,37,122,14,124,65,67];
  startPlatterSpin();
  const sc=document.getElementById('seekCanvas');
  const dpr=window.devicePixelRatio||1;
  const W=sc.offsetWidth||400;
  sc.width=W*dpr;sc.height=160*dpr;
  sc.style.width=W+'px';sc.style.height='160px';
  const ctx=sc.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.fillStyle='#070c14';ctx.fillRect(0,0,W,160);
  ctx.fillStyle='rgba(74,96,112,0.4)';
  ctx.font=`11px 'Share Tech Mono',monospace`;ctx.textAlign='center';
  ctx.fillText('PRESS RUN TO START',W/2/dpr||200,80);
});

window.addEventListener('resize',()=>{
  // re-draw if needed
});