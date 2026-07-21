(()=>{
'use strict';

const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const msg=document.getElementById('message');
const startBtn=document.getElementById('startBtn');
const heartsEl=document.getElementById('hearts');
const enemiesEl=document.getElementById('enemies');
const crystalsEl=document.getElementById('crystals');
const timeEl=document.getElementById('time');
const pauseBtn=document.getElementById('pauseBtn');
const pauseMenu=document.getElementById('pauseMenu');
const resumeBtn=document.getElementById('resumeBtn');
const restartBtn=document.getElementById('restartBtn');
const mainMenuBtn=document.getElementById('mainMenuBtn');
const langButtons=[...document.querySelectorAll('[data-lang]')];
const musicSliders=[...document.querySelectorAll('[data-volume=music]')];
const sfxSliders=[...document.querySelectorAll('[data-volume=sfx]')];

let W=0,H=0,screenW=0,screenH=0,viewScale=.72,dpr=1,last=0,t=0,started=false,won=false,paused=false;
let language=localStorage.getItem('flip-language')||'ru';
const world={width:5200,floor:0,ceiling:76};

const savedProgress=(()=>{
  try{return JSON.parse(localStorage.getItem('flip-progress')||'{}')}
  catch{return{}}
})();
let currentLevel=Math.max(0,Math.min(1,Number(savedProgress.currentLevel||0)));
let portalTransition=false;

function saveLevelResult(){
  const data=(()=>{
    try{return JSON.parse(localStorage.getItem('flip-progress')||'{}')}
    catch{return{}}
  })();

  data.levels=data.levels||{};
  const key=String(currentLevel+1);
  const old=data.levels[key]||{};
  const result={
    time:Number(t.toFixed(1)),
    kills:player.kills,
    crystals:player.collected
  };

  data.levels[key]={
    completed:true,
    bestTime:old.bestTime?Math.min(Number(old.bestTime),result.time):result.time,
    maxKills:Math.max(Number(old.maxKills||0),result.kills),
    maxCrystals:Math.max(Number(old.maxCrystals||0),result.crystals)
  };

  data.unlocked=Math.max(Number(data.unlocked||1),Math.min(2,currentLevel+2));
  data.currentLevel=currentLevel;
  localStorage.setItem('flip-progress',JSON.stringify(data));
  Object.assign(savedProgress,data);
  return data.levels[key];
}
const camera={x:0,shake:0,flash:0};
const keys={left:false,right:false,flip:false,shoot:false};


// Audio: two looping music tracks + lightweight procedural SFX.
// Browsers require the first sound to be unlocked by a user gesture.
const audio={
  ctx:null,
  master:null,
  musicBus:null,
  sfxBus:null,
  musicSources:{},
  musicGains:{},
  unlocked:false,
  muted:false,
  musicVolume:Number(localStorage.getItem('flip-music-volume')||.24),
  sfxVolume:Number(localStorage.getItem('flip-sfx-volume')||.95),
  current:null,
  fadeToken:0,
  tracks:{
    menu:new Audio('Menu.mp3'),
    game:new Audio('1round.Moonfern Circuit.mp3')
  },
  init(){
    this.musicVolume=clamp(Number.isFinite(this.musicVolume)?this.musicVolume:.24,0,1);
    this.sfxVolume=clamp(Number.isFinite(this.sfxVolume)?this.sfxVolume:.95,0,1);
    for(const track of Object.values(this.tracks)){
      track.loop=true;
      track.preload='auto';
      track.volume=1;
    }
    this.muted=localStorage.getItem('flip-muted')==='1';
    addEventListener('visibilitychange',()=>{
      if(document.hidden){
        for(const tr of Object.values(this.tracks))tr.pause();
      }else if(this.unlocked&&this.current&&!this.muted){
        this.current.play().catch(()=>{});
      }
    });
  },
  unlock(){
    if(this.unlocked){
      if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
      return;
    }
    this.unlocked=true;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){
      this.ctx=new AC();
      this.master=this.ctx.createGain();
      this.musicBus=this.ctx.createGain();
      this.sfxBus=this.ctx.createGain();

      this.master.gain.value=this.muted?0:1;
      this.musicBus.gain.value=this.musicVolume;
      this.sfxBus.gain.value=this.sfxVolume;

      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);

      for(const [name,track] of Object.entries(this.tracks)){
        try{
          const source=this.ctx.createMediaElementSource(track);
          const gain=this.ctx.createGain();
          gain.gain.value=0;
          source.connect(gain);
          gain.connect(this.musicBus);
          this.musicSources[name]=source;
          this.musicGains[name]=gain;
        }catch(err){
          console.warn('Music Web Audio setup failed:',err);
        }
      }
      this.ctx.resume().catch(()=>{});
    }
    if(!started)this.playMusic('menu',700);
  },
  setMuted(value){
    this.muted=Boolean(value);
    localStorage.setItem('flip-muted',this.muted?'1':'0');
    if(this.master&&this.ctx){
      const now=this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted?0:1,now,.025);
    }else{
      for(const tr of Object.values(this.tracks))tr.muted=this.muted;
    }
    if(!this.muted&&this.current)this.current.play().catch(()=>{});
  },
  setMusicVolume(v){
    this.musicVolume=clamp(Number(v)||0,0,1);
    localStorage.setItem('flip-music-volume',String(this.musicVolume));
    if(this.musicBus&&this.ctx){
      const now=this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setTargetAtTime(this.musicVolume,now,.015);
    }else{
      for(const tr of Object.values(this.tracks)){
        tr.volume=tr===this.current?this.musicVolume:0;
      }
    }
  },
  setSfxVolume(v){
    this.sfxVolume=clamp(Number(v)||0,0,1);
    localStorage.setItem('flip-sfx-volume',String(this.sfxVolume));
    if(this.sfxBus&&this.ctx){
      const now=this.ctx.currentTime;
      this.sfxBus.gain.cancelScheduledValues(now);
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume,now,.015);
    }
  },
  toggleMute(){
    this.setMuted(!this.muted);
    if(!this.muted)this.sfx('uiOn');
  },
  async playMusic(name,fade=650){
    const next=this.tracks[name];
    if(!next)return;
    this.current=next;
    if(!this.unlocked||this.muted)return;
    if(this.ctx&&this.ctx.state==='suspended')await this.ctx.resume().catch(()=>{});

    const token=++this.fadeToken;
    const oldEntry=Object.entries(this.tracks).find(([key,tr])=>key!==name&&!tr.paused);
    const oldName=oldEntry?oldEntry[0]:null;
    const old=oldEntry?oldEntry[1]:null;

    next.muted=false;
    next.volume=1;
    try{await next.play()}catch{return}

    if(this.musicBus&&this.ctx&&this.musicGains[name]){
      const now=this.ctx.currentTime;
      const seconds=Math.max(.01,fade/1000);
      const nextGain=this.musicGains[name].gain;
      nextGain.cancelScheduledValues(now);
      nextGain.setValueAtTime(nextGain.value,now);
      nextGain.linearRampToValueAtTime(1,now+seconds);

      if(oldName&&this.musicGains[oldName]){
        const oldGain=this.musicGains[oldName].gain;
        oldGain.cancelScheduledValues(now);
        oldGain.setValueAtTime(oldGain.value,now);
        oldGain.linearRampToValueAtTime(0,now+seconds);
      }

      setTimeout(()=>{
        if(token!==this.fadeToken)return;
        if(old){
          old.pause();
          old.currentTime=0;
        }
      },fade+40);
      return;
    }

    // Fallback for browsers without Web Audio media routing.
    next.volume=0;
    const startedAt=performance.now();
    const startOld=old?old.volume:0;
    const step=now=>{
      if(token!==this.fadeToken)return;
      const k=Math.min(1,(now-startedAt)/Math.max(1,fade));
      next.volume=this.musicVolume*k;
      if(old)old.volume=startOld*(1-k);
      if(k<1)requestAnimationFrame(step);
      else if(old){old.pause();old.currentTime=0}
    };
    requestAnimationFrame(step);
  },
  tone(freq=440,duration=.1,type='sine',gain=.12,slide=1,delay=0){
    if(!this.ctx||this.muted)return;
    const now=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),now+duration);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(gain,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+duration);
    o.connect(g);g.connect(this.sfxBus);o.start(now);o.stop(now+duration+.03);
  },
  noise(duration=.1,gain=.08,highpass=300,delay=0){
    if(!this.ctx||this.muted)return;
    const len=Math.ceil(this.ctx.sampleRate*duration),buffer=this.ctx.createBuffer(1,len,this.ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
    const src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),g=this.ctx.createGain(),now=this.ctx.currentTime+delay;
    src.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass;g.gain.setValueAtTime(gain,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);
    src.connect(filter);filter.connect(g);g.connect(this.sfxBus);src.start(now);
  },
  sfx(name){
    if(!this.unlocked)this.unlock();
    switch(name){
      case'ui':this.tone(520,.055,'sine',.07,1.25);break;
      case'uiOn':this.tone(440,.07,'sine',.07,1.5);this.tone(660,.08,'sine',.06,1.25,.06);break;
      case'uiOff':this.tone(420,.12,'triangle',.07,.55);break;
      case'flip':this.tone(280,.18,'sine',.20,2.7);this.noise(.14,.075,900);break;
      case'shoot':this.tone(520,.11,'triangle',.18,.45);this.noise(.08,.085,1200);break;
      case'enemyShoot':this.tone(190,.12,'sawtooth',.055,1.7);break;
      case'hit':this.noise(.09,.09,700);this.tone(130,.08,'square',.055,.7);break;
      case'explode':this.noise(.28,.18,90);this.tone(105,.30,'sawtooth',.10,.35);break;
      case'crystal':this.tone(760,.12,'sine',.10,1.35);this.tone(1140,.15,'sine',.07,1.18,.07);break;
      case'hurt':this.noise(.18,.14,180);this.tone(180,.28,'sawtooth',.12,.42);break;
      case'portal':for(let i=0;i<5;i++)this.tone(330*Math.pow(1.26,i),.24,'sine',.07,1.12,i*.075);break;
      case'land':this.noise(.075,.075,120);break;
    }
  }
};
audio.init();
['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>audio.unlock(),{once:true,passive:true}));
const i18n={
 ru:{lead:'Лунный лес ждёт',desc:'Переворачивай гравитацию, собирай кристаллы и отбивайся от роботов.',start:'НАЧАТЬ',pause:'ПАУЗА',resume:'ПРОДОЛЖИТЬ',restart:'НАЧАТЬ ЗАНОВО',menu:'В ГЛАВНОЕ МЕНЮ',language:'Язык',music:'Музыка',sfx:'Звуки игры',gameOverTitle:'ЕЩЁ РАЗ',gameOverLead:'Мини-кошка не сдаётся',again:'СНОВА',victoryTitle:'ПОРТАЛ',robots:'Роботы',crystalWord:'Кристаллы',timeWord:'Время',seconds:'сек.',level:'УРОВЕНЬ',complete:'ПРОЙДЕН',next:'Переход на следующий уровень…',best:'Лучшее время',finish:'ИГРА ПРОЙДЕНА',againAll:'ИГРАТЬ СНАЧАЛА'},
 en:{lead:'The moon forest awaits',desc:'Flip gravity, collect crystals and fight off the robots.',start:'START',pause:'PAUSED',resume:'RESUME',restart:'RESTART',menu:'MAIN MENU',language:'Language',music:'Music',sfx:'Game sounds',gameOverTitle:'TRY AGAIN',gameOverLead:'The little cat never gives up',again:'AGAIN',victoryTitle:'PORTAL',robots:'Robots',crystalWord:'Crystals',timeWord:'Time',seconds:'sec.',level:'LEVEL',complete:'COMPLETE',next:'Moving to the next level…',best:'Best time',finish:'GAME COMPLETE',againAll:'PLAY AGAIN'}
};
function applyLanguage(){
 const t=i18n[language];document.documentElement.lang=language;
 document.getElementById('menuLead').textContent=t.lead;document.getElementById('menuDesc').textContent=t.desc;startBtn.textContent=t.start;
 document.getElementById('pauseTitle').textContent=t.pause;resumeBtn.textContent=t.resume;restartBtn.textContent=t.restart;if(mainMenuBtn)mainMenuBtn.textContent=t.menu;
 document.querySelectorAll('[data-text=language]').forEach(e=>e.textContent=t.language);
 document.querySelectorAll('[data-text=music]').forEach(e=>e.textContent=t.music);
 document.querySelectorAll('[data-text=sfx]').forEach(e=>e.textContent=t.sfx);
 langButtons.forEach(b=>b.classList.toggle('active',b.dataset.lang===language));
}
langButtons.forEach(b=>b.onclick=()=>{language=b.dataset.lang;localStorage.setItem('flip-language',language);applyLanguage();audio.sfx('ui')});
function syncVolumes(){const mv=Math.round(audio.musicVolume*100),sv=Math.round(audio.sfxVolume*100);musicSliders.forEach(s=>s.value=mv);sfxSliders.forEach(s=>s.value=sv);document.querySelectorAll('[data-value=music]').forEach(e=>e.textContent=mv+'%');document.querySelectorAll('[data-value=sfx]').forEach(e=>e.textContent=sv+'%')}
musicSliders.forEach(slider=>{const apply=e=>{audio.setMusicVolume(+e.target.value/100);syncVolumes()};slider.addEventListener('input',apply);slider.addEventListener('change',apply)});
sfxSliders.forEach(slider=>{const apply=e=>{audio.setSfxVolume(+e.target.value/100);syncVolumes()};slider.addEventListener('input',apply);slider.addEventListener('change',e=>{apply(e);audio.sfx('ui')})});
function openPause(){
  if(!started||paused)return;
  paused=true;
  keys.left=false;keys.right=false;keys.flip=false;keys.shoot=false;
  flipLock=false;shootLock=false;
  pauseMenu.classList.add('show');
  audio.sfx('ui');
}

function closePause(){
  if(!paused)return;
  paused=false;
  pauseMenu.classList.remove('show');
  last=performance.now();
  audio.sfx('ui');
}

pauseBtn.onclick=()=>{
  if(paused)closePause();
  else openPause();
};

resumeBtn.onclick=closePause;

restartBtn.onclick=()=>{
  paused=false;
  pauseMenu.classList.remove('show');
  audio.sfx('ui');
  audio.playMusic('game',500);
  reset();
  last=performance.now();
};

if(mainMenuBtn)mainMenuBtn.onclick=()=>{
  paused=false;
  started=false;
  won=false;
  keys.left=false;keys.right=false;keys.flip=false;keys.shoot=false;
  pauseMenu.classList.remove('show');
  pauseBtn.classList.remove('show');
  msg.innerHTML=`<div class="panel"><div class="catBadge">🐈‍⬛</div><h1>FLIP</h1><p id="menuLead" class="lead">${i18n[language].lead}</p><p id="menuDesc" class="small">${i18n[language].desc}</p><div class="settings"><div class="settingRow languageRow"><span data-text="language">${i18n[language].language}</span><div class="segmented"><button class="miniBtn ${language==='ru'?'active':''}" data-lang="ru">РУС</button><button class="miniBtn ${language==='en'?'active':''}" data-lang="en">ENG</button></div></div><label class="settingRow"><span data-text="music">${i18n[language].music}</span><input data-volume="music" type="range" min="0" max="100" value="${Math.round(audio.musicVolume*100)}"><output data-value="music">${Math.round(audio.musicVolume*100)}%</output></label><label class="settingRow"><span data-text="sfx">${i18n[language].sfx}</span><input data-volume="sfx" type="range" min="0" max="100" value="${Math.round(audio.sfxVolume*100)}"><output data-value="sfx">${Math.round(audio.sfxVolume*100)}%</output></label></div><button id="startBtn">${i18n[language].start}</button></div>`;
  msg.classList.add('show');
  audio.playMusic('menu',500);
  location.reload();
};


applyLanguage();
syncVolumes();

function resize(){
  dpr=Math.min(devicePixelRatio||1,2);
  screenW=innerWidth;
  screenH=innerHeight;
  const mobile=matchMedia('(pointer:coarse)').matches||screenW<900;
  viewScale=mobile?.70:.82;
  W=screenW/viewScale;
  H=screenH/viewScale;
  canvas.width=Math.floor(screenW*dpr);
  canvas.height=Math.floor(screenH*dpr);
  canvas.style.width=screenW+'px';
  canvas.style.height=screenH+'px';
  ctx.setTransform(dpr*viewScale,0,0,dpr*viewScale,0,0);
  world.floor=H-138;
}

addEventListener('resize',resize);resize();

const LEVELS=[
  {
    name:'MOON FOREST',
    width:5200,
    platforms:[
      {x:0,y:0,w:650,h:92},{x:760,y:0,w:420,h:92},{x:1280,y:0,w:520,h:92},{x:1930,y:0,w:620,h:92},
      {x:2680,y:0,w:430,h:92},{x:3250,y:0,w:620,h:92},{x:4000,y:0,w:480,h:92},{x:4600,y:0,w:600,h:92},
      {x:500,y:-150,w:190,h:32},{x:1050,y:-255,w:210,h:32},{x:1530,y:-170,w:170,h:32},{x:2210,y:-245,w:230,h:32},
      {x:2870,y:-185,w:210,h:32},{x:3510,y:-265,w:220,h:32},{x:4210,y:-195,w:220,h:32},{x:4800,y:-275,w:230,h:32},
      {x:680,y:1,w:290,h:38,ceiling:true},{x:1450,y:1,w:360,h:38,ceiling:true},{x:2280,y:1,w:330,h:38,ceiling:true},
      {x:3100,y:1,w:350,h:38,ceiling:true},{x:3900,y:1,w:300,h:38,ceiling:true},{x:4550,y:1,w:390,h:38,ceiling:true}
    ],
    crystals:[
      {x:590,y:-205},{x:1130,y:-310},{x:1620,y:-230},{x:2330,y:-300},{x:2955,y:-245},
      {x:3620,y:-315},{x:4310,y:-255},{x:4680,y:-330},{x:5000,y:-235}
    ],
    enemies:[
      {x:970,dir:1,min:820,max:1130,ceiling:false,type:0},
      {x:1510,dir:1,min:1470,max:1740,ceiling:true,type:1},
      {x:2140,dir:-1,min:1990,max:2440,ceiling:false,type:0},
      {x:3070,dir:1,min:2880,max:3330,ceiling:false,type:1},
      {x:3650,dir:-1,min:3500,max:3820,ceiling:true,type:0},
      {x:4280,dir:1,min:4080,max:4440,ceiling:false,type:1},
      {x:4820,dir:-1,min:4660,max:5070,ceiling:false,type:2}
    ],
    lamps:[360,850,1320,1870,2600,3180,3970,4520,5000],
    ruins:[1150,2410,3380,4460]
  },
  {
    name:'CRYSTAL CAVES',
    width:5600,
    platforms:[
      {x:0,y:0,w:540,h:92},{x:680,y:0,w:350,h:92},{x:1160,y:0,w:430,h:92},{x:1740,y:0,w:330,h:92},
      {x:2200,y:0,w:500,h:92},{x:2830,y:0,w:330,h:92},{x:3300,y:0,w:470,h:92},{x:3910,y:0,w:360,h:92},
      {x:4410,y:0,w:420,h:92},{x:4970,y:0,w:630,h:92},
      {x:390,y:-210,w:170,h:32},{x:820,y:-305,w:190,h:32},{x:1330,y:-185,w:210,h:32},{x:1880,y:-285,w:180,h:32},
      {x:2380,y:-205,w:200,h:32},{x:2930,y:-315,w:170,h:32},{x:3450,y:-220,w:230,h:32},{x:4060,y:-300,w:170,h:32},
      {x:4580,y:-210,w:200,h:32},{x:5200,y:-310,w:220,h:32},
      {x:550,y:1,w:300,h:38,ceiling:true},{x:1050,y:1,w:360,h:38,ceiling:true},{x:1580,y:1,w:390,h:38,ceiling:true},
      {x:2660,y:1,w:360,h:38,ceiling:true},{x:3720,y:1,w:400,h:38,ceiling:true},{x:4770,y:1,w:390,h:38,ceiling:true}
    ],
    crystals:[
      {x:470,y:-265},{x:900,y:-360},{x:1420,y:-240},{x:1960,y:-340},{x:2470,y:-260},
      {x:3010,y:-370},{x:3550,y:-275},{x:4140,y:-355},{x:4680,y:-265},{x:5320,y:-365}
    ],
    enemies:[
      {x:760,dir:1,min:700,max:980,ceiling:false,type:1},
      {x:1240,dir:-1,min:1180,max:1540,ceiling:true,type:0},
      {x:1830,dir:1,min:1770,max:2020,ceiling:false,type:1},
      {x:2300,dir:1,min:2220,max:2610,ceiling:false,type:0},
      {x:2920,dir:-1,min:2850,max:3090,ceiling:true,type:1},
      {x:3390,dir:1,min:3320,max:3710,ceiling:false,type:0},
      {x:4010,dir:-1,min:3940,max:4240,ceiling:false,type:1},
      {x:4550,dir:1,min:4450,max:4780,ceiling:true,type:0},
      {x:5200,dir:-1,min:5050,max:5480,ceiling:false,type:2}
    ],
    lamps:[300,730,1210,1700,2250,2790,3330,3880,4400,5050,5480],
    ruins:[980,2050,3150,4310]
  }
];

let platforms=[];
let crystalBlueprint=[];
let enemyBlueprint=[];
let crystals=[],enemies=[],shots=[],enemyShots=[],particles=[],sparks=[];
let lamps=[];
let ruins=[];

function loadLevel(index){
  currentLevel=Math.max(0,Math.min(LEVELS.length-1,index));
  const level=LEVELS[currentLevel];
  world.width=level.width;
  platforms=level.platforms.map(item=>({...item}));
  crystalBlueprint=level.crystals.map(item=>({...item}));
  enemyBlueprint=level.enemies.map(item=>({...item}));
  lamps=[...level.lamps];
  ruins=[...level.ruins];
  portalTransition=false;
}

loadLevel(currentLevel);

const player={x:120,y:0,vx:0,vy:0,w:60,h:52,gravity:1,onGround:false,face:1,lives:3,kills:0,collected:0,inv:0,shootCd:0,squash:0};

function platformRect(p){
  if(p.ceiling)return{x:p.x,y:world.ceiling,w:p.w,h:p.h};
  if(p.h===92)return{x:p.x,y:world.floor,w:p.w,h:p.h};
  return{x:p.x,y:world.floor+p.y,w:p.w,h:p.h};
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function spawn(x,y,n=12,color='#e8ddff',speed=240){
  for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*speed,vy:(Math.random()-.75)*speed,life:.4+Math.random()*.75,size:1.5+Math.random()*4.5,color});
}
function updateHud(){
  heartsEl.textContent='♥'.repeat(player.lives)+'♡'.repeat(3-player.lives);
  enemiesEl.textContent=`☠ ${player.kills}/${enemyBlueprint.length}`;
  crystalsEl.textContent=`◆ ${player.collected}/${crystalBlueprint.length}`;
}
function reset(){
  loadLevel(currentLevel);
  paused=false;pauseMenu.classList.remove('show');pauseBtn.classList.add('show');
  player.x=120;player.y=world.floor-player.h;player.vx=0;player.vy=0;player.gravity=1;player.onGround=false;player.lives=3;player.kills=0;player.collected=0;player.inv=0;player.shootCd=0;player.squash=0;
  crystals=crystalBlueprint.map(o=>({...o,taken:false,p:Math.random()*6}));
  enemies=enemyBlueprint.map(o=>({...o,hp:o.type===2?4:2,alive:true,fire:1+Math.random()*2,hit:0,walk:Math.random()*6}));
  shots=[];enemyShots=[];particles=[];sparks=[];camera.x=0;camera.shake=0;camera.flash=0;t=0;won=false;updateHud();msg.classList.remove('show');
}
function bind(id,key,pulse=false){
  const el=document.getElementById(id);
  const on=e=>{e.preventDefault();keys[key]=true;if(pulse)setTimeout(()=>keys[key]=false,90)};
  const off=e=>{e.preventDefault();if(!pulse)keys[key]=false};
  el.addEventListener('pointerdown',on);
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,off));
}
bind('leftBtn','left');bind('rightBtn','right');bind('flipBtn','flip',true);bind('shootBtn','shoot',true);

addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();paused?closePause():openPause();return}
  if(['ArrowLeft','a','A'].includes(e.key))keys.left=true;
  if(['ArrowRight','d','D'].includes(e.key))keys.right=true;
  if(['ArrowUp','w','W',' ','f','F','Shift'].includes(e.key)){e.preventDefault();keys.flip=true}
  if(['x','X','k','K','Control'].includes(e.key))keys.shoot=true;
  if(['m','M'].includes(e.key))audio.toggleMute();
});
addEventListener('keyup',e=>{
  if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;
  if(['ArrowRight','d','D'].includes(e.key))keys.right=false;
  if(['ArrowUp','w','W',' ','f','F','Shift'].includes(e.key))keys.flip=false;
  if(['x','X','k','K','Control'].includes(e.key))keys.shoot=false;
});
startBtn.onclick=()=>{audio.unlock();audio.sfx('ui');audio.playMusic('game',850);started=true;paused=false;pauseBtn.classList.add('show');reset()};

let flipLock=false,shootLock=false;

function hurt(){
  if(player.inv>0||won)return;
  audio.sfx('hurt');player.lives--;player.inv=1.25;camera.shake=22;camera.flash=.24;spawn(player.x+30,player.y+26,40,'#ff6e9d',300);updateHud();
  if(player.lives<=0){
    const tr=i18n[language];msg.innerHTML=`<div class="panel"><div class="catBadge">🐈‍⬛</div><h1>${tr.gameOverTitle}</h1><p class="lead">${tr.gameOverLead}</p><button id="againBtn">${tr.again}</button></div>`;
    msg.classList.add('show');document.getElementById('againBtn').onclick=()=>{audio.sfx('ui');audio.playMusic('game',500);reset();last=performance.now()};
  }else{
    player.x=Math.max(120,player.x-220);player.y=player.gravity>0?world.floor-player.h:world.ceiling;player.vx=0;player.vy=0;
  }
}

