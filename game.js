(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msg = document.getElementById('message');
const startBtn = document.getElementById('startBtn');
const crystalEl = document.getElementById('crystals');
const enemyEl = document.getElementById('enemies');
const heartsEl = document.getElementById('hearts');
const timeEl = document.getElementById('time');

let W = 0, H = 0, dpr = 1, last = 0;
let started = false, won = false, gameOver = false, t = 0;
const keys = {left:false, right:false, jump:false, flip:false, shoot:false};
const world = {width:5000, floor:0, ceiling:0};
const camera = {x:0, shake:0, flash:0};
const particles = [];
const bullets = [];
const enemyBullets = [];
const fireflies = Array.from({length:42},(_,i)=>({
  x:(i*137)%1600, y:80+(i*83)%480, phase:i*.73, size:1+(i%3)*.55
}));

function resize(){
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.floor(W*dpr); canvas.height = Math.floor(H*dpr);
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  world.floor = H-112;
  world.ceiling = 64;
}
addEventListener('resize', resize, {passive:true});
resize();

const platforms = [
  {x:0,y:0,w:760,h:80}, {x:850,y:0,w:430,h:80},
  {x:1390,y:0,w:470,h:80}, {x:1980,y:0,w:650,h:80},
  {x:2770,y:0,w:470,h:80}, {x:3360,y:0,w:610,h:80},
  {x:4090,y:0,w:910,h:80},
  {x:570,y:-132,w:190,h:24}, {x:1060,y:-215,w:200,h:24},
  {x:1590,y:-152,w:175,h:24}, {x:2310,y:-215,w:220,h:24},
  {x:3020,y:-165,w:205,h:24}, {x:3680,y:-235,w:220,h:24},
  {x:4310,y:-170,w:230,h:24},
  {x:900,y:1,w:280,h:28,ceiling:true}, {x:1800,y:1,w:350,h:28,ceiling:true},
  {x:2860,y:1,w:340,h:28,ceiling:true}, {x:3820,y:1,w:320,h:28,ceiling:true},
  {x:4540,y:1,w:300,h:28,ceiling:true}
];

const crystals = [
  {x:655,y:-182}, {x:1155,y:-267}, {x:1670,y:-202},
  {x:2420,y:-265}, {x:3115,y:-215}, {x:3790,y:-288}, {x:4430,y:-220}
].map(c=>({...c,taken:false,p:Math.random()*6}));

const enemyTemplate = [
  {x:1030,min:925,max:1215,dir:1,ceiling:true},
  {x:1510,min:1450,max:1765,dir:1,ceiling:false},
  {x:2480,min:2200,max:2575,dir:-1,ceiling:false},
  {x:3035,min:2900,max:3190,dir:1,ceiling:true},
  {x:4210,min:4140,max:4530,dir:1,ceiling:false}
];
const enemies = enemyTemplate.map((e,i)=>({...e,id:i,hp:2,alive:true,hit:0,shot:1.2+i*.35}));

const player = {
  x:120,y:0,vx:0,vy:0,w:42,h:54,gravity:1,onGround:false,face:1,
  collected:0,kills:0,hearts:3,squash:0,shootKick:0,invuln:0,checkpoint:120
};

function platformRect(p){
  if(p.ceiling) return {x:p.x,y:world.ceiling,w:p.w,h:p.h};
  if(p.h===80) return {x:p.x,y:world.floor,w:p.w,h:p.h};
  return {x:p.x,y:world.floor+p.y,w:p.w,h:p.h};
}
function overlap(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function enemyRect(e){
  return {x:e.x,y:e.ceiling?world.ceiling+28:world.floor-38,w:44,h:38};
}
function updateHud(){
  crystalEl.textContent=`◆ ${player.collected}/7`;
  enemyEl.textContent=`⚡ ${player.kills}/5`;
  heartsEl.textContent='♥'.repeat(player.hearts)+'♡'.repeat(3-player.hearts);
}
function resetEnemies(){
  enemies.forEach((e,i)=>Object.assign(e,enemyTemplate[i],{id:i,hp:2,alive:true,hit:0,shot:1.1+i*.33}));
}
function reset(full=true){
  if(full){
    player.collected=0; player.kills=0; player.hearts=3; player.checkpoint=120;
    crystals.forEach(c=>c.taken=false); resetEnemies(); t=0;
  }
  player.x=player.checkpoint; player.y=world.floor-player.h;
  player.vx=0; player.vy=0; player.gravity=1; player.onGround=false;
  player.squash=0; player.shootKick=0; player.invuln=1.15;
  bullets.length=0; enemyBullets.length=0; particles.length=0;
  camera.x=clamp(player.x-W*.35,0,Math.max(0,world.width-W));
  camera.shake=0; camera.flash=0; won=false; gameOver=false;
  msg.classList.remove('show'); updateHud();
}

function spawn(x,y,n=10,color='#d9ffff',power=1){
  for(let i=0;i<n;i++) particles.push({
    x,y,vx:(Math.random()-.5)*190*power,vy:(Math.random()-.7)*190*power,
    life:.45+Math.random()*.65,size:1.5+Math.random()*4.5,color,drag:.985
  });
}
function muzzle(x,y,face){
  particles.push({x,y,vx:face*150,vy:0,life:.12,size:11,color:'#dfffff',drag:.9});
  spawn(x,y,5,'#7ef6ff',.55);
}

let audioCtx, master, musicTimer;
function startAudio(){
  if(audioCtx){ if(audioCtx.state==='suspended') audioCtx.resume(); return; }
  audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  master=audioCtx.createGain(); master.gain.value=.12; master.connect(audioCtx.destination);
  const notes=[196,246.94,293.66,369.99,329.63,293.66,246.94,220];
  let i=0;
  musicTimer=setInterval(()=>{
    if(!started || won || gameOver) return;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=i%4===0?'triangle':'sine'; o.frequency.value=notes[i++%notes.length];
    g.gain.setValueAtTime(0,audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(.09,audioCtx.currentTime+.05);
    g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.85);
    o.connect(g);g.connect(master);o.start();o.stop(audioCtx.currentTime+.9);
  },420);
}
function sfx(freq=600,dur=.12,type='sine',gain=.13){
  if(!audioCtx) return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(55,freq*.55),audioCtx.currentTime+dur);
  g.gain.setValueAtTime(gain,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
  o.connect(g);g.connect(master||audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
}

function bindButton(id,key,pulse=false){
  const el=document.getElementById(id);
  const on=e=>{
    e.preventDefault(); keys[key]=true; el.classList.add('pressed');
    if(pulse) setTimeout(()=>{keys[key]=false;el.classList.remove('pressed');},75);
  };
  const off=e=>{ e.preventDefault(); if(!pulse)keys[key]=false;el.classList.remove('pressed'); };
  ['pointerdown'].forEach(type=>el.addEventListener(type,on));
  ['pointerup','pointercancel','pointerleave'].forEach(type=>el.addEventListener(type,off));
}
bindButton('leftBtn','left'); bindButton('rightBtn','right');
bindButton('jumpBtn','jump',true); bindButton('flipBtn','flip',true); bindButton('shootBtn','shoot',true);

addEventListener('keydown',e=>{
  if(['ArrowLeft','a','A'].includes(e.key))keys.left=true;
  if(['ArrowRight','d','D'].includes(e.key))keys.right=true;
  if(['ArrowUp','w','W',' '].includes(e.key))keys.jump=true;
  if(['f','F','Shift'].includes(e.key))keys.flip=true;
  if(['x','X','k','K','Control'].includes(e.key))keys.shoot=true;
  if(['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key))e.preventDefault();
},{passive:false});
addEventListener('keyup',e=>{
  if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;
  if(['ArrowRight','d','D'].includes(e.key))keys.right=false;
  if(['ArrowUp','w','W',' '].includes(e.key))keys.jump=false;
  if(['f','F','Shift'].includes(e.key))keys.flip=false;
  if(['x','X','k','K','Control'].includes(e.key))keys.shoot=false;
});
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse' && e.button===0 && started && !won && !gameOver){
    keys.shoot=true; setTimeout(()=>keys.shoot=false,60);
  }
});
startBtn.onclick=()=>{started=true;reset(true);startAudio();};

let jumpLatch=false,flipLatch=false,shootLatch=false,shootCooldown=0;
function shoot(){
  if(shootCooldown>0)return;
  shootCooldown=.22; player.shootKick=.16; camera.shake=Math.max(camera.shake,2.4);
  const x=player.x+player.w/2+player.face*26;
  const y=player.y+player.h/2-player.gravity*3;
  bullets.push({x,y,vx:player.face*660,life:1.25,r:7});
  muzzle(x,y,player.face); sfx(980,.09,'square',.08);
}
function enemyShoot(e){
  const er=enemyRect(e); const ex=er.x+er.w/2,ey=er.y+er.h/2;
  const px=player.x+player.w/2,py=player.y+player.h/2;
  const dx=px-ex,dy=py-ey,len=Math.hypot(dx,dy)||1;
  enemyBullets.push({x:ex,y:ey,vx:dx/len*270,vy:dy/len*270,life:3,r:7});
  spawn(ex,ey,5,'#ff779d',.45); sfx(220,.12,'sawtooth',.055);
}
function hurtPlayer(){
  if(player.invuln>0 || won || gameOver)return;
  player.hearts--; updateHud(); camera.shake=18;camera.flash=.22;
  spawn(player.x+player.w/2,player.y+player.h/2,30,'#ff7b9e',1.2);sfx(120,.3,'sawtooth',.14);
  if(player.hearts<=0){
    gameOver=true;
    msg.innerHTML=`<div class="panel"><div class="eyebrow">СВЯЗЬ ПОТЕРЯНА</div><h1>FLIP</h1><p>Тени оказались сильнее.</p><p class="small">Кристаллы: ${player.collected}/7 · Враги: ${player.kills}/5</p><button id="againBtn">ЕЩЁ РАЗ</button></div>`;
    msg.classList.add('show');document.getElementById('againBtn').onclick=()=>reset(true);
  }else{
    setTimeout(()=>reset(false),260);
  }
}
function hitEnemy(e){
  e.hp--;e.hit=.18;camera.shake=Math.max(camera.shake,5);
  const er=enemyRect(e);spawn(er.x+er.w/2,er.y+er.h/2,16,'#91fbff',.85);sfx(360,.12,'square',.10);
  if(e.hp<=0){
    e.alive=false;player.kills++;updateHud();
    spawn(er.x+er.w/2,er.y+er.h/2,34,'#d4a2ff',1.25);sfx(160,.28,'sawtooth',.13);
  }
}

function update(dt){
  if(!started||won||gameOver)return;
  t+=dt;timeEl.textContent=t.toFixed(1);shootCooldown=Math.max(0,shootCooldown-dt);
  player.invuln=Math.max(0,player.invuln-dt);player.shootKick=Math.max(0,player.shootKick-dt);
  const accel=1500,max=290,friction=1720;
  if(keys.left){player.vx-=accel*dt;player.face=-1;}
  if(keys.right){player.vx+=accel*dt;player.face=1;}
  if(!keys.left&&!keys.right){const s=Math.sign(player.vx);player.vx-=s*Math.min(Math.abs(player.vx),friction*dt);}
  player.vx=clamp(player.vx,-max,max);

  if(keys.jump&&!jumpLatch&&player.onGround){
    player.vy=-player.gravity*525;player.onGround=false;player.squash=.2;sfx(420,.12,'triangle',.09);
  }
  jumpLatch=keys.jump;
  if(keys.flip&&!flipLatch){
    player.gravity*=-1;player.vy=player.gravity*85;player.onGround=false;camera.shake=9;
    spawn(player.x+player.w/2,player.y+player.h/2,20,'#c9b4ff',.95);sfx(820,.17,'sawtooth',.10);
  }
  flipLatch=keys.flip;
  if(keys.shoot&&!shootLatch)shoot();
  shootLatch=keys.shoot;

  player.vy+=1260*player.gravity*dt;player.vy=clamp(player.vy,-860,860);
  player.x+=player.vx*dt;player.x=clamp(player.x,0,world.width-player.w);
  let oldY=player.y;player.y+=player.vy*dt;player.onGround=false;
  const pr={x:player.x,y:player.y,w:player.w,h:player.h};
  for(const p of platforms){
    const r=platformRect(p);if(!overlap(pr,r))continue;
    if(player.gravity===1&&player.vy>=0&&oldY+player.h<=r.y+13){
      player.y=r.y-player.h;player.vy=0;player.onGround=true;player.squash=.14;
    }else if(player.gravity===-1&&player.vy<=0&&oldY>=r.y+r.h-13){
      player.y=r.y+r.h;player.vy=0;player.onGround=true;player.squash=.14;
    }else if(player.vx>0){player.x=r.x-player.w;player.vx=0;}
    else if(player.vx<0){player.x=r.x+r.w;player.vx=0;}
  }
  if(player.y>H+250||player.y<-250)hurtPlayer();

  const checkpointZones=[120,900,1900,2850,3900];
  for(const cp of checkpointZones)if(player.x>cp)player.checkpoint=cp;

  for(const c of crystals){
    if(c.taken)continue;const cy=world.floor+c.y;
    if(Math.hypot(player.x+player.w/2-c.x,player.y+player.h/2-cy)<44){
      c.taken=true;player.collected++;updateHud();spawn(c.x,cy,24,'#b7ffff',1);sfx(1100,.18,'sine',.10);
    }
  }

  for(const e of enemies){
    if(!e.alive)continue;
    e.hit=Math.max(0,e.hit-dt);e.x+=e.dir*50*dt;if(e.x<e.min||e.x>e.max)e.dir*=-1;
    const er=enemyRect(e);
    const dist=Math.abs((player.x+player.w/2)-(er.x+er.w/2));
    e.shot-=dt;
    if(dist<580&&dist>125&&e.shot<=0){enemyShoot(e);e.shot=1.65+Math.random()*.75;}
    if(overlap({x:player.x,y:player.y,w:player.w,h:player.h},er)){
      const stomp=player.vy*player.gravity>135;
      if(stomp){hitEnemy(e);player.vy=-player.gravity*330;}
      else hurtPlayer();
    }
  }

  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.x+=b.vx*dt;b.life-=dt;
    let remove=b.life<=0||b.x<0||b.x>world.width;
    if(!remove){
      for(const e of enemies){
        if(!e.alive)continue;const er=enemyRect(e);
        if(overlap({x:b.x-b.r,y:b.y-b.r,w:b.r*2,h:b.r*2},er)){hitEnemy(e);remove=true;break;}
      }
    }
    if(remove)bullets.splice(i,1);
  }
  for(let i=enemyBullets.length-1;i>=0;i--){
    const b=enemyBullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    const hit=overlap({x:b.x-b.r,y:b.y-b.r,w:b.r*2,h:b.r*2},{x:player.x,y:player.y,w:player.w,h:player.h});
    if(hit){enemyBullets.splice(i,1);hurtPlayer();continue;}
    if(b.life<=0||b.x<0||b.x>world.width||b.y<-100||b.y>H+100)enemyBullets.splice(i,1);
  }

  if(player.x>world.width-155){
    won=true;spawn(player.x,player.y,70,'#e4d4ff',1.4);sfx(900,.55,'triangle',.14);
    msg.innerHTML=`<div class="panel"><div class="eyebrow">ПОРТАЛ СТАБИЛИЗИРОВАН</div><h1>ГОТОВО</h1><p>Кристаллы: ${player.collected}/7 · Враги: ${player.kills}/5</p><p class="small">Время: ${t.toFixed(1)} сек.</p><button id="againBtn">ЕЩЁ РАЗ</button></div>`;
    msg.classList.add('show');document.getElementById('againBtn').onclick=()=>reset(true);
  }

  player.squash=Math.max(0,player.squash-dt);
  const target=player.x-W*.38;camera.x+=(target-camera.x)*Math.min(1,dt*4.8);
  camera.x=clamp(camera.x,0,Math.max(0,world.width-W));
  camera.shake=Math.max(0,camera.shake-dt*32);camera.flash=Math.max(0,camera.flash-dt);

  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=p.drag;p.vy=p.vy*p.drag+250*dt;p.life-=dt;});
  for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);
}

