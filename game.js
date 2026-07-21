(() => {
'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msg = document.getElementById('message');
const startBtn = document.getElementById('startBtn');
const crystalEl = document.getElementById('crystals');
const timeEl = document.getElementById('time');
const heartsEl = document.getElementById('hearts');
const enemyEl = document.getElementById('enemies');

let W=0,H=0,dpr=1,last=0,started=false,won=false,t=0;
const keys={left:false,right:false,jump:false,flip:false,shoot:false};
const world={width:5200,floor:0,ceiling:0};
const camera={x:0,shake:0,flash:0};

function resize(){
  dpr=Math.min(devicePixelRatio||1,2);
  W=innerWidth; H=innerHeight;
  canvas.width=Math.floor(W*dpr); canvas.height=Math.floor(H*dpr);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  world.floor=H-118;
  world.ceiling=64;
}
addEventListener('resize',resize); resize();

const platforms=[
  {x:0,y:0,w:650,h:86},{x:760,y:0,w:420,h:86},{x:1280,y:0,w:520,h:86},{x:1930,y:0,w:620,h:86},
  {x:2680,y:0,w:430,h:86},{x:3250,y:0,w:620,h:86},{x:4000,y:0,w:480,h:86},{x:4600,y:0,w:600,h:86},
  {x:500,y:-130,w:190,h:28},{x:1050,y:-230,w:210,h:28},{x:1530,y:-150,w:170,h:28},{x:2210,y:-220,w:230,h:28},
  {x:2870,y:-165,w:210,h:28},{x:3510,y:-235,w:220,h:28},{x:4210,y:-175,w:220,h:28},{x:4800,y:-250,w:230,h:28},
  {x:680,y:1,w:290,h:34,ceiling:true},{x:1450,y:1,w:360,h:34,ceiling:true},{x:2280,y:1,w:330,h:34,ceiling:true},
  {x:3100,y:1,w:350,h:34,ceiling:true},{x:3900,y:1,w:300,h:34,ceiling:true},{x:4550,y:1,w:390,h:34,ceiling:true}
];

const crystalBlueprint=[
  {x:590,y:-184},{x:1130,y:-284},{x:1620,y:-204},{x:2330,y:-274},{x:2955,y:-218},
  {x:3620,y:-288},{x:4310,y:-228},{x:4680,y:-300},{x:5000,y:-205}
];
let crystals=[];
const enemyBlueprint=[
  {x:970,dir:1,min:820,max:1130,ceiling:false,type:0},
  {x:1510,dir:1,min:1470,max:1740,ceiling:true,type:1},
  {x:2140,dir:-1,min:1990,max:2440,ceiling:false,type:0},
  {x:3070,dir:1,min:2880,max:3330,ceiling:false,type:1},
  {x:3650,dir:-1,min:3500,max:3820,ceiling:true,type:0},
  {x:4280,dir:1,min:4080,max:4440,ceiling:false,type:1},
  {x:4820,dir:-1,min:4660,max:5070,ceiling:false,type:2}
];
let enemies=[];
const particles=[],shots=[],enemyShots=[],motes=[];
const lamps=[380,860,1330,1870,2600,3180,3960,4520,5000];
const ruins=[1150,2410,3380,4460];
const player={x:120,y:0,vx:0,vy:0,w:54,h:46,gravity:1,onGround:false,face:1,collected:0,squash:0,lives:3,kills:0,shootCd:0,inv:0,trail:[]};

for(let i=0;i<90;i++) motes.push({x:Math.random()*world.width,y:Math.random()*900,p:Math.random()*6,s:0.5+Math.random()*2.2});

function reset(full=true){
  player.x=120; player.y=world.floor-player.h; player.vx=0; player.vy=0; player.gravity=1; player.squash=0; player.shootCd=0; player.inv=0; player.trail=[];
  if(full){
    player.collected=0; player.lives=3; player.kills=0;
    crystals=crystalBlueprint.map(o=>({...o,taken:false,p:Math.random()*6}));
    enemies=enemyBlueprint.map(o=>({...o,hp:o.type===2?4:2,alive:true,fire:1+Math.random()*2,hit:0}));
    t=0;
  }
  shots.length=0; enemyShots.length=0; particles.length=0; camera.x=0; camera.shake=0; camera.flash=0; won=false;
  updateHud(); msg.classList.remove('show');
}
function updateHud(){
  crystalEl.textContent=`◆ ${player.collected}/9`;
  heartsEl.textContent='♥'.repeat(player.lives)+'♡'.repeat(3-player.lives);
  enemyEl.textContent=`☠ ${player.kills}/7`;
}
function platformRect(p){
  if(p.ceiling)return{x:p.x,y:world.ceiling,w:p.w,h:p.h};
  if(p.h===86)return{x:p.x,y:world.floor,w:p.w,h:p.h};
  return{x:p.x,y:world.floor+p.y,w:p.w,h:p.h};
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function spawn(x,y,n=10,color='#e7e5ff',speed=220){
  for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*speed,vy:(Math.random()-.8)*speed,life:.45+Math.random()*.65,size:1.5+Math.random()*4.8,color});
}

let audioCtx,masterGain;
function startAudio(){
  if(audioCtx)return;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain(); masterGain.gain.value=.12; masterGain.connect(audioCtx.destination);
  const notes=[110,146.83,164.81,220,196,164.81,146.83,130.81]; let i=0;
  setInterval(()=>{
    if(!started||won||!audioCtx)return;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine'; o.frequency.value=notes[i++%notes.length];
    g.gain.setValueAtTime(0,audioCtx.currentTime); g.gain.linearRampToValueAtTime(.16,audioCtx.currentTime+.04); g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.78);
    o.connect(g);g.connect(masterGain);o.start();o.stop(audioCtx.currentTime+.82);
  },520);
}
function sfx(freq=600,dur=.1,type='sine',volume=.08){
  if(!audioCtx)return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(60,freq*.6),audioCtx.currentTime+dur);
  g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
  o.connect(g);g.connect(masterGain||audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
}
function bind(id,key,pulse=false){
  const el=document.getElementById(id);
  const on=e=>{e.preventDefault();keys[key]=true;if(pulse)setTimeout(()=>keys[key]=false,90);};
  const off=e=>{e.preventDefault();if(!pulse)keys[key]=false;};
  el.addEventListener('pointerdown',on);
  ['pointerup','pointercancel','pointerleave'].forEach(x=>el.addEventListener(x,off));
}
bind('leftBtn','left');bind('rightBtn','right');bind('jumpBtn','jump',true);bind('flipBtn','flip',true);bind('shootBtn','shoot',true);
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){keys.shoot=true;setTimeout(()=>keys.shoot=false,70);}});
addEventListener('keydown',e=>{
  if(['ArrowLeft','a','A'].includes(e.key))keys.left=true;
  if(['ArrowRight','d','D'].includes(e.key))keys.right=true;
  if(['ArrowUp','w','W',' '].includes(e.key))keys.jump=true;
  if(['f','F','Shift'].includes(e.key))keys.flip=true;
  if(['x','X','k','K','Control'].includes(e.key))keys.shoot=true;
});
addEventListener('keyup',e=>{
  if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;
  if(['ArrowRight','d','D'].includes(e.key))keys.right=false;
  if(['ArrowUp','w','W',' '].includes(e.key))keys.jump=false;
  if(['f','F','Shift'].includes(e.key))keys.flip=false;
  if(['x','X','k','K','Control'].includes(e.key))keys.shoot=false;
});
startBtn.onclick=()=>{started=true;startAudio();reset(true);};
let jl=false,fl=false,sl=false;

