
(() => {
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msg = document.getElementById('message');
const startBtn = document.getElementById('startBtn');
const crystalEl = document.getElementById('crystals');
const timeEl = document.getElementById('time');

let W=0,H=0,dpr=1,last=0,started=false,won=false,t=0;
const keys = {left:false,right:false,jump:false,flip:false};
const world = {width:4600, floor:0, ceiling:0};
const camera = {x:0, shake:0};

function resize(){
  dpr=Math.min(devicePixelRatio||1,2);
  W=innerWidth; H=innerHeight;
  canvas.width=Math.floor(W*dpr); canvas.height=Math.floor(H*dpr);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  world.floor=H-116;
  world.ceiling=68;
}
addEventListener('resize',resize); resize();

const platforms = [
  {x:0,y:0,w:720,h:80},
  {x:820,y:0,w:380,h:80},
  {x:1310,y:0,w:420,h:80},
  {x:1840,y:0,w:620,h:80},
  {x:2600,y:0,w:410,h:80},
  {x:3130,y:0,w:580,h:80},
  {x:3820,y:0,w:780,h:80},
  {x:560,y:-125,w:180,h:24},
  {x:1040,y:-210,w:190,h:24},
  {x:1510,y:-145,w:160,h:24},
  {x:2200,y:-205,w:210,h:24},
  {x:2830,y:-155,w:190,h:24},
  {x:3460,y:-230,w:210,h:24},
  {x:3950,y:-155,w:220,h:24},
  // ceiling platforms for gravity flip
  {x:900,y:1,w:250,h:28,ceiling:true},
  {x:1760,y:1,w:330,h:28,ceiling:true},
  {x:2720,y:1,w:320,h:28,ceiling:true},
  {x:3650,y:1,w:300,h:28,ceiling:true},
];
const crystals = [
  {x:650,y:-175},{x:1120,y:-260},{x:1585,y:-195},
  {x:2300,y:-255},{x:2900,y:-205},{x:3550,y:-280},{x:4090,y:-205}
].map(c=>({...c,taken:false,p:Math.random()*6}));
const enemies = [
  {x:1440,dir:1,min:1340,max:1680},
  {x:3300,dir:-1,min:3180,max:3600},
  {x:4050,dir:1,min:3900,max:4350}
];
const particles=[];

const player = {
 x:120,y:0,vx:0,vy:0,w:42,h:52,gravity:1,onGround:false,face:1,
 collected:0, alive:true, squash:0
};

function reset(){
 player.x=120; player.y=world.floor-player.h; player.vx=0; player.vy=0;
 player.gravity=1; player.collected=0; player.alive=true; player.squash=0;
 crystals.forEach(c=>c.taken=false); camera.x=0; t=0; won=false;
 crystalEl.textContent='◆ 0/7'; msg.classList.remove('show');
}

function platformRect(p){
  if(p.ceiling) return {x:p.x,y:world.ceiling,w:p.w,h:p.h};
  if(p.h===80) return {x:p.x,y:world.floor,w:p.w,h:p.h};
  return {x:p.x,y:world.floor+p.y,w:p.w,h:p.h};
}

function overlap(a,b){
 return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

function spawn(x,y,n=10){
 for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-.5)*180,vy:(Math.random()-.8)*180,life:.7+Math.random()*.5,size:2+Math.random()*5});
}