function hill(y,amp,freq,speed,offset,fill,invert=false){
  ctx.beginPath();ctx.moveTo(0,invert?0:H);
  for(let x=0;x<=W+20;x+=20){
    const wx=x+camera.x*speed;
    const wave=Math.sin(wx*freq+offset)*amp+Math.sin(wx*freq*.37)*amp*.55;
    ctx.lineTo(x,invert?y-wave:y+wave);
  }
  ctx.lineTo(W,invert?0:H);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
function drawCloud(x,y,s,alpha){
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#d8eff1';
  ctx.beginPath();ctx.ellipse(x,y,55*s,17*s,0,0,Math.PI*2);ctx.ellipse(x-32*s,y+3*s,28*s,19*s,0,0,Math.PI*2);ctx.ellipse(x+29*s,y-3*s,35*s,23*s,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#07162d');g.addColorStop(.40,'#173c62');g.addColorStop(.62,'#34706f');g.addColorStop(1,'#92c19a');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(W*.76,H*.21,2,W*.76,H*.21,140);
  glow.addColorStop(0,'rgba(255,245,190,.52)');glow.addColorStop(1,'rgba(255,220,150,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=.82;ctx.fillStyle='#fff6c7';ctx.shadowColor='#fff0ae';ctx.shadowBlur=35;ctx.beginPath();ctx.arc(W*.76-camera.x*.018,H*.20,38,0,Math.PI*2);ctx.fill();ctx.restore();
  drawCloud((280-camera.x*.07)%(W+500)-160,H*.21,1.1,.18);
  drawCloud((880-camera.x*.05)%(W+700)-220,H*.31,.78,.14);
  hill(H*.47,32,.0035,.07,.2,'rgba(34,59,85,.55)');
  hill(H*.56,42,.0045,.13,1.4,'rgba(22,73,76,.63)');
  hill(H*.67,49,.0065,.22,2.2,'rgba(10,59,51,.78)');
  hill(H*.22,24,.005,.11,.8,'rgba(14,31,61,.32)',true);
  for(let i=0;i<31;i++){
    const x=(i*184-camera.x*.38)%(W+260)-130;const h=98+(i%5)*20;
    ctx.fillStyle='rgba(4,39,35,.63)';ctx.fillRect(x,H*.64-h*.12,10,h);
    ctx.beginPath();ctx.ellipse(x+5,H*.64-h*.12,31+(i%3)*7,43+(i%4)*8,0,0,Math.PI*2);ctx.fill();
  }
  for(const f of fireflies){
    const x=(f.x-camera.x*.18)%(W+100);const y=f.y+Math.sin(t*1.7+f.phase)*13;
    const a=.12+.35*(.5+.5*Math.sin(t*2.4+f.phase));ctx.globalAlpha=a;ctx.fillStyle='#baffc9';ctx.beginPath();ctx.arc(x,y,f.size,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  const fog=ctx.createLinearGradient(0,H*.52,0,H);fog.addColorStop(0,'rgba(190,235,218,0)');fog.addColorStop(1,'rgba(190,235,218,.18)');ctx.fillStyle=fog;ctx.fillRect(0,H*.5,W,H*.5);
}
function drawPlatform(r,p){
  const grad=ctx.createLinearGradient(0,r.y,0,r.y+r.h);
  grad.addColorStop(0,p.ceiling?'#607d70':'#315c43');grad.addColorStop(1,p.ceiling?'#182f32':'#102823');
  ctx.fillStyle=grad;roundRect(r.x,r.y,r.w,r.h,12);ctx.fill();
  ctx.fillStyle=p.ceiling?'#a6cdb1':'#79c678';ctx.fillRect(r.x+4,p.ceiling?r.y+r.h-6:r.y,r.w-8,6);
  if(p.h===80&&!p.ceiling){
    for(let x=r.x+17;x<r.x+r.w;x+=38){ctx.fillStyle='rgba(130,208,115,.55)';ctx.fillRect(x,r.y-8,3,10+Math.sin(x+t*2)*3);}
  }
  if(p.ceiling){
    for(let x=r.x+22;x<r.x+r.w;x+=46){ctx.strokeStyle='rgba(145,208,173,.42)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,r.y+r.h);ctx.quadraticCurveTo(x+8,r.y+r.h+17+Math.sin(t+x)*5,x-3,r.y+r.h+30);ctx.stroke();}
  }
}
function drawEnemy(e){
  if(!e.alive)return;const r=enemyRect(e);const pulse=.5+.5*Math.sin(t*5+e.id);
  ctx.save();ctx.translate(r.x+r.w/2,r.y+r.h/2);ctx.scale(e.dir,e.ceiling?-1:1);
  if(e.hit>0){ctx.globalAlpha=.65;ctx.shadowColor='#9effff';ctx.shadowBlur=25;}
  ctx.fillStyle=e.hit>0?'#b9ffff':'#713557';roundRect(-22,-19,44,38,15);ctx.fill();
  ctx.fillStyle='#9b4f73';ctx.beginPath();ctx.arc(-9,-13,12,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(10,-5,5.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#190f20';ctx.beginPath();ctx.arc(12,-5,2.4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=`rgba(255,123,167,${.35+pulse*.4})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,26+pulse*3,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function drawProjectile(b,enemy=false){
  ctx.save();ctx.translate(b.x,b.y);ctx.shadowColor=enemy?'#ff477c':'#75f7ff';ctx.shadowBlur=18;
  ctx.fillStyle=enemy?'#ff6b91':'#d9ffff';ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=enemy?'rgba(255,120,155,.45)':'rgba(108,245,255,.45)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(enemy?-b.vx*.035:-Math.sign(b.vx)*22,enemy?-b.vy*.035:0);ctx.lineTo(0,0);ctx.stroke();ctx.restore();
}
function drawWorld(){
  ctx.save();const shakeX=(Math.random()-.5)*camera.shake,shakeY=(Math.random()-.5)*camera.shake;ctx.translate(-camera.x+shakeX,shakeY);
  ctx.fillStyle='rgba(105,255,205,.09)';ctx.fillRect(0,world.floor-11,world.width,22);
  ctx.fillStyle='rgba(158,148,255,.055)';ctx.fillRect(0,world.ceiling-8,world.width,16);
  for(const p of platforms)drawPlatform(platformRect(p),p);
  for(const c of crystals){
    if(c.taken)continue;const y=world.floor+c.y+Math.sin(t*3+c.p)*7;
    ctx.save();ctx.translate(c.x,y);ctx.rotate(t*.8+c.p);ctx.shadowColor='#72f8ff';ctx.shadowBlur=22;
    const cg=ctx.createLinearGradient(0,-18,0,18);cg.addColorStop(0,'#fff');cg.addColorStop(1,'#8ceaff');ctx.fillStyle=cg;
    ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(13,0);ctx.lineTo(0,18);ctx.lineTo(-13,0);ctx.closePath();ctx.fill();ctx.restore();
  }
  for(const e of enemies)drawEnemy(e);
  for(const b of bullets)drawProjectile(b,false);for(const b of enemyBullets)drawProjectile(b,true);
  const px=world.width-100,py=world.floor-77;ctx.save();ctx.translate(px,py);ctx.rotate(Math.sin(t*.8)*.03);
  ctx.strokeStyle='#ead9ff';ctx.lineWidth=8;ctx.shadowColor='#a879ff';ctx.shadowBlur=30;ctx.beginPath();ctx.ellipse(0,0,29,64,0,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=.22;ctx.fillStyle='#b58cff';ctx.beginPath();ctx.ellipse(0,0,21,56,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.translate(player.x+player.w/2,player.y+player.h/2);
  if(player.gravity<0)ctx.scale(1,-1);const blink=player.invuln>0&&Math.floor(player.invuln*12)%2===0;ctx.globalAlpha=blink?.35:1;
  const sx=1+player.squash*.55,sy=1-player.squash*.35;ctx.scale(sx*player.face,sy);
  const kick=player.shootKick>0?player.shootKick*28:0;ctx.translate(-kick,0);
  const pg=ctx.createLinearGradient(0,-28,0,28);pg.addColorStop(0,'#fff5ae');pg.addColorStop(.58,'#ffbc83');pg.addColorStop(1,'#f48b92');
  ctx.fillStyle=pg;ctx.shadowColor='#ffd38a';ctx.shadowBlur=18;roundRect(-21,-27,42,54,16);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#17223b';ctx.beginPath();ctx.arc(8,-6,4.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#17223b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(7,7,8,.15,1.25);ctx.stroke();
  ctx.strokeStyle='#8ef7ff';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(17,8);ctx.lineTo(29,5);ctx.stroke();
  ctx.fillStyle='#d9ffff';ctx.shadowColor='#64efff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(30,5,4,0,Math.PI*2);ctx.fill();ctx.restore();
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;ctx.restore();
  if(camera.flash>0){ctx.fillStyle=`rgba(255,75,115,${camera.flash*.7})`;ctx.fillRect(0,0,W,H);}
}
function roundRect(x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
}
function loop(ts){
  const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);drawBackground();drawWorld();requestAnimationFrame(loop);
}
updateHud();requestAnimationFrame(loop);
})();