function shoot(){
  if(player.shootCd>0)return;
  player.shootCd=.25;audio.sfx('shoot');
  const sy=player.y+player.h*.48;
  shots.push({x:player.x+player.w/2+player.face*34,y:sy,vx:player.face*650,life:1.7,rot:Math.random()*6,trail:[]});
  camera.shake=3;spawn(player.x+player.w/2+player.face*30,sy,9,'#fff1e6',150);
}

function update(dt){
  if(!started||paused||won||player.lives<=0)return;
  t+=dt;timeEl.textContent=t.toFixed(1);
  player.inv=Math.max(0,player.inv-dt);player.shootCd=Math.max(0,player.shootCd-dt);camera.flash=Math.max(0,camera.flash-dt);

  const accel=1650,max=305,friction=1750;
  if(keys.left){player.vx-=accel*dt;player.face=-1}
  if(keys.right){player.vx+=accel*dt;player.face=1}
  if(!keys.left&&!keys.right){const s=Math.sign(player.vx);player.vx-=s*Math.min(Math.abs(player.vx),friction*dt)}
  player.vx=clamp(player.vx,-max,max);

  if(keys.flip&&!flipLock){
    player.gravity*=-1;player.vy=player.gravity*95;player.onGround=false;camera.shake=10;camera.flash=.12;
    spawn(player.x+30,player.y+26,28,'#c97bff',260);audio.sfx('flip');
  }
  flipLock=keys.flip;

  if(keys.shoot&&!shootLock)shoot();
  shootLock=keys.shoot;

  player.vy+=1320*player.gravity*dt;
  player.vy=clamp(player.vy,-900,900);
  player.x=clamp(player.x+player.vx*dt,0,world.width-player.w);

  const oldY=player.y;
  player.y+=player.vy*dt;
  player.onGround=false;
  let pr={x:player.x,y:player.y,w:player.w,h:player.h};

  for(const p of platforms){
    const r=platformRect(p);
    if(!overlap(pr,r))continue;
    if(player.gravity===1&&player.vy>=0&&oldY+player.h<=r.y+15){
      player.y=r.y-player.h;player.vy=0;player.onGround=true;player.squash=.14;if(Math.abs(oldY-player.y)>5)audio.sfx('land');
    }else if(player.gravity===-1&&player.vy<=0&&oldY>=r.y+r.h-15){
      player.y=r.y+r.h;player.vy=0;player.onGround=true;player.squash=.14;if(Math.abs(oldY-player.y)>5)audio.sfx('land');
    }else if(player.vx>0){player.x=r.x-player.w;player.vx=0}
    else if(player.vx<0){player.x=r.x+r.w;player.vx=0}
  }

  if(player.y>H+320||player.y<-320)hurt();

  for(const q of crystals){
    if(q.taken)continue;
    const cy=world.floor+q.y;
    if(Math.hypot(player.x+30-q.x,player.y+26-cy)<48){
      q.taken=true;player.collected++;audio.sfx('crystal');spawn(q.x,cy,32,'#e889ff',290);updateHud();
    }
  }

  for(const e of enemies){
    if(!e.alive)continue;
    e.hit=Math.max(0,e.hit-dt);e.walk+=dt*4;
    e.x+=e.dir*(e.type===2?42:58)*dt;
    if(e.x<e.min||e.x>e.max)e.dir*=-1;
    e.fire-=dt;
    const ey=e.ceiling?world.ceiling+7:world.floor-48;
    if(e.fire<=0&&Math.abs(e.x-player.x)<700){
      const dx=player.x-e.x,dy=player.y-ey,len=Math.hypot(dx,dy)||1;
      audio.sfx('enemyShoot');enemyShots.push({x:e.x+27,y:ey+23,vx:dx/len*(e.type===2?335:270),vy:dy/len*(e.type===2?335:270),life:3.2,type:e.type,trail:[]});
      e.fire=(e.type===2?.9:1.55)+Math.random()*1.1;
    }
    if(overlap(pr,{x:e.x,y:ey,w:54,h:46}))hurt();
  }

  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];
    s.trail.unshift({x:s.x,y:s.y,a:.6});if(s.trail.length>7)s.trail.pop();s.trail.forEach(p=>p.a*=.72);
    s.x+=s.vx*dt;s.rot+=dt*12;s.life-=dt;
    let hit=false;
    for(const e of enemies){
      if(!e.alive)continue;
      const ey=e.ceiling?world.ceiling+7:world.floor-48;
      if(overlap({x:s.x-10,y:s.y-10,w:20,h:20},{x:e.x,y:ey,w:54,h:46})){
        e.hp--;e.hit=.16;audio.sfx('hit');spawn(s.x,s.y,20,'#f1dfd0',220);camera.shake=7;hit=true;
        if(e.hp<=0){e.alive=false;player.kills++;audio.sfx('explode');spawn(e.x+27,ey+23,e.type===2?64:44,e.type===2?'#ffb548':'#c36dff',330);updateHud()}
        break;
      }
    }
    if(hit||s.life<=0)shots.splice(i,1);
  }

  for(let i=enemyShots.length-1;i>=0;i--){
    const s=enemyShots[i];
    s.trail.unshift({x:s.x,y:s.y,a:.65});if(s.trail.length>8)s.trail.pop();s.trail.forEach(p=>p.a*=.74);
    s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
    if(overlap(pr,{x:s.x-9,y:s.y-9,w:18,h:18})){enemyShots.splice(i,1);hurt();continue}
    if(s.life<=0)enemyShots.splice(i,1);
  }

  if(player.x>world.width-175&&!portalTransition){
    portalTransition=true;
    won=true;
    audio.sfx('portal');
    spawn(player.x,player.y,80,'#dcb8ff',340);

    const tr=i18n[language];
    const best=saveLevelResult();
    const finalLevel=currentLevel===LEVELS.length-1;

    msg.innerHTML=`<div class="panel"><div class="catBadge">🐈‍⬛</div><h1>${finalLevel?tr.finish:`${tr.level} ${currentLevel+1} ${tr.complete}`}</h1><p class="lead">${tr.robots}: ${player.kills}/${enemyBlueprint.length} · ${tr.crystalWord}: ${player.collected}/${crystalBlueprint.length}</p><p class="small">${tr.timeWord}: ${t.toFixed(1)} ${tr.seconds}<br>${tr.best}: ${Number(best.bestTime).toFixed(1)} ${tr.seconds}</p>${finalLevel?`<button id="againBtn">${tr.againAll}</button>`:`<p class="small">${tr.next}</p>`}</div>`;
    msg.classList.add('show');

    if(finalLevel){
      const button=document.getElementById('againBtn');
      button.onclick=()=>{
        currentLevel=0;
        savedProgress.currentLevel=0;
        localStorage.setItem('flip-progress',JSON.stringify(savedProgress));
        audio.sfx('ui');
        audio.playMusic('game',500);
        reset();
        last=performance.now();
      };
    }else{
      setTimeout(()=>{
        currentLevel++;
        savedProgress.currentLevel=currentLevel;
        localStorage.setItem('flip-progress',JSON.stringify(savedProgress));
        reset();
        last=performance.now();
      },1400);
    }
  }

  player.squash=Math.max(0,player.squash-dt);
  const target=player.x-W*.27;
  camera.x+=(target-camera.x)*Math.min(1,dt*4.8);
  camera.x=clamp(camera.x,0,world.width-W);
  camera.shake=Math.max(0,camera.shake-dt*34);

  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=250*dt;p.life-=dt});
  particles=particles.filter(p=>p.life>0);
}