let audioCtx, musicTimer;
function startAudio(){
 if(audioCtx) return;
 audioCtx = new (window.AudioContext||window.webkitAudioContext)();
 const master=audioCtx.createGain(); master.gain.value=.12; master.connect(audioCtx.destination);
 const notes=[261.63,329.63,392,493.88,440,392,329.63,293.66];
 let i=0;
 musicTimer=setInterval(()=>{
   if(!started || won) return;
   const o=audioCtx.createOscillator(), g=audioCtx.createGain();
   o.type='sine'; o.frequency.value=notes[i++%notes.length]/2;
   g.gain.setValueAtTime(0,audioCtx.currentTime);
   g.gain.linearRampToValueAtTime(.18,audioCtx.currentTime+.04);
   g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.65);
   o.connect(g); g.connect(master); o.start(); o.stop(audioCtx.currentTime+.7);
 },430);
}
function sfx(freq=600,dur=.12,type='sine'){
 if(!audioCtx) return;
 const o=audioCtx.createOscillator(),g=audioCtx.createGain();
 o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);
 o.frequency.exponentialRampToValueAtTime(Math.max(60,freq*.6),audioCtx.currentTime+dur);
 g.gain.setValueAtTime(.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
 o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
}

function bindButton(id,key){
 const el=document.getElementById(id);
 const on=e=>{e.preventDefault();keys[key]=true; if(key==='jump'||key==='flip') setTimeout(()=>keys[key]=false,80);}
 const off=e=>{e.preventDefault(); if(key!=='jump'&&key!=='flip')keys[key]=false;}
 el.addEventListener('pointerdown',on); el.addEventListener('pointerup',off); el.addEventListener('pointercancel',off); el.addEventListener('pointerleave',off);
}
bindButton('leftBtn','left');bindButton('rightBtn','right');bindButton('jumpBtn','jump');bindButton('flipBtn','flip');

addEventListener('keydown',e=>{
 if(['ArrowLeft','a','A'].includes(e.key))keys.left=true;
 if(['ArrowRight','d','D'].includes(e.key))keys.right=true;
 if(['ArrowUp','w','W',' '].includes(e.key))keys.jump=true;
 if(['f','F','Shift'].includes(e.key))keys.flip=true;
});
addEventListener('keyup',e=>{
 if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;
 if(['ArrowRight','d','D'].includes(e.key))keys.right=false;
 if(['ArrowUp','w','W',' '].includes(e.key))keys.jump=false;
 if(['f','F','Shift'].includes(e.key))keys.flip=false;
});
startBtn.onclick=()=>{started=true;reset();startAudio();};

