(()=>{
'use strict';
const c=document.getElementById('game'),x=c.getContext('2d');
const msg=document.getElementById('message'),start=document.getElementById('startBtn');
const hearts=document.getElementById('hearts'),enemiesEl=document.getElementById('enemies'),crystalsEl=document.getElementById('crystals'),timeEl=document.getElementById('time');
let W,H,dpr,last=0,t=0,started=false,won=false;
const world={w:5200,floor:0,ceil:64},cam={x:0,shake:0,flash:0},keys={left:false,right:false,flip:false,shoot:false};
const player={x:120,y:0,vx:0,vy:0,w:54,h:46,g:1,on:false,face:1,lives:3,kills:0,collected:0,inv:0,shootCd:0,squash:0};
const platforms=[
{x:0,w:650},{x:760,w:420},{x:1280,w:520},{x:1930,w:620},{x:2680,w:430},{x:3250,w:620},{x:4000,w:480},{x:4600,w:600},
{x:500,w:190,y:-130,h:28},{x:1050,w:210,y:-230,h:28},{x:1530,w:170,y:-150,h:28},{x:2210,w:230,y:-220,h:28},{x:2870,w:210,y:-165,h:28},{x:3510,w:220,y:-235,h:28},{x:4210,w:220,y:-175,h:28},{x:4800,w:230,y:-250,h:28},
{x:680,w:290,h:34,ceil:true},{x:1450,w:360,h:34,ceil:true},{x:2280,w:330,h:34,ceil:true},{x:3100,w:350,h:34,ceil:true},{x:3900,w:300,h:34,ceil:true},{x:4550,w:390,h:34,ceil:true}
];
const crystalBase=[590,1130,1620,2330,2955,3620,4310,4680,5000];
const enemyBase=[970,1510,2140,3070,3650,4280,4820];
let crystals=[],enemies=[],shots=[],enemyShots=[],particles=[];
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;c.width=W*dpr;c.height=H*dpr;x.setTransform(dpr,0,0,dpr,0,0);world.floor=H-118}
addEventListener('resize',resize);resize();
function reset(){
 player.x=120;player.y=world.floor-player.h;player.vx=player.vy=0;player.g=1;player.lives=3;player.kills=0;player.collected=0;player.inv=0;player.shootCd=0;
 crystals=crystalBase.map((q,i)=>({x:q,y:world.floor-[184,284,204,274,218,288,228,300,205][i],taken:false}));
 enemies=enemyBase.map((q,i)=>({x:q,y:i===1||i===4?world.ceil+7:world.floor-42,ceil:i===1||i===4,dir:i%2?1:-1,min:q-150,max:q+150,hp:i===6?4:2,alive:true,fire:1+Math.random()*2,type:i===6?2:i%2}));
 shots=[];enemyShots=[];particles=[];cam.x=0;t=0;won=false;updateHud();msg.classList.remove('show')
}
function updateHud(){hearts.textContent='♥'.repeat(player.lives)+'♡'.repeat(3-player.lives);enemiesEl.textContent=`☠ ${player.kills}/7`;crystalsEl.textContent=`◆ ${player.collected}/9`}
function bind(id,key,pulse=false){const b=document.getElementById(id);const on=e=>{e.preventDefault();keys[key]=true;if(pulse)setTimeout(()=>keys[key]=false,90)},off=e=>{e.preventDefault();if(!pulse)keys[key]=false};b.addEventListener('pointerdown',on);['pointerup','pointercancel','pointerleave'].forEach(a=>b.addEventListener(a,off))}
bind('leftBtn','left');bind('rightBtn','right');bind('flipBtn','flip',true);bind('shootBtn','shoot',true);
addEventListener('keydown',e=>{if(['ArrowLeft','a','A'].includes(e.key))keys.left=true;if(['ArrowRight','d','D'].includes(e.key))keys.right=true;if(['ArrowUp','w','W',' ','f','F','Shift'].includes(e.key)){e.preventDefault();keys.flip=true}if(['x','X','k','K','Control'].includes(e.key))keys.shoot=true});
addEventListener('keyup',e=>{if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;if(['ArrowRight','d','D'].includes(e.key))keys.right=false;if(['ArrowUp','w','W',' ','f','F','Shift'].includes(e.key))keys.flip=false;if(['x','X','k','K','Control'].includes(e.key))keys.shoot=false});
start.onclick=()=>{started=true;reset()};
function rect(p){if(p.ceil)return{x:p.x,y:world.ceil,w:p.w,h:p.h||34};if(p.h)return{x:p.x,y:world.floor+(p.y||0),w:p.w,h:p.h};return{x:p.x,y:world.floor,w:p.w,h:86}}
function ov(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function burst(px,py,n=12,col='#d9c3ff'){for(let i=0;i<n;i++)particles.push({x:px,y:py,vx:(Math.random()-.5)*240,vy:(Math.random()-.7)*220,life:.4+Math.random()*.6,col,r:2+Math.random()*4})}
let flipLock=false,shootLock=false;
function update(dt){
 if(!started||won||player.lives<=0)return;t+=dt;timeEl.textContent=t.toFixed(1);player.inv=Math.max(0,player.inv-dt);player.shootCd=Math.max(0,player.shootCd-dt);
 const acc=1500,max=285,fr=1700;if(keys.left){player.vx-=acc*dt;player.face=-1}if(keys.right){player.vx+=acc*dt;player.face=1}if(!keys.left&&!keys.right){const s=Math.sign(player.vx);player.vx-=s*Math.min(Math.abs(player.vx),fr*dt)}player.vx=Math.max(-max,Math.min(max,player.vx));
 if(keys.flip&&!flipLock){player.g*=-1;player.vy=player.g*80;player.on=false;cam.shake=9;burst(player.x+27,player.y+23,20,'#c681ff')}flipLock=keys.flip;
 if(keys.shoot&&!shootLock&&player.shootCd<=0){player.shootCd=.24;shots.push({x:player.x+27+player.face*31,y:player.y+23,vx:player.face*610,life:1.5,rot:0})}shootLock=keys.shoot;
 player.vy+=1250*player.g*dt;player.vy=Math.max(-850,Math.min(850,player.vy));player.x=Math.max(0,Math.min(world.w-player.w,player.x+player.vx*dt));
 const old=player.y;player.y+=player.vy*dt;player.on=false;let pr={x:player.x,y:player.y,w:player.w,h:player.h};
 for(const p of platforms){const r=rect(p);if(!ov(pr,r))continue;if(player.g===1&&player.vy>=0&&old+player.h<=r.y+13){player.y=r.y-player.h;player.vy=0;player.on=true}else if(player.g===-1&&player.vy<=0&&old>=r.y+r.h-13){player.y=r.y+r.h;player.vy=0;player.on=true}else if(player.vx>0){player.x=r.x-player.w;player.vx=0}else{player.x=r.x+r.w;player.vx=0}}
 for(const q of crystals)if(!q.taken&&Math.hypot(player.x+27-q.x,player.y+23-q.y)<42){q.taken=true;player.collected++;burst(q.x,q.y,24,'#e279ff');updateHud()}
 for(const e of enemies){if(!e.alive)continue;e.x+=e.dir*48*dt;if(e.x<e.min||e.x>e.max)e.dir*=-1;e.fire-=dt;if(e.fire<0&&Math.abs(e.x-player.x)<650){const dx=player.x-e.x,dy=player.y-e.y,L=Math.hypot(dx,dy)||1;enemyShots.push({x:e.x+24,y:e.y+21,vx:dx/L*250,vy:dy/L*250,life:3});e.fire=1.4+Math.random()*1.2}if(ov(pr,{x:e.x,y:e.y,w:48,h:42}))hurt()}
 for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.x+=s.vx*dt;s.rot+=dt*10;s.life-=dt;for(const e of enemies)if(e.alive&&ov({x:s.x-9,y:s.y-9,w:18,h:18},{x:e.x,y:e.y,w:48,h:42})){e.hp--;s.life=0;burst(s.x,s.y,14,'#ddd2c8');if(e.hp<=0){e.alive=false;player.kills++;burst(e.x+24,e.y+21,35,'#b96cff');updateHud()}break}if(s.life<=0)shots.splice(i,1)}
 for(let i=enemyShots.length-1;i>=0;i--){const s=enemyShots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(ov(pr,{x:s.x-7,y:s.y-7,w:14,h:14})){enemyShots.splice(i,1);hurt();continue}if(s.life<=0)enemyShots.splice(i,1)}
 if(player.x>world.w-175){won=true;msg.innerHTML=`<div class="panel"><div class="catBadge">🐈‍⬛</div><h1>ПОРТАЛ</h1><p>Роботы: ${player.kills}/7 · Кристаллы: ${player.collected}/9</p><button id="againBtn">ЕЩЁ РАЗ</button></div>`;msg.classList.add('show');document.getElementById('againBtn').onclick=reset}
 cam.x+=(Math.max(0,Math.min(world.w-W,player.x-W*.27))-cam.x)*Math.min(1,dt*5);cam.shake=Math.max(0,cam.shake-dt*35);
 particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=240*dt;p.life-=dt});particles=particles.filter(p=>p.life>0)
}
function hurt(){if(player.inv>0)return;player.lives--;player.inv=1.2;burst(player.x+27,player.y+23,30,'#ff6f9f');updateHud();if(player.lives<=0){msg.innerHTML='<div class="panel"><h1>ЕЩЁ РАЗ</h1><button id="againBtn">СНОВА</button></div>';msg.classList.add('show');document.getElementById('againBtn').onclick=reset}else{player.x=Math.max(120,player.x-220);player.y=player.g>0?world.floor-player.h:world.ceil}}
function rr(px,py,w,h,r){x.beginPath();x.roundRect(px,py,w,h,r)}
function bg(){const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#09021d');g.addColorStop(.4,'#1b255d');g.addColorStop(1,'#0d4038');x.fillStyle=g;x.fillRect(0,0,W,H);for(let i=0;i<70;i++){x.globalAlpha=.25+.5*Math.abs(Math.sin(t+i));x.fillStyle=i%8?'#d9f7ff':'#bf8cff';x.beginPath();x.arc((i*157-cam.x*.025)%(W+100),40+(i*83)%(H*.55),1+i%3*.4,0,7);x.fill()}x.globalAlpha=1;x.fillStyle='#f4e9bf';x.beginPath();x.arc(W*.28-cam.x*.018,H*.31,38,0,7);x.fill();for(let i=0;i<34;i++){const px=(i*170-cam.x*.34)%(W+260)-130;x.fillStyle='rgba(5,28,35,.8)';x.fillRect(px,H*.65,12,H*.35);x.beginPath();x.arc(px+6,H*.65,42+i%4*8,0,7);x.fill()}for(let i=0;i<36;i++){const px=(i*145-cam.x*.28)%(W+240)-120,r=38+i%5*8;x.fillStyle=`rgba(${80+i%3*25},35,135,.95)`;x.beginPath();x.arc(px,35+i%4*11,r,0,7);x.fill()}}
function platformDraw(r,ceil){x.fillStyle='#252a38';rr(r.x,r.y,r.w,r.h,10);x.fill();x.fillStyle=ceil?'#bd58ed':'#86cf58';x.fillRect(r.x+4,ceil?r.y+r.h-8:r.y,r.w-8,8)}
function yarn(s){x.save();x.translate(s.x,s.y);x.rotate(s.rot);x.fillStyle='#8d8176';x.beginPath();x.arc(0,0,8,0,7);x.fill();x.strokeStyle='#ddd0c5';for(let i=0;i<4;i++){x.beginPath();x.arc(0,0,3+i,0,5);x.stroke()}x.restore()}
function cat(){
 const run=Math.abs(player.vx)>25&&player.on,gait=run?Math.sin(t*15)*4:0,bob=run?Math.abs(Math.sin(t*15))*1.5:0;
 x.save();x.translate(player.x+27,player.y+23-bob);if(player.g<0)x.scale(1,-1);if(player.inv>0&&Math.floor(player.inv*12)%2===0)x.globalAlpha=.3;x.scale(player.face,1);
 x.strokeStyle='#07090d';x.lineWidth=7;x.lineCap='round';x.beginPath();x.moveTo(-19,10);x.quadraticCurveTo(-40,5,-34,-15);x.stroke();
 x.fillStyle='#080a0f';rr(-25,-17,50,36,17);x.fill();
 x.beginPath();x.ellipse(-13+gait,18,9,6,0,0,7);x.ellipse(13-gait,18,9,6,0,0,7);x.fill();
 x.beginPath();x.moveTo(-19,-14);x.lineTo(-12,-31);x.lineTo(-3,-16);x.fill();x.beginPath();x.moveTo(19,-14);x.lineTo(12,-31);x.lineTo(3,-16);x.fill();
 // collar sits behind the face and reads as a neck band
 x.fillStyle='#e52f4c';rr(-17,9,34,6,3);x.fill();
 x.fillStyle='#f4f2e8';x.beginPath();x.ellipse(-9,-5,11,13,0,0,7);x.ellipse(9,-5,11,13,0,0,7);x.fill();
 x.fillStyle='#42d177';x.beginPath();x.arc(-9,-5,6.5,0,7);x.arc(9,-5,6.5,0,7);x.fill();
 x.fillStyle='#05070a';x.beginPath();x.arc(-9,-5,3.4,0,7);x.arc(9,-5,3.4,0,7);x.fill();
 x.fillStyle='#111';x.beginPath();x.ellipse(0,6,4.5,3.5,0,0,7);x.fill();
 x.strokeStyle='#d8a43d';x.lineWidth=2;x.beginPath();x.moveTo(0,14);x.lineTo(0,17);x.stroke();x.fillStyle='#f4c24f';x.beginPath();x.arc(0,20,4.5,0,7);x.fill();
 x.restore()
}
function draw(){bg();x.save();x.translate(-cam.x+(Math.random()-.5)*cam.shake,(Math.random()-.5)*cam.shake);for(const p of platforms)platformDraw(rect(p),p.ceil);for(const q of crystals)if(!q.taken){x.fillStyle='#d76cff';x.beginPath();x.moveTo(q.x,q.y-18);x.lineTo(q.x+13,q.y);x.lineTo(q.x,q.y+18);x.lineTo(q.x-13,q.y);x.fill()}for(const e of enemies)if(e.alive){x.fillStyle='#2e2942';rr(e.x,e.y,48,42,8);x.fill();x.fillStyle='#ff3f72';x.beginPath();x.arc(e.x+31,e.y+19,6,0,7);x.fill()}shots.forEach(yarn);for(const s of enemyShots){x.fillStyle='#ff3b79';x.beginPath();x.arc(s.x,s.y,6,0,7);x.fill()}cat();for(const p of particles){x.globalAlpha=Math.max(0,p.life);x.fillStyle=p.col;x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()}x.globalAlpha=1;x.restore()}
function loop(ts){const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
})();