function glow(x,y,r,c,a=.35){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,c.replace('ALPHA',a));
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}
function hill(y,a,f,s,o,fill){
  ctx.beginPath();ctx.moveTo(0,H);
  for(let x=0;x<=W+30;x+=24){
    const wx=x+camera.x*s;
    ctx.lineTo(x,y+Math.sin(wx*f+o)*a+Math.sin(wx*f*.37)*a*.5);
  }
  ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}

function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#070218');g.addColorStop(.24,'#241153');g.addColorStop(.52,'#223b72');g.addColorStop(.76,'#15576b');g.addColorStop(1,'#0a3c32');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

  const aur=ctx.createLinearGradient(0,H*.15,W,H*.72);
  aur.addColorStop(0,'rgba(200,72,255,0)');
  aur.addColorStop(.34,'rgba(200,72,255,.18)');
  aur.addColorStop(.64,'rgba(72,226,220,.10)');
  aur.addColorStop(1,'rgba(72,226,220,0)');
  ctx.fillStyle=aur;ctx.fillRect(0,H*.08,W,H*.70);

  for(let i=0;i<90;i++){
    const sx=(i*157+67-camera.x*.022)%(W+140)-70;
    const sy=35+(i*83)%Math.max(150,H*.55);
    const a=.25+.6*Math.abs(Math.sin(t*.65+i));
    ctx.globalAlpha=a;ctx.fillStyle=i%9===0?'#d39cff':'#e4fbff';
    ctx.beginPath();ctx.arc(sx,sy,1+(i%3)*.55,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;

  const mx=W*.26-camera.x*.015,my=H*.27;
  const halo=ctx.createRadialGradient(mx,my,10,mx,my,150);
  halo.addColorStop(0,'rgba(255,244,196,.44)');halo.addColorStop(1,'rgba(255,244,196,0)');
  ctx.fillStyle=halo;ctx.fillRect(mx-150,my-150,300,300);
  ctx.fillStyle='#f6edc9';ctx.beginPath();ctx.arc(mx,my,48,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(205,196,170,.16)';ctx.beginPath();ctx.arc(mx-13,my-8,9,0,Math.PI*2);ctx.arc(mx+15,my+12,6,0,Math.PI*2);ctx.fill();

  hill(H*.55,50,.004,.05,0,'rgba(29,23,81,.72)');
  hill(H*.64,60,.005,.11,1.3,'rgba(18,46,82,.86)');
  hill(H*.74,68,.007,.20,2.4,'rgba(8,51,58,.96)');

  ctx.save();
  ctx.translate(W*.66-camera.x*.12,H*.65);
  ctx.fillStyle='rgba(13,16,39,.72)';
  for(let i=0;i<9;i++){
    const bx=i*24;const bh=42+(i%4)*22;
    ctx.fillRect(bx,-bh,17,bh);
    if(i%2===0){ctx.fillStyle='rgba(255,151,86,.72)';ctx.fillRect(bx+5,-bh+15,4,7);ctx.fillStyle='rgba(13,16,39,.72)'}
  }
  ctx.restore();

  for(let i=0;i<38;i++){
    const tx=(i*170-camera.x*.33)%(W+280)-140;
    const th=130+(i%6)*24;
    ctx.fillStyle='rgba(4,25,32,.78)';
    ctx.fillRect(tx,H*.74-th*.22,14,th);
    const cg=ctx.createRadialGradient(tx+7,H*.74-th*.22,4,tx+7,H*.74-th*.22,46+(i%4)*10);
    cg.addColorStop(0,'rgba(19,69,69,.88)');cg.addColorStop(1,'rgba(3,24,30,.96)');
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(tx+7,H*.74-th*.22,46+(i%4)*10,0,Math.PI*2);ctx.fill();
  }

  for(let i=0;i<40;i++){
    const tx=(i*145-camera.x*.27)%(W+260)-130;
    const r=38+(i%5)*10,ty=38+(i%4)*11;
    const cg=ctx.createRadialGradient(tx,ty,3,tx,ty,r);
    cg.addColorStop(0,'rgba(186,82,255,.95)');
    cg.addColorStop(.50,'rgba(92,36,151,.97)');
    cg.addColorStop(1,'rgba(17,8,39,.99)');
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(tx,ty,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(25,12,50,.98)';ctx.fillRect(tx-6,0,12,ty+20);
  }

  ctx.strokeStyle='rgba(104,69,140,.58)';ctx.lineWidth=2;
  for(let i=0;i<20;i++){
    const vx=(i*230-camera.x*.23)%(W+280)-90,len=38+(i%5)*21;
    ctx.beginPath();ctx.moveTo(vx,15);ctx.quadraticCurveTo(vx+14,20+len*.45,vx-3,18+len);ctx.stroke();
  }

  const fog=ctx.createLinearGradient(0,H*.50,0,H);
  fog.addColorStop(0,'rgba(100,130,180,0)');fog.addColorStop(1,'rgba(70,172,145,.16)');
  ctx.fillStyle=fog;ctx.fillRect(0,H*.45,W,H*.55);
}

function drawStonePlatform(r,ceiling){
  ctx.save();
  const grad=ctx.createLinearGradient(0,r.y,0,r.y+r.h);
  grad.addColorStop(0,ceiling?'#52375f':'#404657');grad.addColorStop(1,'#181c28');
  ctx.fillStyle=grad;rr(r.x,r.y,r.w,r.h,12);ctx.fill();

  ctx.fillStyle='rgba(255,255,255,.045)';
  for(let bx=r.x+9;bx<r.x+r.w-8;bx+=48){
    for(let by=r.y+13;by<r.y+r.h-8;by+=23){
      rr(bx+((by/23)%2)*13,by,35,13,4);ctx.fill();
    }
  }

  ctx.strokeStyle='rgba(187,170,207,.22)';ctx.lineWidth=2;ctx.stroke();
  const edgeY=ceiling?r.y+r.h-9:r.y;
  ctx.fillStyle=ceiling?'#c15cff':'#8ed35a';ctx.fillRect(r.x+4,edgeY,r.w-8,9);

  ctx.strokeStyle=ceiling?'rgba(220,126,255,.72)':'rgba(145,218,93,.82)';
  ctx.lineWidth=2;
  for(let xx=r.x+18;xx<r.x+r.w;xx+=30){
    ctx.beginPath();ctx.moveTo(xx,edgeY+(ceiling?2:0));ctx.lineTo(xx+Math.sin(xx+t)*4,edgeY+(ceiling?13:-10-Math.sin(xx+t*2)*3));ctx.stroke();
  }
  ctx.restore();
}

function drawLamp(x,up=false){
  const y=up?world.ceiling+42:world.floor-10;
  ctx.save();ctx.translate(x,y);if(up)ctx.scale(1,-1);
  ctx.strokeStyle='#2e2737';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-102);ctx.stroke();
  ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-95);ctx.quadraticCurveTo(31,-112,44,-88);ctx.stroke();
  const lg=ctx.createRadialGradient(44,-80,2,44,-80,72);
  lg.addColorStop(0,'rgba(255,199,100,.48)');lg.addColorStop(1,'rgba(255,199,100,0)');
  ctx.fillStyle=lg;ctx.fillRect(-30,-155,150,150);
  ctx.fillStyle='#f8bd65';rr(33,-93,23,31,6);ctx.fill();
  ctx.fillStyle='rgba(255,247,190,.9)';rr(38,-88,13,19,4);ctx.fill();
  ctx.restore();
}

function drawRuin(x){
  const y=world.floor;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#24293b';ctx.fillRect(-30,-100,60,100);ctx.fillRect(-46,-104,92,17);
  ctx.fillStyle='#151927';for(let i=0;i<3;i++)ctx.fillRect(-19+i*18,-77,9,21);
  ctx.fillStyle='rgba(177,93,237,.18)';ctx.fillRect(-28,-98,56,6);
  ctx.restore();
}

function drawCrystal(q){
  if(q.taken)return;
  const y=world.floor+q.y+Math.sin(t*3+q.p)*8;
  ctx.save();ctx.translate(q.x,y);ctx.rotate(t*.75);
  ctx.shadowColor='#cb5cff';ctx.shadowBlur=30;
  const g=ctx.createLinearGradient(0,-22,0,22);
  g.addColorStop(0,'#ffe8ff');g.addColorStop(.45,'#ef8cff');g.addColorStop(1,'#7323cb');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(15,-2);ctx.lineTo(9,19);ctx.lineTo(-9,19);ctx.lineTo(-15,-2);ctx.closePath();ctx.fill();
  ctx.restore();
}

function drawRobot(e){
  if(!e.alive)return;
  const y=e.ceiling?world.ceiling+7:world.floor-48;
  const step=Math.sin(e.walk*4)*2;
  ctx.save();ctx.translate(e.x+27,y+23);if(e.ceiling)ctx.scale(1,-1);if(e.hit>0)ctx.globalAlpha=.45;
  const glowColor=e.type===2?'#ffb04d':'#c95cff';
  ctx.shadowColor=glowColor;ctx.shadowBlur=e.type===2?23:14;

  ctx.fillStyle=e.type===2?'#4a352d':'#2b2943';
  rr(-27,-23,54,44,10);ctx.fill();
  ctx.shadowBlur=0;

  ctx.fillStyle='#171622';rr(-20,-15,40,25,6);ctx.fill();
  ctx.fillStyle=e.type===2?'#ffb24b':'#ff4778';
  ctx.beginPath();ctx.arc(9,-2,e.type===2?8:6,0,Math.PI*2);ctx.fill();
  glow(9,-2,e.type===2?22:17,e.type===2?'rgba(255,176,75,ALPHA)':'rgba(255,71,120,ALPHA)',.35);

  ctx.fillStyle='#7c7690';ctx.fillRect(-20,20+step,9,9);ctx.fillRect(11,20-step,9,9);
  ctx.fillRect(-32,-7,7,17);ctx.fillRect(25,-7,7,17);

  ctx.strokeStyle='#8b82a3';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-18,-22);ctx.lineTo(-23,-34);ctx.moveTo(18,-22);ctx.lineTo(23,-34);ctx.stroke();
  ctx.fillStyle=glowColor;ctx.beginPath();ctx.arc(-23,-35,3,0,Math.PI*2);ctx.arc(23,-35,3,0,Math.PI*2);ctx.fill();

  // gun arm
  ctx.fillStyle='#34314b';rr(24,-3,18,9,4);ctx.fill();
  ctx.fillStyle=glowColor;ctx.fillRect(39,-1,7,5);

  ctx.restore();
}