let jumpLatch=false, flipLatch=false;
function update(dt){
 if(!started||won)return;
 t+=dt; timeEl.textContent=t.toFixed(1);
 const accel=1500,max=285,friction=1700;
 if(keys.left){player.vx-=accel*dt;player.face=-1;}
 if(keys.right){player.vx+=accel*dt;player.face=1;}
 if(!keys.left&&!keys.right){
  const s=Math.sign(player.vx); player.vx-=s*Math.min(Math.abs(player.vx),friction*dt);
 }
 player.vx=Math.max(-max,Math.min(max,player.vx));

 if(keys.jump && !jumpLatch && player.onGround){
   player.vy=-player.gravity*520; player.onGround=false; player.squash=.2; sfx(420,.12,'triangle');
 }
 jumpLatch=keys.jump;
 if(keys.flip && !flipLatch){
   player.gravity*=-1; player.vy=player.gravity*80; player.onGround=false; camera.shake=8; spawn(player.x+player.w/2,player.y+player.h/2,18); sfx(800,.16,'sawtooth');
 }
 flipLatch=keys.flip;

 player.vy += 1250*player.gravity*dt;
 player.vy=Math.max(-850,Math.min(850,player.vy));

 player.x+=player.vx*dt;
 player.x=Math.max(0,Math.min(world.width-player.w,player.x));

 let oldY=player.y; player.y+=player.vy*dt; player.onGround=false;
 const pr={x:player.x,y:player.y,w:player.w,h:player.h};
 for(const p of platforms){
   const r=platformRect(p);
   if(!overlap(pr,r))continue;
   if(player.gravity===1 && player.vy>=0 && oldY+player.h<=r.y+12){
      player.y=r.y-player.h;player.vy=0;player.onGround=true;player.squash=.14;
   } else if(player.gravity===-1 && player.vy<=0 && oldY>=r.y+r.h-12){
      player.y=r.y+r.h;player.vy=0;player.onGround=true;player.squash=.14;
   } else if(player.vx>0) {player.x=r.x-player.w;player.vx=0;}
   else if(player.vx<0) {player.x=r.x+r.w;player.vx=0;}
 }
 if(player.y>H+260||player.y<-260){reset();}

 for(const c of crystals){
   if(c.taken)continue;
   const cy=world.floor+c.y;
   if(Math.hypot(player.x+player.w/2-c.x,player.y+player.h/2-cy)<44){
      c.taken=true;player.collected++; crystalEl.textContent=`◆ ${player.collected}/7`;spawn(c.x,cy,22);sfx(1050,.18,'sine');
   }
 }
 for(const e of enemies){
   e.x+=e.dir*55*dt;if(e.x<e.min||e.x>e.max)e.dir*=-1;
   const er={x:e.x,y:world.floor-34,w:42,h:34};
   if(overlap({x:player.x,y:player.y,w:player.w,h:player.h},er)){
      if(player.vy*player.gravity>120){spawn(e.x+20,er.y,18);e.x=e.min;player.vy=-player.gravity*320;sfx(180,.16,'square');}
      else {camera.shake=14;reset();}
   }
 }
 if(player.x>world.width-170){
   won=true; spawn(player.x,player.y,60); sfx(900,.5,'triangle');
   msg.innerHTML=`<div class="panel"><h1>ГОТОВО!</h1><p>Кристаллы: ${player.collected}/7</p><p>Время: ${t.toFixed(1)} сек.</p><button id="againBtn">ЕЩЁ РАЗ</button></div>`;
   msg.classList.add('show'); document.getElementById('againBtn').onclick=reset;
 }

 player.squash=Math.max(0,player.squash-dt);
 const target=player.x-W*.38;
 camera.x += (target-camera.x)*Math.min(1,dt*4.5);
 camera.x=Math.max(0,Math.min(world.width-W,camera.x));
 camera.shake=Math.max(0,camera.shake-dt*30);

 particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=260*dt;p.life-=dt;});
 for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);
}