function hurt(){
  if(player.inv>0||won)return;
  player.lives--;player.inv=1.25;camera.shake=20;camera.flash=.25;spawn(player.x+27,player.y+23,34,'#ff6f9f',260);sfx(120,.28,'sawtooth',.12);updateHud();
  if(player.lives<=0){
    msg.innerHTML='<div class="panel"><div class="catBadge">🐈‍⬛</div><h1>ЕЩЁ РАЗ</h1><p class="lead">Мини-кошка не сдаётся</p><button id="againBtn">СНОВА</button></div>';
    msg.classList.add('show'); document.getElementById('againBtn').onclick=()=>reset(true);
  }else{
    player.x=Math.max(120,player.x-220);player.y=player.gravity>0?world.floor-player.h:world.ceiling;player.vx=0;player.vy=0;
  }
}
function shoot(){
  if(player.shootCd>0)return;
  player.shootCd=.24;
  const sy=player.y+player.h*.50;
  shots.push({x:player.x+player.w/2+player.face*29,y:sy,vx:player.face*610,life:1.5,rot:Math.random()*6});
  camera.shake=3;spawn(player.x+player.w/2+player.face*27,sy,8,'#ece6df',150);sfx(480,.09,'triangle',.07);
}

function update(dt){
  if(!started||won||player.lives<=0)return;
  t+=dt; timeEl.textContent=t.toFixed(1);
  player.inv=Math.max(0,player.inv-dt);player.shootCd=Math.max(0,player.shootCd-dt);camera.flash=Math.max(0,camera.flash-dt);
  const accel=1500,max=285,friction=1700;
  if(keys.left){player.vx-=accel*dt;player.face=-1;}
  if(keys.right){player.vx+=accel*dt;player.face=1;}
  if(!keys.left&&!keys.right){const s=Math.sign(player.vx);player.vx-=s*Math.min(Math.abs(player.vx),friction*dt);}
  player.vx=Math.max(-max,Math.min(max,player.vx));
  if(keys.jump&&!jl&&player.onGround){player.vy=-player.gravity*520;player.onGround=false;player.squash=.2;sfx(420,.12,'triangle');}
  jl=keys.jump;
  if(keys.flip&&!fl){player.gravity*=-1;player.vy=player.gravity*80;player.onGround=false;camera.shake=9;camera.flash=.12;spawn(player.x+27,player.y+23,22,'#c681ff',230);sfx(820,.16,'sawtooth',.09);}
  fl=keys.flip;
  if(keys.shoot&&!sl)shoot();sl=keys.shoot;
  player.vy+=1250*player.gravity*dt;player.vy=Math.max(-850,Math.min(850,player.vy));
  player.x+=player.vx*dt;player.x=Math.max(0,Math.min(world.width-player.w,player.x));
  const oldY=player.y;player.y+=player.vy*dt;player.onGround=false;
  const pr={x:player.x,y:player.y,w:player.w,h:player.h};
  for(const p of platforms){
    const r=platformRect(p);if(!overlap(pr,r))continue;
    if(player.gravity===1&&player.vy>=0&&oldY+player.h<=r.y+13){player.y=r.y-player.h;player.vy=0;player.onGround=true;player.squash=.14;}
    else if(player.gravity===-1&&player.vy<=0&&oldY>=r.y+r.h-13){player.y=r.y+r.h;player.vy=0;player.onGround=true;player.squash=.14;}
    else if(player.vx>0){player.x=r.x-player.w;player.vx=0;}
    else if(player.vx<0){player.x=r.x+r.w;player.vx=0;}
  }
  if(player.y>H+270||player.y<-270)hurt();
  player.trail.unshift({x:player.x+27,y:player.y+23,a:.18});if(player.trail.length>9)player.trail.pop();player.trail.forEach(p=>p.a*=.82);

  for(const q of crystals){
    if(q.taken)continue;const cy=world.floor+q.y;
    if(Math.hypot(player.x+27-q.x,player.y+23-cy)<45){q.taken=true;player.collected++;spawn(q.x,cy,28,'#e4a0ff',260);sfx(1100,.18,'sine',.09);updateHud();}
  }
  for(const e of enemies){
    if(!e.alive)continue;e.hit=Math.max(0,e.hit-dt);e.x+=e.dir*(e.type===2?38:52)*dt;if(e.x<e.min||e.x>e.max)e.dir*=-1;e.fire-=dt;
    const ey=e.ceiling?world.ceiling+7:world.floor-42;
    if(e.fire<=0&&Math.abs(e.x-player.x)<650){
      const dx=player.x-e.x,dy=player.y-ey,len=Math.hypot(dx,dy)||1;enemyShots.push({x:e.x+24,y:ey+21,vx:dx/len*(e.type===2?300:245),vy:dy/len*(e.type===2?300:245),life:3,type:e.type});e.fire=(e.type===2?.9:1.65)+Math.random()*1.1;sfx(230,.1,'square',.035);
    }
    if(overlap(pr,{x:e.x,y:ey,w:48,h:42}))hurt();
  }
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.x+=s.vx*dt;s.rot+=dt*10;s.life-=dt;let hit=false;
    for(const e of enemies){
      if(!e.alive)continue;const ey=e.ceiling?world.ceiling+7:world.floor-42;
      if(overlap({x:s.x-9,y:s.y-9,w:18,h:18},{x:e.x,y:ey,w:48,h:42})){
        e.hp--;e.hit=.16;spawn(s.x,s.y,18,'#e8ddd4',210);camera.shake=7;hit=true;
        if(e.hp<=0){e.alive=false;player.kills++;spawn(e.x+24,ey+21,e.type===2?58:38,e.type===2?'#ffb34e':'#b96cff',300);sfx(170,.24,'square',.11);updateHud();}
        break;
      }
    }
    if(hit||s.life<=0)shots.splice(i,1);
  }
  for(let i=enemyShots.length-1;i>=0;i--){
    const s=enemyShots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
    if(overlap(pr,{x:s.x-8,y:s.y-8,w:16,h:16})){enemyShots.splice(i,1);hurt();continue;}
    if(s.life<=0)enemyShots.splice(i,1);
  }
  if(player.x>world.width-175){
    won=true;spawn(player.x,player.y,70,'#dcb8ff',320);sfx(920,.5,'triangle',.12);
    msg.innerHTML=`<div class="panel"><div class="catBadge">🐈‍⬛</div><h1>ПОРТАЛ</h1><p class="lead">Роботы: ${player.kills}/7 · Кристаллы: ${player.collected}/9</p><p class="small">Время: ${t.toFixed(1)} сек.</p><button id="againBtn">ЕЩЁ РАЗ</button></div>`;
    msg.classList.add('show');document.getElementById('againBtn').onclick=()=>reset(true);
  }
  player.squash=Math.max(0,player.squash-dt);
  const target=player.x-W*.36;camera.x+=(target-camera.x)*Math.min(1,dt*4.7);camera.x=Math.max(0,Math.min(world.width-W,camera.x));camera.shake=Math.max(0,camera.shake-dt*34);
  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=250*dt;p.life-=dt;});for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);
}