function drawPortal(x,y,color='#9d5cff',small=false){
  ctx.save();ctx.translate(x,y);
  ctx.strokeStyle='#c3a9ff';ctx.lineWidth=small?6:10;ctx.shadowColor=color;ctx.shadowBlur=small?24:38;
  ctx.beginPath();ctx.ellipse(0,0,small?24:38,small?52:78,0,0,Math.PI*2);ctx.stroke();
  ctx.rotate(t*.75);
  for(let i=0;i<6;i++){
    ctx.strokeStyle=`rgba(193,128,255,${.58-i*.07})`;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,0,(small?16:28)-i*2,(small?40:64)-i*4,i*.28,0,Math.PI*1.6);ctx.stroke();
  }
  ctx.restore();
}

function drawPlayerShot(s){
  for(const tr of s.trail){
    ctx.globalAlpha=tr.a;glow(tr.x,tr.y,18,'rgba(255,241,230,ALPHA)',tr.a*.35);
    ctx.fillStyle='#c9b7a7';ctx.beginPath();ctx.arc(tr.x,tr.y,4,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
  ctx.shadowColor='#fff3e9';ctx.shadowBlur=18;
  ctx.fillStyle='#8f8277';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#eadfd4';ctx.lineWidth=2;
  for(let i=0;i<6;i++){ctx.beginPath();ctx.arc(0,0,3+i,0.3+i*.55,Math.PI*1.75+i*.35);ctx.stroke()}
  ctx.restore();
}

function drawEnemyShot(s){
  const c=s.type===2?'#ffb14c':'#ff3f7b';
  for(const tr of s.trail){
    ctx.globalAlpha=tr.a;glow(tr.x,tr.y,24,s.type===2?'rgba(255,177,76,ALPHA)':'rgba(255,63,123,ALPHA)',tr.a*.42);
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(tr.x,tr.y,4,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  glow(s.x,s.y,s.type===2?30:24,s.type===2?'rgba(255,177,76,ALPHA)':'rgba(255,63,123,ALPHA)',.55);
  ctx.fillStyle='#fff6e8';ctx.beginPath();ctx.arc(s.x,s.y,s.type===2?8:7,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=c;ctx.lineWidth=3;ctx.beginPath();ctx.arc(s.x,s.y,s.type===2?11:10,0,Math.PI*2);ctx.stroke();
}

function drawCat(){
  const running=Math.abs(player.vx)>25&&player.onGround;
  const gait=running?Math.sin(t*15)*4.8:0;
  const bob=running?Math.abs(Math.sin(t*15))*1.8:0;
  const tailWave=Math.sin(t*5)*3;

  ctx.save();
  ctx.translate(player.x+30,player.y+26-bob);
  if(player.gravity<0)ctx.scale(1,-1);
  if(player.inv>0&&Math.floor(player.inv*12)%2===0)ctx.globalAlpha=.28;
  ctx.scale(player.face,1);
  const sx=1+player.squash*.34,sy=1-player.squash*.22;ctx.scale(sx,sy);

  // tail
  ctx.strokeStyle='#07090e';ctx.lineWidth=9;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-23,11);ctx.quadraticCurveTo(-46,8+tailWave,-43,-13);ctx.quadraticCurveTo(-40,-30,-25,-20+tailWave*.4);ctx.stroke();
  ctx.strokeStyle='rgba(74,109,139,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-23,9);ctx.quadraticCurveTo(-43,5+tailWave,-39,-12);ctx.stroke();

  // body
  const body=ctx.createLinearGradient(0,-22,0,24);
  body.addColorStop(0,'#1b202a');body.addColorStop(.55,'#0b0d13');body.addColorStop(1,'#030407');
  ctx.fillStyle=body;ctx.shadowColor='#35dfff';ctx.shadowBlur=13;rr(-28,-20,56,42,19);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='rgba(83,123,153,.16)';rr(-20,-15,32,10,7);ctx.fill();

  // paws
  ctx.fillStyle='#07090d';
  ctx.beginPath();ctx.ellipse(-15+gait,21,10,7,0,0,Math.PI*2);ctx.ellipse(15-gait,21,10,7,0,0,Math.PI*2);ctx.fill();

  // ears
  ctx.fillStyle='#090b11';
  ctx.beginPath();ctx.moveTo(-21,-16);ctx.lineTo(-13,-36);ctx.lineTo(-3,-18);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(21,-16);ctx.lineTo(13,-36);ctx.lineTo(3,-18);ctx.closePath();ctx.fill();
  ctx.fillStyle='#552a59';
  ctx.beginPath();ctx.moveTo(-17,-19);ctx.lineTo(-13,-30);ctx.lineTo(-8,-19);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(17,-19);ctx.lineTo(13,-30);ctx.lineTo(8,-19);ctx.closePath();ctx.fill();

  // collar, clearly behind the face
  ctx.fillStyle='#e63450';rr(-18,11,36,7,4);ctx.fill();
  ctx.fillStyle='rgba(255,154,171,.7)';rr(-15,12,30,2,1);ctx.fill();

  // muzzle/eyes
  ctx.fillStyle='#f4f1e7';
  ctx.beginPath();ctx.ellipse(-10,-6,12,14,0,0,Math.PI*2);ctx.ellipse(10,-6,12,14,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#4ad77e';
  ctx.beginPath();ctx.arc(-10,-6,7,0,Math.PI*2);ctx.arc(10,-6,7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#05070a';
  ctx.beginPath();ctx.arc(-10,-6,3.7,0,Math.PI*2);ctx.arc(10,-6,3.7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-8,-9,1.5,0,Math.PI*2);ctx.arc(12,-9,1.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.ellipse(0,7,5,4,0,0,Math.PI*2);ctx.fill();

  // whiskers
  ctx.strokeStyle='rgba(230,240,245,.55)';ctx.lineWidth=1.3;
  for(const yy of [4,8]){ctx.beginPath();ctx.moveTo(-7,yy);ctx.lineTo(-25,yy-2);ctx.moveTo(7,yy);ctx.lineTo(25,yy-2);ctx.stroke()}

  // bell
  ctx.strokeStyle='#d6a23d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,17);ctx.lineTo(0,20);ctx.stroke();
  ctx.shadowColor='#ffd56d';ctx.shadowBlur=9;ctx.fillStyle='#f3c24f';ctx.beginPath();ctx.arc(0,23,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#75450f';ctx.beginPath();ctx.arc(0,24,1.3,0,Math.PI*2);ctx.fill();

  ctx.restore();
}

function drawWorld(){
  ctx.save();
  const shakeX=(Math.random()-.5)*camera.shake,shakeY=(Math.random()-.5)*camera.shake;
  ctx.translate(-camera.x+shakeX,shakeY);

  drawPortal(1830,world.ceiling+96,'#a84dff',true);
  drawPortal(3760,world.floor-66,'#37bbff',true);

  lamps.forEach((x,i)=>drawLamp(x,i%3===1));
  ruins.forEach(drawRuin);
  for(const p of platforms)drawStonePlatform(platformRect(p),!!p.ceiling);
  crystals.forEach(drawCrystal);
  enemies.forEach(drawRobot);
  shots.forEach(drawPlayerShot);
  enemyShots.forEach(drawEnemyShot);
  drawPortal(world.width-115,world.floor-82,'#9d5cff',false);
  drawCat();

  for(const p of particles){
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  ctx.restore();

  if(camera.flash>0){
    ctx.fillStyle=`rgba(201,121,255,${camera.flash*.55})`;ctx.fillRect(0,0,W,H);
  }
}

function loop(ts){
  const dt=Math.min(.033,(ts-last)/1000||0);last=ts;
  update(dt);drawBackground();drawWorld();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();