function hill(y,amp,freq,speed,offset,fill){
 ctx.beginPath();ctx.moveTo(0,H);
 for(let x=0;x<=W+20;x+=20){
   const wx=x+camera.x*speed;
   const yy=y+Math.sin(wx*freq+offset)*amp+Math.sin(wx*freq*.37)*amp*.6;
   ctx.lineTo(x,yy);
 }
 ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
function drawBackground(){
 const g=ctx.createLinearGradient(0,0,0,H);
 g.addColorStop(0,'#12294c');g.addColorStop(.48,'#28577a');g.addColorStop(1,'#8bc3a6');
 ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

 // moon
 ctx.save();ctx.globalAlpha=.7;ctx.fillStyle='#fff8cf';ctx.shadowColor='#fff4c0';ctx.shadowBlur=40;ctx.beginPath();ctx.arc(W*.78-camera.x*.02,H*.2,46,0,Math.PI*2);ctx.fill();ctx.restore();

 hill(H*.49,38,.004,.08,0,'rgba(26,63,83,.55)');
 hill(H*.58,46,.005,.14,1.4,'rgba(18,66,67,.62)');
 hill(H*.68,52,.007,.22,2.2,'rgba(11,56,48,.78)');

 // trees
 for(let i=0;i<28;i++){
   const x=(i*190-camera.x*.38)% (W+240)-120;
   const h=110+(i%5)*22;
   ctx.fillStyle='rgba(5,41,37,.65)';ctx.fillRect(x,H*.62-h*.15,12,h);
   ctx.beginPath();ctx.arc(x+6,H*.62-h*.15,36+(i%3)*8,0,Math.PI*2);ctx.fill();
 }
 // fog
 const fog=ctx.createLinearGradient(0,H*.62,0,H);
 fog.addColorStop(0,'rgba(180,235,220,0)');fog.addColorStop(1,'rgba(180,235,220,.16)');
 ctx.fillStyle=fog;ctx.fillRect(0,H*.55,W,H*.45);
}
function drawWorld(){
 ctx.save();
 const shakeX=(Math.random()-.5)*camera.shake,shakeY=(Math.random()-.5)*camera.shake;
 ctx.translate(-camera.x+shakeX,shakeY);

 // ground glow
 ctx.fillStyle='rgba(102,255,202,.08)';ctx.fillRect(0,world.floor-10,world.width,20);

 for(const p of platforms){
   const r=platformRect(p);
   const grad=ctx.createLinearGradient(0,r.y,0,r.y+r.h);
   grad.addColorStop(0,p.ceiling?'#6d8a78':'#315b43');grad.addColorStop(1,'#132b26');
   ctx.fillStyle=grad;roundRect(r.x,r.y,r.w,r.h,12);ctx.fill();
   ctx.fillStyle=p.ceiling?'#a2c7a5':'#76ba73';ctx.fillRect(r.x+4,p.ceiling?r.y+r.h-6:r.y,r.w-8,6);
   if(!p.ceiling && p.h===80){
     for(let x=r.x+18;x<r.x+r.w;x+=42){
       ctx.fillStyle='rgba(104,181,105,.5)';ctx.fillRect(x,r.y-8,3,10+Math.sin(x+t*2)*3);
     }
   }
 }

 for(const c of crystals){
   if(c.taken)continue;
   const y=world.floor+c.y+Math.sin(t*3+c.p)*7;
   ctx.save();ctx.translate(c.x,y);ctx.rotate(t*.8);
   ctx.shadowColor='#7effff';ctx.shadowBlur=20;ctx.fillStyle='#d8ffff';
   ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(13,0);ctx.lineTo(0,18);ctx.lineTo(-13,0);ctx.closePath();ctx.fill();
   ctx.restore();
 }

 for(const e of enemies){
   const y=world.floor-34;
   ctx.save();ctx.translate(e.x+21,y+17);ctx.scale(e.dir,1);
   ctx.fillStyle='#7b3450';roundRect(-21,-17,42,34,14);ctx.fill();
   ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(9,-4,5,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#1b1020';ctx.beginPath();ctx.arc(11,-4,2,0,Math.PI*2);ctx.fill();
   ctx.restore();
 }

 // finish portal
 const px=world.width-110,py=world.floor-75;
 ctx.save();ctx.translate(px,py);ctx.strokeStyle='#e5d3ff';ctx.lineWidth=8;ctx.shadowColor='#a779ff';ctx.shadowBlur=28;
 ctx.beginPath();ctx.ellipse(0,0,28,62,0,0,Math.PI*2);ctx.stroke();ctx.restore();

 // player
 ctx.save();ctx.translate(player.x+player.w/2,player.y+player.h/2);
 if(player.gravity<0)ctx.scale(1,-1);
 let sx=1+player.squash*.55,sy=1-player.squash*.35;
 ctx.scale(sx*player.face,sy);
 const pg=ctx.createLinearGradient(0,-26,0,28);pg.addColorStop(0,'#fff2a7');pg.addColorStop(1,'#ff9f79');
 ctx.fillStyle=pg;ctx.shadowColor='#ffd38a';ctx.shadowBlur=18;roundRect(-21,-26,42,52,16);ctx.fill();
 ctx.shadowBlur=0;ctx.fillStyle='#17223b';ctx.beginPath();ctx.arc(8,-5,4.5,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#17223b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(7,7,8,.15,1.25);ctx.stroke();
 ctx.restore();

 for(const p of particles){
   ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle='#d9ffff';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
 }
 ctx.globalAlpha=1;ctx.restore();
}
function roundRect(x,y,w,h,r){
 const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
}
function loop(ts){
 const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);drawBackground();drawWorld();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