function rr(x,y,w,h,r){const q=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();}
function hill(y,a,f,s,o,fill,top=false){ctx.beginPath();ctx.moveTo(0,top?0:H);for(let x=0;x<=W+30;x+=24){const wx=x+camera.x*s,yy=y+Math.sin(wx*f+o)*a+Math.sin(wx*f*.37)*a*.58;ctx.lineTo(x,yy);}ctx.lineTo(W,top?0:H);ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
function drawGlow(x,y,r,color,alpha=.35){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color.replace(')',`,${alpha})`).replace('rgb','rgba'));g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}

function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#07051a');g.addColorStop(.36,'#151342');g.addColorStop(.68,'#17365a');g.addColorStop(1,'#103839');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // stars
  for(let i=0;i<70;i++){const x=(i*157+67-camera.x*.025)%(W+120)-60,y=35+(i*83)%Math.max(120,H*.55),a=.25+.55*Math.abs(Math.sin(t*.7+i));ctx.globalAlpha=a;ctx.fillStyle=i%8===0?'#bf8cff':'#d9f7ff';ctx.beginPath();ctx.arc(x,y,1+(i%3)*.55,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  // moon and halo
  const mx=W*.28-camera.x*.018,my=H*.31;const halo=ctx.createRadialGradient(mx,my,10,mx,my,115);halo.addColorStop(0,'rgba(255,244,196,.35)');halo.addColorStop(1,'rgba(255,244,196,0)');ctx.fillStyle=halo;ctx.fillRect(mx-115,my-115,230,230);ctx.fillStyle='#f4e9bf';ctx.beginPath();ctx.arc(mx,my,38,0,Math.PI*2);ctx.fill();
  hill(H*.55,42,.004,.06,0,'rgba(27,24,76,.75)');hill(H*.63,54,.005,.11,1.2,'rgba(18,45,79,.86)');hill(H*.72,62,.007,.19,2.4,'rgba(9,50,57,.95)');
  // distant castle
  ctx.save();ctx.translate(W*.64-camera.x*.13,H*.62);ctx.fillStyle='rgba(17,18,42,.72)';for(let i=0;i<8;i++){const x=i*20;ctx.fillRect(x,-35-(i%3)*18,14,45+(i%3)*18);if(i%2===0){ctx.fillStyle='rgba(255,143,74,.75)';ctx.fillRect(x+4,-20,3,5);ctx.fillStyle='rgba(17,18,42,.72)';}}ctx.restore();
  // lower forest
  for(let i=0;i<34;i++){const x=(i*170-camera.x*.34)%(W+260)-130,h=120+(i%6)*23;ctx.fillStyle='rgba(5,28,35,.78)';ctx.fillRect(x,H*.72-h*.2,12,h);ctx.beginPath();ctx.arc(x+6,H*.72-h*.2,34+(i%4)*9,0,Math.PI*2);ctx.fill();}
  // upper purple canopy
  for(let i=0;i<36;i++){const x=(i*145-camera.x*.28)%(W+240)-120,r=35+(i%5)*9,y=38+(i%4)*10;const cg=ctx.createRadialGradient(x,y,4,x,y,r);cg.addColorStop(0,'rgba(153,77,218,.86)');cg.addColorStop(.7,'rgba(70,31,111,.95)');cg.addColorStop(1,'rgba(19,10,44,.95)');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(30,15,55,.95)';ctx.fillRect(x-5,0,10,y+16);}
  // hanging vines
  ctx.strokeStyle='rgba(90,62,124,.62)';ctx.lineWidth=2;for(let i=0;i<18;i++){const x=(i*230-camera.x*.24)%(W+260)-80,len=35+(i%5)*18;ctx.beginPath();ctx.moveTo(x,20);ctx.quadraticCurveTo(x+10,20+len*.45,x-4,20+len);ctx.stroke();}
  // fog
  const fog=ctx.createLinearGradient(0,H*.50,0,H);fog.addColorStop(0,'rgba(90,116,157,0)');fog.addColorStop(1,'rgba(69,155,138,.14)');ctx.fillStyle=fog;ctx.fillRect(0,H*.45,W,H*.55);
}

function drawStonePlatform(r,ceiling){
  ctx.save();
  const grad=ctx.createLinearGradient(0,r.y,0,r.y+r.h);grad.addColorStop(0,ceiling?'#4b355d':'#3a404f');grad.addColorStop(1,'#181c28');ctx.fillStyle=grad;rr(r.x,r.y,r.w,r.h,12);ctx.fill();
  ctx.strokeStyle='rgba(160,141,180,.18)';ctx.lineWidth=2;ctx.stroke();
  const edgeY=ceiling?r.y+r.h-8:r.y;ctx.fillStyle=ceiling?'#a14fd2':'#77ad55';ctx.fillRect(r.x+4,edgeY,r.w-8,8);
  // stones
  ctx.fillStyle='rgba(255,255,255,.055)';for(let x=r.x+15;x<r.x+r.w-10;x+=38){const yy=r.y+14+((x/38)%2)*14;rr(x,yy,25,10,5);ctx.fill();}
  // grass / roots
  ctx.strokeStyle=ceiling?'rgba(200,108,255,.65)':'rgba(129,205,83,.7)';ctx.lineWidth=2;for(let x=r.x+18;x<r.x+r.w;x+=31){ctx.beginPath();ctx.moveTo(x,edgeY+(ceiling?2:0));ctx.lineTo(x+Math.sin(x+t)*4,edgeY+(ceiling?11:-8-Math.sin(x+t*2)*3));ctx.stroke();}
  ctx.restore();
}
function drawLamp(x,up=false){
  const y=up?world.ceiling+38:world.floor-10;ctx.save();ctx.translate(x,y);if(up)ctx.scale(1,-1);ctx.strokeStyle='#33293d';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-92);ctx.stroke();ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-86);ctx.quadraticCurveTo(26,-100,38,-80);ctx.stroke();
  const lg=ctx.createRadialGradient(38,-72,2,38,-72,62);lg.addColorStop(0,'rgba(255,194,96,.42)');lg.addColorStop(1,'rgba(255,194,96,0)');ctx.fillStyle=lg;ctx.fillRect(-25,-135,126,126);ctx.fillStyle='#f7b85e';rr(28,-83,20,28,5);ctx.fill();ctx.restore();
}
function drawRuin(x){
  const y=world.floor;ctx.save();ctx.translate(x,y);ctx.fillStyle='#232739';ctx.fillRect(-28,-90,56,90);ctx.fillRect(-42,-94,84,16);ctx.fillStyle='#151927';for(let i=0;i<3;i++)ctx.fillRect(-17+i*16,-70,8,18);ctx.fillStyle='rgba(167,87,226,.2)';ctx.fillRect(-26,-88,52,5);ctx.restore();
}
function drawCrystal(q){
  if(q.taken)return;const y=world.floor+q.y+Math.sin(t*3+q.p)*7;ctx.save();ctx.translate(q.x,y);ctx.rotate(t*.8);ctx.shadowColor='#c95cff';ctx.shadowBlur=25;const g=ctx.createLinearGradient(0,-20,0,20);g.addColorStop(0,'#ffe2ff');g.addColorStop(.5,'#df7cff');g.addColorStop(1,'#7d2bd9');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(14,-2);ctx.lineTo(8,17);ctx.lineTo(-8,17);ctx.lineTo(-14,-2);ctx.closePath();ctx.fill();ctx.restore();
}
function drawRobot(e){
  if(!e.alive)return;const y=e.ceiling?world.ceiling+7:world.floor-42;ctx.save();ctx.translate(e.x+24,y+21);if(e.ceiling)ctx.scale(1,-1);if(e.hit>0)ctx.globalAlpha=.45;
  ctx.shadowColor=e.type===2?'#ff9d3d':'#c04cff';ctx.shadowBlur=e.type===2?20:10;
  const body=e.type===2?'#4a3830':'#2e2942';ctx.fillStyle=body;rr(-24,-20,48,40,8);ctx.fill();ctx.fillStyle='#171522';rr(-18,-13,36,22,5);ctx.fill();ctx.fillStyle=e.type===2?'#ffad42':'#ff3f72';ctx.beginPath();ctx.arc(7,-2,e.type===2?7:5,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#77708c';ctx.fillRect(-19,18,8,8);ctx.fillRect(11,18,8,8);ctx.fillRect(-28,-7,5,15);ctx.fillRect(23,-7,5,15);
  if(e.type===1){ctx.fillStyle='#8075a1';ctx.beginPath();ctx.moveTo(-15,-20);ctx.lineTo(-9,-31);ctx.lineTo(-4,-20);ctx.fill();ctx.beginPath();ctx.moveTo(15,-20);ctx.lineTo(9,-31);ctx.lineTo(4,-20);ctx.fill();}
  if(e.type===2){ctx.strokeStyle='#e3a64d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-14,-20);ctx.lineTo(-18,-31);ctx.moveTo(14,-20);ctx.lineTo(18,-31);ctx.stroke();}
  ctx.restore();
}
function drawPortal(x,y,color='#9b5cff',small=false){
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#bda1ff';ctx.lineWidth=small?5:9;ctx.shadowColor=color;ctx.shadowBlur=small?20:34;ctx.beginPath();ctx.ellipse(0,0,small?22:34,small?48:70,0,0,Math.PI*2);ctx.stroke();ctx.rotate(t*.8);for(let i=0;i<5;i++){ctx.strokeStyle=`rgba(188,126,255,${.55-i*.08})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,(small?14:25)-i*2,(small?36:57)-i*4,i*.3,0,Math.PI*1.55);ctx.stroke();}ctx.restore();
}
function drawYarn(s){
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);ctx.shadowColor='#fff2e8';ctx.shadowBlur=12;ctx.strokeStyle='#d7c8bb';ctx.lineWidth=2;ctx.fillStyle='#8d8176';ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(0,0,3+i,0.4+i*.6,Math.PI*1.7+i*.35);ctx.stroke();}ctx.restore();
}
function drawCat(x=player.x,y=player.y,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(x+27,y+23);if(player.gravity<0)ctx.scale(1,-1);const blink=player.inv>0&&Math.floor(player.inv*12)%2===0;if(blink)ctx.globalAlpha*=.3;ctx.scale(player.face,1);const sx=1+player.squash*.38,sy=1-player.squash*.24;ctx.scale(sx,sy);
  // tail
  ctx.strokeStyle='#08090e';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-19,10);ctx.quadraticCurveTo(-40,7,-35,-13);ctx.quadraticCurveTo(-30,-24,-22,-17);ctx.stroke();
  // body
  const bg=ctx.createLinearGradient(0,-18,0,22);bg.addColorStop(0,'#171b23');bg.addColorStop(1,'#050609');ctx.fillStyle=bg;ctx.shadowColor='#2fd7ff';ctx.shadowBlur=10;rr(-25,-17,50,36,17);ctx.fill();ctx.shadowBlur=0;
  // paws
  ctx.fillStyle='#08090d';ctx.beginPath();ctx.ellipse(-13,18,9,6,0,0,Math.PI*2);ctx.ellipse(13,18,9,6,0,0,Math.PI*2);ctx.fill();
  // ears
  ctx.fillStyle='#0b0d13';ctx.beginPath();ctx.moveTo(-19,-14);ctx.lineTo(-12,-31);ctx.lineTo(-3,-16);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(19,-14);ctx.lineTo(12,-31);ctx.lineTo(3,-16);ctx.closePath();ctx.fill();
  ctx.fillStyle='#46274d';ctx.beginPath();ctx.moveTo(-15,-17);ctx.lineTo(-12,-25);ctx.lineTo(-7,-17);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(15,-17);ctx.lineTo(12,-25);ctx.lineTo(7,-17);ctx.closePath();ctx.fill();
  // eyes like user's cat mask
  ctx.fillStyle='#f4f2e8';ctx.beginPath();ctx.ellipse(-9,-5,11,13,0,0,Math.PI*2);ctx.ellipse(9,-5,11,13,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#42d177';ctx.beginPath();ctx.arc(-9,-5,6.5,0,Math.PI*2);ctx.arc(9,-5,6.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#05070a';ctx.beginPath();ctx.arc(-9,-5,3.4,0,Math.PI*2);ctx.arc(9,-5,3.4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.ellipse(0,7,5,4,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ff314e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,12,16,.1,Math.PI-.1);ctx.stroke();
  // bell
  ctx.fillStyle='#eeb94e';ctx.beginPath();ctx.arc(0,17,4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawWorld(){
  ctx.save();const shakeX=(Math.random()-.5)*camera.shake,shakeY=(Math.random()-.5)*camera.shake;ctx.translate(-camera.x+shakeX,shakeY);
  // ambient motes
  for(const m of motes){const y=(m.y+Math.sin(t*.8+m.p)*18)%Math.max(200,H);ctx.globalAlpha=.18+.35*Math.abs(Math.sin(t+m.p));ctx.fillStyle=m.p>3?'#d084ff':'#a9fff2';ctx.beginPath();ctx.arc(m.x,y,m.s,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  // decorative portals
  drawPortal(1830,world.ceiling+90,'#a84dff',true);drawPortal(3760,world.floor-62,'#37bbff',true);
  lamps.forEach((x,i)=>drawLamp(x,i%3===1));ruins.forEach(drawRuin);
  for(const p of platforms)drawStonePlatform(platformRect(p),!!p.ceiling);
  crystals.forEach(drawCrystal);enemies.forEach(drawRobot);
  shots.forEach(drawYarn);
  for(const s of enemyShots){ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle=s.type===2?'#ffae3c':'#ff3b79';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=15;ctx.beginPath();ctx.arc(0,0,s.type===2?8:6,0,Math.PI*2);ctx.fill();ctx.restore();}
  drawPortal(world.width-115,world.floor-78,'#9d5cff',false);
  // trail
  for(const tr of player.trail)drawCat(tr.x-27,tr.y-23,tr.a);
  drawCat();
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.restore();
  if(camera.flash>0){ctx.fillStyle=`rgba(195,119,255,${camera.flash*.55})`;ctx.fillRect(0,0,W,H);}
}
function loop(ts){const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);drawBackground();drawWorld();requestAnimationFrame(loop);}
requestAnimationFrame(loop);
})();
