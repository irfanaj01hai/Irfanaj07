/* ============================================================
   IRON HORIZON — Tactical Archery & Assault
   Open-world 3D action game built on three.js
   ============================================================ */
'use strict';

/* ---------------- 1. UTILS ---------------- */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const TAU=Math.PI*2;

// deterministic value-noise
function hash2(x,y){const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);}
function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function fbm(x,y,oct){let s=0,amp=.5,f=1;for(let i=0;i<oct;i++){s+=amp*vnoise(x*f,y*f);amp*=.5;f*=2.03;}return s;}

/* ---------------- 2. WORLD / TERRAIN ---------------- */
const WORLD_HALF=780, WL=-2.0, VILLAGE={x:-120,z:140}, LAKE={x:190,z:-170,r:95};
const SPAWN={x:-30,z:250};

function desertMask(x,z){
  const t=(x+z)*0.5;
  const d=Math.hypot(x,z);
  return smoothstep(150,300,t)*(1-smoothstep(600,730,d))*(0.6+0.4*fbm(x*0.01+7,z*0.01+7,2));
}
function terrainH(x,z){
  const d=Math.hypot(x,z);
  let h=fbm(x*0.004+10,z*0.004+10,4)*20-2;
  const m=smoothstep(330,700,d);
  h+=m*(fbm(x*0.006+50,z*0.006+50,4)*58+18);
  const dl=Math.hypot(x-LAKE.x,z-LAKE.z);
  h-=15*Math.exp(-(dl*dl)/(LAKE.r*LAKE.r));
  const dv=Math.hypot(x-VILLAGE.x,z-VILLAGE.z);
  const flat=Math.exp(-(dv*dv)/(70*70));
  h=h*(1-flat)+2.2*flat;
  const de=desertMask(x,z);
  if(de>0.01){
    const dune=fbm(x*0.012+90,z*0.012+90,3)*7+2.5+Math.sin(x*0.06+z*0.02)*1.1;
    h=lerp(h,dune,clamp(de,0,1)*0.75);
  }
  return h;
}
function biomeColor(x,z,h,out){
  const de=clamp(desertMask(x,z),0,1);
  const moist=fbm(x*0.008+3,z*0.008+3,3);
  let r,g,b;
  if(h<WL+0.7){r=0.72;g=0.66;b=0.46;}
  else{
    const vn=fbm(x*0.03+5,z*0.03+5,2)*0.16;
    if(moist>0.52){r=0.16+vn*0.5;g=0.30+vn;b=0.12;}
    else{r=0.26+vn;g=0.40+vn*0.7;b=0.17;}
    if(h>17){const t=smoothstep(17,26,h);r=lerp(r,0.42,t);g=lerp(g,0.40,t);b=lerp(b,0.38,t);}
    if(h>33){const t=smoothstep(33,42,h);r=lerp(r,0.9,t);g=lerp(g,0.92,t);b=lerp(b,0.95,t);}
  }
  if(de>0.01){
    const s=0.86+0.12*Math.sin(x*0.06+z*0.02);
    r=lerp(r,0.78*s,de);g=lerp(g,0.62*s,de);b=lerp(b,0.36*s,de);
  }
  out[0]=r;out[1]=g;out[2]=b;
}

/* ---------------- 3. AUDIO (procedural) ---------------- */
const AudioSys={
  ctx:null,master:null,noiseBuf:null,started:false,
  init(){
    if(this.started)return;
    try{
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();
      this.master.gain.value=parseFloat(ui.setVol.value);
      this.master.connect(this.ctx.destination);
      const len=this.ctx.sampleRate;
      this.noiseBuf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
      const d=this.noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      this.startWind();
      this.started=true;
    }catch(e){}
  },
  startWind(){
    const src=this.ctx.createBufferSource();
    src.buffer=this.noiseBuf;src.loop=true;
    const f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=320;f.Q.value=0.6;
    this.windGain=this.ctx.createGain();this.windGain.gain.value=0.02;
    src.connect(f);f.connect(this.windGain);this.windGain.connect(this.master);
    src.start();
  },
  setWind(v){if(this.windGain)this.windGain.gain.value=0.008+v*0.006;},
  env(g,t0,a,peak,dec){g.gain.setValueAtTime(0.0001,t0);g.gain.linearRampToValueAtTime(peak,t0+a);g.gain.exponentialRampToValueAtTime(0.0001,t0+a+dec);},
  burst(dur,freq,q,peak,dec){
    if(!this.started)return;
    const t=this.ctx.currentTime;
    const s=this.ctx.createBufferSource();s.buffer=this.noiseBuf;s.loop=true;
    const f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=q;
    const g=this.ctx.createGain();this.env(g,t,0.005,peak,dec||dur);
    s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+dur+0.3);
  },
  tone(type,f0,f1,dur,peak){
    if(!this.started)return;
    const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator();o.type=type;
    o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    const g=this.ctx.createGain();this.env(g,t,0.008,peak,dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+0.2);
  },
  shot(plasma){ if(plasma){this.tone('sawtooth',900,120,0.22,0.35);this.burst(0.1,2400,1,0.2,0.1);} else {this.burst(0.16,1500,0.8,0.5,0.12);this.tone('square',190,70,0.09,0.28);} },
  enemyShot(dist){const v=clamp(1-dist/140,0,1);if(v>0.03)this.burst(0.12,900,1,0.22*v,0.1);},
  bowDraw(){this.tone('triangle',120,240,0.4,0.05);},
  bowFire(p){this.tone('triangle',340,140,0.14,0.22*p+0.08);this.burst(0.06,3000,2,0.08,0.05);},
  explosion(dist){const v=clamp(1-dist/160,0,1);this.burst(0.9,110,0.5,0.9*v,0.8);this.tone('sine',70,30,0.7,0.5*v);},
  hit(hs){this.tone('square',hs?1250:900,hs?700:600,0.06,0.16);},
  hurt(){this.burst(0.2,300,1,0.3,0.18);},
  pickup(){this.tone('sine',620,940,0.14,0.2);},
  unlock(){this.tone('sine',520,1040,0.4,0.25);},
  click(){this.tone('square',1200,800,0.03,0.07);},
};

/* ---------------- 4. RENDERER / SCENE ---------------- */
const canvas=document.getElementById('view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;

const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x9db8c8,0.0006);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.08,2600);
camera.rotation.order='YXZ';
scene.add(camera);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

/* lights */
const sun=new THREE.DirectionalLight(0xffe8c8,1.2);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-130;sun.shadow.camera.right=130;
sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;
sun.shadow.camera.near=10;sun.shadow.camera.far=900;
sun.shadow.bias=-0.0004;
scene.add(sun);scene.add(sun.target);
const hemi=new THREE.HemisphereLight(0xbfd8ff,0x54604a,0.7);
scene.add(hemi);
const moon=new THREE.DirectionalLight(0x7fa8ff,0);
scene.add(moon);

/* sky dome */
const skyUni={
  top:{value:new THREE.Color(0x2c6fbd)},bot:{value:new THREE.Color(0xcfe6f2)},
  sunDir:{value:new THREE.Vector3(0,1,0)},sunColor:{value:new THREE.Color(0xffdfa8)},glow:{value:1}
};
const skyMat=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyUni,
  vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`varying vec3 vDir;uniform vec3 top;uniform vec3 bot;uniform vec3 sunDir;uniform vec3 sunColor;uniform float glow;
    void main(){
      float h=clamp(vDir.y*1.25,0.0,1.0);
      vec3 col=mix(bot,top,pow(h,0.62));
      float s=max(dot(normalize(vDir),normalize(sunDir)),0.0);
      col+=sunColor*(pow(s,220.0)*1.1+pow(s,9.0)*0.22*glow);
      gl_FragColor=vec4(col,1.0);
    }`
});
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(1500,28,14),skyMat);
skyDome.renderOrder=-10;
scene.add(skyDome);

/* stars */
let starMat,stars;
(function(){
  const n=700,pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const th=rand(0,TAU),ph=rand(0.06,1.45);
    pos[i*3]=Math.cos(th)*Math.sin(ph)*1400;
    pos[i*3+1]=Math.cos(ph)*1400;
    pos[i*3+2]=Math.sin(th)*Math.sin(ph)*1400;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  starMat=new THREE.PointsMaterial({color:0xdfe8ff,size:2.2,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false});
  stars=new THREE.Points(g,starMat);
  scene.add(stars);
})();

/* soft sprite texture */
function softTex(inner,outer){
  const c=document.createElement('canvas');c.width=c.height=64;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(32,32,2,32,32,31);
  g.addColorStop(0,inner);g.addColorStop(1,outer);
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);return t;
}
const texSoft=softTex('rgba(255,255,255,1)','rgba(255,255,255,0)');
const texGlow=softTex('rgba(255,255,255,1)','rgba(255,200,120,0)');

/* sun & moon sprites */
const sunSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:0xfff2c8,transparent:true,opacity:0.95,fog:false,depthWrite:false,blending:THREE.AdditiveBlending}));
sunSpr.scale.set(260,260,1);scene.add(sunSpr);
const moonSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:texSoft,color:0xcfe0ff,transparent:true,opacity:0,fog:false,depthWrite:false}));
moonSpr.scale.set(70,70,1);scene.add(moonSpr);

/* clouds */
const clouds=[];
for(let i=0;i<14;i++){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texSoft,color:0xffffff,transparent:true,opacity:rand(0.10,0.24),depthWrite:false}));
  s.position.set(rand(-900,900),rand(140,230),rand(-900,900));
  const sc=rand(180,420);s.scale.set(sc,sc*0.42,1);
  scene.add(s);clouds.push(s);
}
/* ground mist */
const mists=[];
for(let i=0;i<12;i++){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texSoft,color:0xa8c0cc,transparent:true,opacity:0.07,depthWrite:false}));
  const a=rand(0,TAU),r=rand(60,500);
  s.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
  s.position.y=terrainH(s.position.x,s.position.z)+rand(2,5);
  const sc=rand(40,90);s.scale.set(sc,sc*0.32,1);
  scene.add(s);mists.push(s);
}

/* ---------------- 5. TERRAIN MESH + WATER + MAP ---------------- */
const tmpC=[0,0,0];
let terrainMesh;
(function buildTerrain(){
  const SEG=176,SIZE=WORLD_HALF*2;
  const geo=new THREE.PlaneGeometry(SIZE,SIZE,SEG,SEG);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    pos.setY(i,terrainH(pos.getX(i),pos.getZ(i)));
  }
  const colors=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    biomeColor(pos.getX(i),pos.getZ(i),pos.getY(i),tmpC);
    colors[i*3]=tmpC[0];colors[i*3+1]=tmpC[1];colors[i*3+2]=tmpC[2];
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.96,metalness:0.0});
  terrainMesh=new THREE.Mesh(geo,mat);
  terrainMesh.receiveShadow=true;
  scene.add(terrainMesh);
})();

const water=new THREE.Mesh(
  new THREE.PlaneGeometry(560,560),
  new THREE.MeshStandardMaterial({color:0x2a6a8a,roughness:0.14,metalness:0.55,transparent:true,opacity:0.88})
);
water.rotation.x=-Math.PI/2;
water.position.set(LAKE.x,WL,LAKE.z);
scene.add(water);

/* pre-render terrain map for minimap */
const mapCv=document.createElement('canvas');mapCv.width=mapCv.height=256;
(function renderMap(){
  const ctx=mapCv.getContext('2d');
  const img=ctx.createImageData(256,256);
  for(let j=0;j<256;j++){
    const z=-WORLD_HALF+ (j/255)*WORLD_HALF*2;
    for(let i=0;i<256;i++){
      const x=-WORLD_HALF+(i/255)*WORLD_HALF*2;
      const h=terrainH(x,z);
      let r,g,b;
      if(h<WL+0.15){r=40;g=95;b=125;}
      else{biomeColor(x,z,h,tmpC);r=tmpC[0]*255;g=tmpC[1]*255;b=tmpC[2]*255;}
      const k=(j*256+i)*4;
      img.data[k]=r;img.data[k+1]=g;img.data[k+2]=b;img.data[k+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
})();

/* ---------------- 6. VEGETATION / PROPS ---------------- */
const colliders=[]; // {x1,z1,x2,z2}
const matBark=new THREE.MeshStandardMaterial({color:0x5a4632,roughness:1});
const matLeaf=new THREE.MeshStandardMaterial({color:0x2e5b26,roughness:1});
const matLeaf2=new THREE.MeshStandardMaterial({color:0x3c6b2a,roughness:1});
const matRock=new THREE.MeshStandardMaterial({color:0x6f6d68,roughness:1});
const matDead=new THREE.MeshStandardMaterial({color:0x6b5a44,roughness:1});

(function plantForest(){
  const trunkGeo=new THREE.CylinderGeometry(0.22,0.42,3.4,6);
  const leafGeo=new THREE.ConeGeometry(2.6,6.4,7);
  const N=420;
  const trunkIM=new THREE.InstancedMesh(trunkGeo,matBark,N);
  const leafIM=new THREE.InstancedMesh(leafGeo,matLeaf,N);
  const leafIM2=new THREE.InstancedMesh(leafGeo,matLeaf2,N);
  trunkIM.castShadow=leafIM.castShadow=true;
  leafIM.receiveShadow=true;
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3();
  let placed=0,placed2=0,tries=0;
  while((placed<N||placed2<N)&&tries<9000){
    tries++;
    const x=rand(-WORLD_HALF+30,WORLD_HALF-30),z=rand(-WORLD_HALF+30,WORLD_HALF-30);
    const h=terrainH(x,z);
    if(h<WL+1||h>18)continue;
    if(desertMask(x,z)>0.25)continue;
    if(fbm(x*0.008+3,z*0.008+3,3)<0.48)continue;
    if(Math.hypot(x-VILLAGE.x,z-VILLAGE.z)<95)continue;
    if(Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.r+18)continue;
    if(Math.hypot(x-SPAWN.x,z-SPAWN.z)<14)continue;
    const s=rand(0.8,1.9);
    Q.setFromAxisAngle(new THREE.Vector3(0,1,0),rand(0,TAU));
    S.set(s,s*rand(0.9,1.35),s);
    P.set(x,h+1.6*s,z);M.compose(P,Q,S);trunkIM.setMatrixAt(placed,M);
    P.set(x,h+(3.0+3.0)*s,z);M.compose(P,Q,S);
    if(hash2(x,z)>0.5){leafIM.setMatrixAt(placed,M);placed++;}
    else{leafIM2.setMatrixAt(placed2,M);placed2++;}
    if(placed>=N&&placed2>=N)break;
  }
  trunkIM.count=Math.max(placed,placed2);
  leafIM.count=placed;leafIM2.count=placed2;
  scene.add(trunkIM,leafIM,leafIM2);
})();

(function scatterRocks(){
  const geo=new THREE.DodecahedronGeometry(1,0);
  const N=180;
  const im=new THREE.InstancedMesh(geo,matRock,N);
  im.castShadow=true;im.receiveShadow=true;
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
  let n=0,tries=0;
  while(n<N&&tries<4000){
    tries++;
    const x=rand(-WORLD_HALF+20,WORLD_HALF-20),z=rand(-WORLD_HALF+20,WORLD_HALF-20);
    const h=terrainH(x,z);
    if(h<WL)continue;
    if(Math.hypot(x-VILLAGE.x,z-VILLAGE.z)<60)continue;
    if(Math.random()<0.5&&Math.hypot(x,z)<300)continue;
    const s=rand(0.5,3.4);
    E.set(rand(0,TAU),rand(0,TAU),rand(0,TAU));Q.setFromEuler(E);
    S.set(s,s*rand(0.6,1.1),s);
    P.set(x,h+s*0.25,z);
    M.compose(P,Q,S);im.setMatrixAt(n++,M);
  }
  im.count=n;scene.add(im);
})();

(function desertProps(){
  // dead trees
  const geo=new THREE.CylinderGeometry(0.12,0.3,3.2,5);
  const N=70;
  const im=new THREE.InstancedMesh(geo,matDead,N);
  im.castShadow=true;
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3();
  let n=0,tries=0;
  while(n<N&&tries<3000){
    tries++;
    const x=rand(-WORLD_HALF+40,WORLD_HALF-40),z=rand(-WORLD_HALF+40,WORLD_HALF-40);
    if(desertMask(x,z)<0.35)continue;
    const h=terrainH(x,z);if(h<WL)continue;
    const s=rand(0.7,1.5);
    Q.setFromAxisAngle(new THREE.Vector3(0,1,0),rand(0,TAU));
    S.set(s,s,s);P.set(x,h+1.5*s,z);
    M.compose(P,Q,S);im.setMatrixAt(n++,M);
  }
  im.count=n;scene.add(im);
})();

/* ---------------- buildings / ruins ---------------- */
const matWall=new THREE.MeshStandardMaterial({color:0x8d8779,roughness:0.92});
const matWall2=new THREE.MeshStandardMaterial({color:0x77716a,roughness:0.92});
const matRoof=new THREE.MeshStandardMaterial({color:0x4e4a44,roughness:0.9});
const matWood=new THREE.MeshStandardMaterial({color:0x74552f,roughness:1});
const solidMeshes=[]; // raycast targets for bullets

function addBox(parent,w,h,d,x,y,z,mat,cast=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;
  parent.add(m);return m;
}
function makeBuilding(x,z,w,d,h,rot,damaged){
  const g=new THREE.Group();
  const y=terrainH(x,z);
  g.position.set(x,y,z);g.rotation.y=rot;
  const t=0.5;
  const back=addBox(g,w,h,t,0,h/2,-d/2,matWall);
  addBox(g,t,h,d,-w/2,h/2,0,matWall2);
  if(!damaged||Math.random()>0.4)addBox(g,t,h,d,w/2,h/2,0,matWall2);
  // front with doorway
  const fw=(w-2.2)/2;
  addBox(g,fw,h,t,-(2.2/2+fw/2),h/2,d/2,matWall);
  addBox(g,fw,h,t,(2.2/2+fw/2),h/2,d/2,matWall);
  addBox(g,2.2,h-2.4,t,0,h-(h-2.4)/2,d/2,matWall);
  if(!damaged){
    const roof=addBox(g,w+0.8,0.35,d+0.8,0,h+0.15,0,matRoof);
    roof.rotation.z=rand(-0.03,0.03);
  }else{
    addBox(g,w*0.55,0.35,d*0.6,w*0.2,h+0.1,z*0+rand(-1,1),matRoof).rotation.z=rand(-0.25,0.05);
  }
  // interior floor
  addBox(g,w-0.6,0.2,d-0.6,0,0.1,0,matWood,false);
  // rubble
  for(let i=0;i<4;i++){
    const r=addBox(g,rand(0.4,1.2),rand(0.3,0.9),rand(0.4,1.2),rand(-w/2,w/2),0.3,rand(d/2,d/2+3),matWall2);
    r.rotation.set(rand(0,0.6),rand(0,TAU),rand(0,0.6));
  }
  scene.add(g);
  // world-space AABB (approx for axis-aligned rots)
  const c=Math.abs(Math.cos(rot)),s=Math.abs(Math.sin(rot));
  const hx=(w*c+d*s)/2+0.4,hz=(w*s+d*c)/2+0.4;
  colliders.push({x1:x-hx,z1:z-hz,x2:x+hx,z2:z+hz});
  g.traverse(o=>{if(o.isMesh){o.userData.type='wall';solidMeshes.push(o);}});
  return g;
}

const villageBuildings=[];
[[0,0,10,8,4.2,0,false],[16,6,8,7,3.6,Math.PI/2,true],[-14,10,9,7,3.8,0.3,false],
 [4,-16,11,8,4.6,0.15,true],[-18,-12,7,7,3.4,Math.PI,false],[22,-10,8,6,3.6,1.2,false],[10,20,7,6,3.2,-0.4,true]
].forEach(b=>villageBuildings.push(makeBuilding(VILLAGE.x+b[0],VILLAGE.z+b[1],b[2],b[3],b[4],b[5],b[6])));

// ruined farmhouse + camp elsewhere
makeBuilding(210,180,9,7,3.8,0.7,true);
makeBuilding(-320,-240,10,8,4.2,-0.3,false);
(function camp(){
  const cx=90,cz=-40,y=terrainH(cx,cz);
  const g=new THREE.Group();g.position.set(cx,y,cz);scene.add(g);
  // tents
  for(let i=0;i<3;i++){
    const t=new THREE.Mesh(new THREE.ConeGeometry(2.6,2.6,4),new THREE.MeshStandardMaterial({color:0x4a5540,roughness:1}));
    t.position.set(i*6-6,1.3,0);t.rotation.y=Math.PI/4;t.castShadow=true;g.add(t);
  }
  // crates
  for(let i=0;i<6;i++){
    const c=addBox(g,1.1,1.1,1.1,rand(-9,9),0.55,rand(3,7),matWood);
    c.rotation.y=rand(0,TAU);
    c.userData.type='wall';solidMeshes.push(c);
  }
  colliders.push({x1:cx-11,z1:cz-3,x2:cx+11,z2:cz+8});
})();

/* watchtower */
let towerBeacon,towerBulb;
(function tower(){
  const x=-250,z=40,y=terrainH(x,z);
  const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);
  for(let i=0;i<4;i++){
    const leg=addBox(g,0.35,11,0.35,(i%2?2:-2),5.5,(i<2?2:-2),matWood);
    leg.rotation.z=(i%2?-0.06:0.06);
  }
  addBox(g,6,0.3,6,0,11,0,matWood);
  addBox(g,6.6,1,0.25,0,11.8,3,matWood);
  addBox(g,6.6,1,0.25,0,11.8,-3,matWood);
  const beacon=new THREE.PointLight(0xff4444,0,60);
  beacon.position.set(0,13,0);g.add(beacon);
  towerBeacon=beacon;
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,8),new THREE.MeshBasicMaterial({color:0xff5555}));
  bulb.position.set(0,12.6,0);g.add(bulb);towerBulb=bulb;
  colliders.push({x1:x-3,z1:z-3,x2:x+3,z2:z+3});
})();

/* ---------------- barrels & pickups ---------------- */
const barrels=[];
function makeBarrel(x,z){
  const y=terrainH(x,z);
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,1.3,12),new THREE.MeshStandardMaterial({color:0xb03028,roughness:0.6,metalness:0.3}));
  body.position.y=0.65;body.castShadow=true;
  const band1=new THREE.Mesh(new THREE.CylinderGeometry(0.57,0.57,0.12,12),new THREE.MeshStandardMaterial({color:0x333333,roughness:0.5}));
  band1.position.y=0.95;
  const band2=band1.clone();band2.position.y=0.35;
  g.add(body,band1,band2);
  g.position.set(x,y,z);
  body.userData={type:'barrel',ref:g};
  g.userData={hp:25,body,alive:true};
  scene.add(g);
  barrels.push(g);solidMeshes.push(body);
  return g;
}
[[ -108,132],[-132,148],[-114,152],[-128,128],[88,-36],[96,-44],[-316,-236],[214,184]].forEach(p=>makeBarrel(p[0],p[1]));

const pickups=[];
const pickupGeo=new THREE.BoxGeometry(0.5,0.5,0.5);
function makePickup(x,z,type){
  const y=terrainH(x,z);
  const col=type==='ammo'?0x7fe3ff:type==='med'?0x9dff7f:0x4d9fff;
  const m=new THREE.Mesh(pickupGeo,new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.6,roughness:0.4}));
  m.position.set(x,y+0.8,z);m.castShadow=true;
  const glow=new THREE.PointLight(col,0.6,6);m.add(glow);
  m.userData={type,taken:false};
  scene.add(m);pickups.push(m);
  return m;
}
makePickup(-105,138,'ammo');makePickup(-135,142,'med');makePickup(92,-38,'ammo');
makePickup(-318,-244,'armor');makePickup(212,176,'med');makePickup(-60,200,'ammo');

/* ---------------- 7. PARTICLES / EFFECTS ---------------- */
const spritePool=[];
for(let i=0;i<130;i++){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texSoft,transparent:true,opacity:0,depthWrite:false}));
  s.visible=false;scene.add(s);
  spritePool.push({s,vel:new THREE.Vector3(),life:0,maxLife:1,grow:0,drag:1,active:false});
}
function fx(pos,{color=0xffffff,count=6,speed=6,life=0.7,size=0.5,grow=0,gravity=9,up=0.2,drag=0.92,add=false}={}){
  let spawned=0;
  for(const p of spritePool){
    if(spawned>=count)break;
    if(p.active)continue;
    p.active=true;p.s.visible=true;
    p.s.position.copy(pos);
    p.vel.set(rand(-1,1),rand(-up,1),rand(-1,1)).normalize().multiplyScalar(rand(speed*0.3,speed));
    p.life=p.maxLife=rand(life*0.5,life);
    p.grow=grow;p.drag=drag;
    p.s.material.color.setHex(color);
    p.s.material.blending=add?THREE.AdditiveBlending:THREE.NormalBlending;
    p.s.material.opacity=1;
    const sc=rand(size*0.6,size);p.s.scale.set(sc,sc,1);p.baseScale=sc;
    p.gravity=gravity;
    spawned++;
  }
}
function updateFx(dt){
  for(const p of spritePool){
    if(!p.active)continue;
    p.life-=dt;
    if(p.life<=0){p.active=false;p.s.visible=false;continue;}
    p.vel.y-=p.gravity*dt;
    p.vel.multiplyScalar(Math.pow(p.drag,dt*60));
    p.s.position.addScaledVector(p.vel,dt);
    p.s.material.opacity=Math.pow(p.life/p.maxLife,0.8);
    if(p.grow){const sc=p.baseScale+(1-p.life/p.maxLife)*p.grow;p.s.scale.set(sc,sc,1);}
  }
}

/* light pool */
const lightPool=[];
for(let i=0;i<5;i++){const l=new THREE.PointLight(0xffffff,0,30);scene.add(l);lightPool.push({l,t:0});}
function flashLight(pos,color,intensity,dist,dur){
  let best=null;
  for(const o of lightPool){if(o.t<=0){best=o;break;}}
  if(!best)best=lightPool[0];
  best.l.position.copy(pos);best.l.color.setHex(color);best.l.intensity=intensity;best.l.distance=dist;best.t=dur;
}
function updateLights(dt){for(const o of lightPool){if(o.t>0){o.t-=dt;if(o.t<=0)o.l.intensity=0;else o.l.intensity*=Math.pow(0.02,dt);}}}

/* tracers */
const tracers=[];
const tracerGeo=new THREE.BoxGeometry(1,1,1);
function tracer(a,b,color=0xffd9a0,size=0.035){
  const m=new THREE.Mesh(tracerGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false}));
  const dir=b.clone().sub(a);const len=dir.length();
  m.position.copy(a).addScaledVector(dir,0.5);
  m.scale.set(size,size,len);
  m.lookAt(b);
  scene.add(m);tracers.push({m,t:0.07});
  if(tracers.length>30){const old=tracers.shift();scene.remove(old.m);}
}
function updateTracers(dt){
  for(let i=tracers.length-1;i>=0;i--){
    tracers[i].t-=dt;
    tracers[i].m.material.opacity=Math.max(0,tracers[i].t/0.07)*0.9;
    if(tracers[i].t<=0){scene.remove(tracers[i].m);tracers.splice(i,1);}
  }
}

/* arrows stuck in world */
const stuckArrows=[];
const arrowGeo=new THREE.CylinderGeometry(0.018,0.018,0.82,5);
arrowGeo.translate(0,0.41,0);
arrowGeo.rotateX(Math.PI/2); // points along +Z... we will orient via lookAt
const arrowMat=new THREE.MeshStandardMaterial({color:0xcfc3a0,roughness:0.7});
const arrowHeadGeo=new THREE.ConeGeometry(0.045,0.14,6);
arrowHeadGeo.translate(0,0.07,0);arrowHeadGeo.rotateX(Math.PI/2);
const arrowHeadMat=new THREE.MeshStandardMaterial({color:0x8a8f98,metalness:0.7,roughness:0.4});
function makeArrowMesh(){
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(arrowGeo,arrowMat);
  const head=new THREE.Mesh(arrowHeadGeo,arrowHeadMat);head.position.z=0.82;
  const fl=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.09,0.14),arrowMat);fl.position.z=-0.05;
  g.add(shaft,head,fl);
  return g;
}

/* shells */
const shells=[];
const shellGeo=new THREE.BoxGeometry(0.025,0.07,0.025);
const shellMat=new THREE.MeshStandardMaterial({color:0xd8b45a,metalness:0.8,roughness:0.35});
function ejectShell(pos,right,up){
  if(shells.length>26){const old=shells.shift();scene.remove(old.m);}
  const m=new THREE.Mesh(shellGeo,shellMat);
  m.position.copy(pos);
  const vel=right.clone().multiplyScalar(rand(1.5,2.6)).add(up.clone().multiplyScalar(rand(1,2)));
  vel.x+=rand(-0.5,0.5);vel.z+=rand(-0.5,0.5);
  scene.add(m);
  shells.push({m,vel,t:2.2,bounced:false});
}
function updateShells(dt){
  for(let i=shells.length-1;i>=0;i--){
    const s=shells[i];
    s.vel.y-=20*dt;
    s.m.position.addScaledVector(s.vel,dt);
    s.m.rotation.x+=dt*14;s.m.rotation.z+=dt*9;
    const gh=terrainH(s.m.position.x,s.m.position.z);
    if(s.m.position.y<gh+0.03){
      s.m.position.y=gh+0.03;
      if(!s.bounced){s.vel.y=Math.abs(s.vel.y)*0.35;s.vel.x*=0.5;s.vel.z*=0.5;s.bounced=true;}
      else{s.vel.set(0,0,0);}
    }
    s.t-=dt;
    if(s.t<=0){scene.remove(s.m);shells.splice(i,1);}
  }
}

/* scorch marks */
const scorches=[];
const scorchGeo=new THREE.CircleGeometry(1,20);
function scorch(pos,r){
  if(scorches.length>10){const o=scorches.shift();scene.remove(o);}
  const m=new THREE.Mesh(scorchGeo,new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.75,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  m.rotation.x=-Math.PI/2;
  const g=terrainH(pos.x,pos.z);
  m.position.set(pos.x,g+0.06,pos.z);
  m.scale.setScalar(r);
  scene.add(m);scorches.push(m);
}

/* ---------------- 8. WEAPON DATA & STATE ---------------- */
const BOWS=[
  {id:'scout',name:'SCOUT RECURVE',dmg:55,drawTime:1.15,speed:64,windMul:1.0,score:0,desc:'Reliable field recurve'},
  {id:'ranger',name:'RANGER COMPOUND',dmg:78,drawTime:0.8,speed:80,windMul:0.6,score:600,desc:'Faster draw · flatter arc'},
  {id:'phantom',name:'PHANTOM MK-X',dmg:100,drawTime:0.62,speed:98,windMul:0.3,score:1500,desc:'Wind-cutting competition platform'},
];
const ARROWS=[
  {id:'std',name:'STANDARD ARROWS',mul:1.0,score:0,desc:'Balanced field arrows'},
  {id:'broad',name:'BROADHEAD',mul:1.35,score:350,desc:'+35% damage'},
  {id:'tung',name:'TUNGSTEN BODKIN',mul:1.75,score:1200,desc:'+75% armor-piercing damage'},
];
const RIFLES=[
  {id:'ar7',name:'AR-7 VANDAL',dmg:22,rps:9,spread:0.013,recoil:1.0,mag:30,reserve:0,auto:true,score:0,plasma:false,desc:'Standard assault rifle'},
  {id:'vk9',name:'VK-9 STORM',dmg:27,rps:12.5,spread:0.010,recoil:0.8,mag:36,reserve:0,auto:true,score:800,plasma:false,desc:'High-rate SMG-platform'},
  {id:'helios',name:'HELIOS LANCE',dmg:78,rps:2.6,spread:0.0022,recoil:2.1,mag:6,reserve:0,auto:false,score:2000,plasma:true,desc:'Plasma marksman cannon'},
];
const unlocked=new Set(['scout','std','ar7']);
const equipped={bow:BOWS[0],arrow:ARROWS[0],rifle:RIFLES[0]};

/* ---------------- 9. PLAYER ---------------- */
const player={
  pos:new THREE.Vector3(SPAWN.x,0,SPAWN.z),
  vel:new THREE.Vector3(),
  yaw:Math.PI*0.1,pitch:-0.05,
  hp:100,armor:0,stamina:100,
  onGround:false,sprint:false,
  weapon:'rifle', // or 'bow'
  mag:RIFLES[0].mag,reserve:120,arrows:24,
  reloading:0,drawing:0,drawHeld:false,
  fireCd:0,recoil:0,fovKick:0,
  ads:false,dead:false,
  shotsFired:0,shotsHit:0,
};
player.pos.y=terrainH(SPAWN.x,SPAWN.z)+1.7;

/* third-person character */
const charGroup=new THREE.Group();
(function buildChar(){
  const matSuit=new THREE.MeshStandardMaterial({color:0x38414d,roughness:0.8});
  const matDark=new THREE.MeshStandardMaterial({color:0x22282f,roughness:0.9});
  const matSkin=new THREE.MeshStandardMaterial({color:0xc9a184,roughness:0.9});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.72,0.34),matSuit);torso.position.y=1.18;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.26,12,10),matSkin);head.position.y=1.75;
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.29,12,8,0,TAU,0,Math.PI*0.55),matDark);helm.position.y=1.79;
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.56,0.16),matSuit);armL.position.set(-0.4,1.28,-0.12);armL.rotation.x=-1.1;
  const armR=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.56,0.16),matSuit);armR.position.set(0.4,1.28,-0.12);armR.rotation.x=-1.1;
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.8,0.22),matDark);legL.position.set(-0.16,0.42,0);
  const legR=legL.clone();legR.position.x=0.16;
  const gun=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.18,0.9),matDark);gun.position.set(0.22,1.32,-0.42);
  [torso,head,helm,armL,armR,legL,legR,gun].forEach(m=>{m.castShadow=true;charGroup.add(m);});
  charGroup.userData={legL,legR,armL,armR};
  charGroup.visible=false;
  scene.add(charGroup);
})();

/* ---------------- viewmodels ---------------- */
const vmRoot=new THREE.Group();camera.add(vmRoot);
function buildRifleVM(){
  const g=new THREE.Group();
  const dark=new THREE.MeshStandardMaterial({color:0x1d232b,roughness:0.55,metalness:0.5});
  const dark2=new THREE.MeshStandardMaterial({color:0x2c3642,roughness:0.5,metalness:0.55});
  const glowM=new THREE.MeshStandardMaterial({color:0x0a0f14,emissive:0x37c8ff,emissiveIntensity:1.4,roughness:0.4});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.14,0.62),dark);body.position.z=-0.1;
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.42,10),dark2);barrel.rotation.x=Math.PI/2;barrel.position.set(0,0.02,-0.55);
  const mag=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.24,0.12),dark2);mag.position.set(0,-0.16,-0.06);mag.rotation.x=0.18;
  const stock=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.11,0.3),dark);stock.position.set(0,-0.01,0.32);
  const sight=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.06,0.12),dark2);sight.position.set(0,0.11,-0.12);
  const strip=new THREE.Mesh(new THREE.BoxGeometry(0.095,0.02,0.3),glowM);strip.position.set(0,0.045,-0.12);
  g.add(body,barrel,mag,stock,sight,strip);
  // muzzle flash
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:0xffcf7f,transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
  flash.position.set(0,0.02,-0.8);flash.scale.set(0.35,0.35,1);
  g.add(flash);
  g.userData.flash=flash;
  g.userData.muzzle=new THREE.Vector3(0,0.02,-0.8);
  g.userData.port=new THREE.Vector3(0.06,0.05,0.05);
  g.userData.baseStrip=strip;
  return g;
}
function buildBowVM(){
  const g=new THREE.Group();
  const limbM=new THREE.MeshStandardMaterial({color:0x3a2d20,roughness:0.6});
  const gripM=new THREE.MeshStandardMaterial({color:0x191d22,roughness:0.7});
  const arcAng=Math.PI*1.15,R=0.42;
  const arc=new THREE.Mesh(new THREE.TorusGeometry(R,0.02,8,24,arcAng),limbM);
  arc.rotation.z=-arcAng/2; // centered on +X
  const arcG=new THREE.Group();arcG.add(arc);
  arcG.rotation.y=Math.PI/2; // belly forward (-Z), tips up/down
  const grip=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.16,0.07),gripM);grip.position.set(0,-0.02,-R+0.04);
  const stab=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.22,6),gripM);stab.rotation.x=Math.PI/2;stab.position.set(0,-0.02,-R-0.1);
  g.add(arcG,grip,stab);
  // string
  const strGeo=new THREE.BufferGeometry();
  strGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9),3));
  const string=new THREE.Line(strGeo,new THREE.LineBasicMaterial({color:0xdddddd,transparent:true,opacity:0.9}));
  g.add(string);
  // nocked arrow (head points -Z, forward)
  const arrow=makeArrowMesh();arrow.scale.setScalar(0.8);arrow.rotation.y=Math.PI;
  g.add(arrow);
  const s=Math.sin(arcAng/2)*R,cz=-Math.cos(arcAng/2)*R;
  g.userData={string,arrow,tipA:new THREE.Vector3(0,-s,cz),tipB:new THREE.Vector3(0,s,cz),restZ:cz};
  return g;
}
const vmRifle=buildRifleVM();
const vmBow=buildBowVM();
vmRoot.add(vmRifle,vmBow);
vmBow.visible=false;
const VM_POS={x:0.24,y:-0.24,z:-0.5};
const VM_ADS={x:0,y:-0.155,z:-0.34};

/* muzzle flash world light */
const muzzleLight=new THREE.PointLight(0xffc27a,0,14);scene.add(muzzleLight);

/* ---------------- 10. ENEMIES ---------------- */
const enemies=[];
const matEnemy=new THREE.MeshStandardMaterial({color:0x5c3a35,roughness:0.85});
const matEnemyDark=new THREE.MeshStandardMaterial({color:0x2e2725,roughness:0.9});
const matEnemyHead=new THREE.MeshStandardMaterial({color:0xb98d6e,roughness:0.9});

function makeSoldier(x,z){
  const g=new THREE.Group();
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.74,0.34),matEnemy.clone());torso.position.y=1.17;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.27,10,9),matEnemyHead.clone());head.position.y=1.74;
  const helm=new THREE.Mesh(new THREE.SphereGeometry(0.30,10,7,0,TAU,0,Math.PI*0.5),matEnemyDark);helm.position.y=1.78;
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.8,0.22),matEnemyDark);legL.position.set(-0.16,0.4,0);
  const legR=legL.clone();legR.position.x=0.16;
  const gun=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.14,0.8),matEnemyDark);gun.position.set(0.24,1.3,-0.35);
  [torso,head,helm,legL,legR,gun].forEach(m=>{m.castShadow=true;g.add(m);});
  const y=terrainH(x,z);
  g.position.set(x,y,z);
  const wp1=new THREE.Vector3(x+rand(-25,25),0,z+rand(-25,25));
  const wp2=new THREE.Vector3(x+rand(-25,25),0,z+rand(-25,25));
  const e={
    group:g,torso,head,legL,legR,hp:100,alive:true,
    state:'patrol',wp:[wp1,wp2],wpi:0,
    fireT:rand(0.5,2),burst:0,burstT:0,walkPh:rand(0,TAU),speed:0,
    hitFlash:0,deathT:0,
  };
  torso.userData={type:'enemy',ref:e,part:'body'};
  head.userData={type:'enemy',ref:e,part:'head'};
  helm.userData={type:'enemy',ref:e,part:'head'};
  solidMeshes.push(torso,head,helm);
  scene.add(g);
  enemies.push(e);
  return e;
}

function damageEnemy(e,dmg,part,hitPos){
  if(!e.alive)return;
  if(part==='head')dmg*=2.5;
  e.hp-=dmg;
  e.hitFlash=0.09;
  e.torso.material.emissive.setHex(0xffffff);
  e.head.material.emissive.setHex(0xffffff);
  if(part==='head')fx(hitPos,{color:0xff4444,count:8,speed:4,life:0.5,size:0.22});
  else fx(hitPos,{color:0xcc3333,count:5,speed:3.5,life:0.4,size:0.18});
  if(e.state==='patrol'){e.state='chase';}
  if(e.hp<=0){
    e.alive=false;e.deathT=0;
    solidMeshes.splice(solidMeshes.indexOf(e.torso),1);
    solidMeshes.splice(solidMeshes.indexOf(e.head),1);
    solidMeshes.splice(solidMeshes.indexOf(e.helm),1);
    const hs=part==='head';
    const pts=hs?150:100;
    addScore(pts);kills++;
    player.shotsHit++;
    killFeed(`Hostile eliminated ${hs?'<b>· HEADSHOT</b>':''} <b>+${pts}</b>`);
    hitmark(hs);
    missionEvent('kill');
    // drop
    if(Math.random()<0.45){
      const t=Math.random()<0.6?'ammo':'med';
      makePickup(e.group.position.x+rand(-1,1),e.group.position.z+rand(-1,1),t);
    }
  } else {
    player.shotsHit++;
    hitmark(part==='head');
    AudioSys.hit(part==='head');
  }
}

function updateEnemies(dt,t){
  const pp=player.pos;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    if(!e.alive){
      e.deathT+=dt;
      e.group.rotation.x=-Math.min(e.deathT*3.5,Math.PI/2)*0.98;
      if(e.deathT>1.2)e.group.position.y-=dt*0.6;
      if(e.deathT>3){scene.remove(e.group);enemies.splice(i,1);}
      continue;
    }
    if(e.hitFlash>0){
      e.hitFlash-=dt;
      if(e.hitFlash<=0){e.torso.material.emissive.setHex(0);e.head.material.emissive.setHex(0);}
    }
    const dist=e.group.position.distanceTo(pp);
    // state transitions
    if(e.state==='patrol'&&dist<55)e.state='chase';
    if(e.state==='chase'&&dist<36)e.state='attack';
    if(e.state==='attack'&&dist>48)e.state='chase';

    let move=new THREE.Vector3(),speed=0;
    if(e.state==='patrol'){
      const wp=e.wp[e.wpi];
      move.set(wp.x-e.group.position.x,0,wp.z-e.group.position.z);
      if(move.length()<3)e.wpi=(e.wpi+1)%2;
      speed=2.2;
    }else if(e.state==='chase'){
      move.set(pp.x-e.group.position.x,0,pp.z-e.group.position.z);
      speed=4.4;
    }else{
      // strafe
      const dir=pp.clone().sub(e.group.position).setY(0).normalize();
      move.set(-dir.z,0,dir.x).multiplyScalar(Math.sin(t*0.9+i)*0.7);
      if(dist>30)move.add(dir.multiplyScalar(0.6));
      speed=2.4;
      // fire
      e.fireT-=dt;
      if(e.fireT<=0&&dist<60){
        e.burst=3;e.fireT=rand(1.1,1.9)*weatherAccuracy();
        e.burstT=0;
      }
      if(e.burst>0){
        e.burstT-=dt;
        if(e.burstT<=0){
          e.burst--;e.burstT=0.13;
          enemyFire(e,dist);
        }
      }
    }
    if(move.lengthSq()>0.01){
      move.normalize();
      const nx=e.group.position.x+move.x*speed*dt;
      const nz=e.group.position.z+move.z*speed*dt;
      // keep out of lake & bounds
      if(Math.hypot(nx-LAKE.x,nz-LAKE.z)>LAKE.r+2&&Math.hypot(nx,nz)<WORLD_HALF-20){
        e.group.position.x=nx;e.group.position.z=nz;
      }
      e.group.position.y=terrainH(e.group.position.x,e.group.position.z);
      e.group.rotation.y=Math.atan2(move.x,move.z);
      e.walkPh+=dt*speed*2.4;
      const sw=Math.sin(e.walkPh)*0.5;
      e.legL.rotation.x=sw;e.legR.rotation.x=-sw;
      e.speed=speed;
    }else{
      e.legL.rotation.x=lerp(e.legL.rotation.x,0,dt*8);
      e.legR.rotation.x=lerp(e.legR.rotation.x,0,dt*8);
      if(e.state==='attack'){
        const dir=pp.clone().sub(e.group.position);
        e.group.rotation.y=Math.atan2(dir.x,dir.z);
      }
    }
  }
}

function enemyFire(e,dist){
  const muzzle=e.group.position.clone().add(new THREE.Vector3(0,1.4,0));
  const target=player.pos.clone();
  let hitChance=clamp(0.62-dist/110,0.06,0.6)*weatherAccuracy();
  if(player.sprint)hitChance*=0.7;
  const hit=Math.random()<hitChance&&!player.dead;
  if(!hit){
    target.x+=rand(-2.2,2.2);target.y+=rand(-1.2,1.2);target.z+=rand(-2.2,2.2);
  }
  tracer(muzzle,target,0xff9d6b,0.03);
  fx(muzzle,{color:0xffc27a,count:1,speed:0.5,life:0.08,size:0.35,add:true,gravity:0});
  AudioSys.enemyShot(dist);
  if(hit)damagePlayer(rand(6,11),e.group.position);
}

function damagePlayer(dmg,srcPos){
  if(player.dead)return;
  if(player.armor>0){
    const ab=Math.min(player.armor,dmg*0.65);
    player.armor-=ab;dmg-=ab;
  }
  player.hp-=dmg;
  AudioSys.hurt();
  ui.dmgFlash.style.opacity=0.85;
  shake=Math.min(shake+0.35,1.2);
  setTimeout(()=>ui.dmgFlash.style.opacity=0,130);
  if(player.hp<=0){player.hp=0;killPlayer();}
}
function killPlayer(){
  player.dead=true;
  document.exitPointerLock&&document.exitPointerLock();
  ui.deathStats.innerHTML=`SCORE <b style="color:#ffb454">${score}</b> &nbsp;·&nbsp; KILLS <b style="color:#ffb454">${kills}</b> &nbsp;·&nbsp; MISSION ${missionIdx+1}/4`;
  ui.deathScreen.classList.remove('hidden');
  hud.style.display='none';
}

/* drones */
const drones=[];
function makeDrone(cx,cz,r,h){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.55,12,10),new THREE.MeshStandardMaterial({color:0x9aa4ad,metalness:0.7,roughness:0.35}));
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.95,0.07,8,22),new THREE.MeshStandardMaterial({color:0x30363d,metalness:0.6,roughness:0.4}));
  ring.rotation.x=Math.PI/2;
  const eye=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8),new THREE.MeshBasicMaterial({color:0xff4444}));
  eye.position.z=0.5;
  const glow=new THREE.PointLight(0xff5544,0.7,10);
  g.add(body,ring,eye,glow);
  body.userData={type:'drone',ref:null};
  body.castShadow=true;
  g.position.set(cx,h,cz);
  scene.add(g);
  const d={group:g,body,cx,cz,r,h,t:rand(0,TAU),spd:rand(0.25,0.5),hp:40,alive:true};
  body.userData.ref=d;
  solidMeshes.push(body);
  drones.push(d);
  return d;
}
function updateDrones(dt){
  for(let i=drones.length-1;i>=0;i--){
    const d=drones[i];
    if(!d.alive){scene.remove(d.group);drones.splice(i,1);continue;}
    d.t+=dt*d.spd;
    d.group.position.x=d.cx+Math.cos(d.t)*d.r;
    d.group.position.z=d.cz+Math.sin(d.t)*d.r;
    d.group.position.y=d.h+Math.sin(d.t*2.7)*1.6;
    d.group.rotation.y=-d.t;
  }
}
function damageDrone(d,dmg,hitPos){
  d.hp-=dmg;
  fx(hitPos,{color:0x9fe8ff,count:6,speed:5,life:0.4,size:0.2,add:true});
  if(d.hp<=0){
    d.alive=false;
    solidMeshes.splice(solidMeshes.indexOf(d.body),1);
    explode(d.group.position.clone(),3,false);
    addScore(60);kills++;player.shotsHit++;
    killFeed('Recon drone destroyed <b>+60</b>');
    missionEvent('drone');
  } else {player.shotsHit++;hitmark(false);AudioSys.hit(false);}
}
function droneCreditHit(){player.shotsHit++;}

/* barrels damage / explosion */
function damageBarrel(b,dmg,hitPos){
  if(!b.userData.alive)return;
  b.userData.hp-=dmg;
  fx(hitPos,{color:0xffb36b,count:4,speed:4,life:0.3,size:0.2});
  if(b.userData.hp<=0){
    b.userData.alive=false;
    const p=b.position.clone();p.y+=1;
    explode(p,8,true);
    missionEvent('barrel');
  }
}
function explode(pos,radius,damageFriends){
  fx(pos,{color:0xffa640,count:22,speed:16,life:0.8,size:0.9,grow:1.2,gravity:4,add:true});
  fx(pos,{color:0x555049,count:14,speed:7,life:1.6,size:1.6,grow:3.4,gravity:-1.5,drag:0.9});
  fx(pos,{color:0xffe8b0,count:10,speed:24,life:0.3,size:0.35,add:true,gravity:0});
  flashLight(pos,0xffa640,14,40,0.5);
  scorch(pos,radius*0.5);
  shake=Math.min(shake+clamp(1.4-pos.distanceTo(player.pos)/30,0,1.2),1.6);
  AudioSys.explosion(pos.distanceTo(player.pos));
  addScore(40);
  // damage
  for(const e of enemies){
    if(!e.alive)continue;
    const d=e.group.position.distanceTo(pos);
    if(d<radius){
      e.hp-=120*(1-d/radius*0.5);
      e.hitFlash=0.09;e.torso.material.emissive.setHex(0xffffff);
      if(e.hp<=0&&e.alive){e.alive=false;e.deathT=0;addScore(100);kills++;killFeed('Hostile eliminated <b>· BLAST</b> <b>+100</b>');missionEvent('kill');}
    }
  }
  for(const d of drones){
    if(d.alive&&d.group.position.distanceTo(pos)<radius){d.hp-=90;if(d.hp<=0){d.alive=false;addScore(60);killFeed('Recon drone destroyed <b>+60</b>');missionEvent('drone');}}
  }
  const pd=player.pos.distanceTo(pos);
  if(pd<radius)damagePlayer(90*(1-pd/radius),pos);
  // chain barrels
  for(const b of barrels){
    if(b.userData.alive&&b.position.distanceTo(pos)<radius+1.5){
      setTimeout(()=>{if(b.userData.alive){b.userData.alive=false;const p=b.position.clone();p.y+=1;explode(p,7,true);missionEvent('barrel');}},rand(80,240));
    }
  }
  // remove barrel mesh
  for(let i=barrels.length-1;i>=0;i--){
    const b=barrels[i];
    if(!b.userData.alive&&b.parent){
      scene.remove(b);
      solidMeshes.splice(solidMeshes.indexOf(b.userData.body),1);
      barrels.splice(i,1);
    }
  }
}

/* ---------------- 11. INPUT ---------------- */
const keys={};
let mouseDown=false,rmbDown=false,attackEdge=false,fallbackLook=false,lookDrag=false,dragMoved=0;
let paused=false,gameStarted=false,loadoutOpen=false;
let shake=0;
const touchVec={x:0,y:0};
let touchSprint=false,jumpQueued=false,isTouch=false;

addEventListener('keydown',e=>{
  if(e.code==='Tab')e.preventDefault();
  keys[e.code]=true;
  if(!gameStarted)return;
  if(e.code==='KeyV')toggleView();
  if(e.code==='Digit1')switchWeapon('rifle');
  if(e.code==='Digit2')switchWeapon('bow');
  if(e.code==='KeyQ')switchWeapon(player.weapon==='rifle'?'bow':'rifle');
  if(e.code==='KeyR')startReload();
  if(e.code==='KeyU'&&!paused){loadoutOpen?closeLoadout():openLoadout();}
  if(e.code==='Escape'&&fallbackLook&&gameStarted&&!player.dead){
    if(loadoutOpen)closeLoadout();
    else if(paused){paused=false;ui.pause.classList.add('hidden');}
    else showPause();
  }
  if(e.code==='KeyF')cycleWeather(true);
  if(e.code==='KeyT'){tod=(tod+2/24)%1;banner('TIME SKIP','+2 HOURS');}
});
addEventListener('keyup',e=>keys[e.code]=false);

canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  if(!gameStarted||paused||loadoutOpen||player.dead)return;
  if(e.button===0){mouseDown=true;onAttackDown();}
  if(e.button===2){
    rmbDown=true;dragMoved=0;
    if(fallbackLook)lookDrag=true;else player.ads=true;
  }
});
addEventListener('mouseup',e=>{
  if(e.button===0){mouseDown=false;onAttackUp();}
  if(e.button===2){
    rmbDown=false;lookDrag=false;
    if(!fallbackLook)player.ads=false;
    else if(dragMoved<6)player.ads=!player.ads;
  }
});
addEventListener('mousemove',e=>{
  if(!gameStarted||paused||player.dead)return;
  const locked=document.pointerLockElement===canvas;
  if(locked){
    rotateBy(e.movementX,e.movementY);
  }else if(fallbackLook&&lookDrag&&rmbDown){
    dragMoved+=Math.abs(e.movementX)+Math.abs(e.movementY);
    rotateBy(e.movementX,e.movementY);
  }
});
addEventListener('wheel',e=>{
  if(!gameStarted||paused||loadoutOpen)return;
  switchWeapon(player.weapon==='rifle'?'bow':'rifle');
},{passive:true});

document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement!==canvas&&gameStarted&&!player.dead&&!loadoutOpen&&!fallbackLook){
    showPause();
  }
});
document.addEventListener('pointerlockerror',()=>{fallbackLook=true;});

function rotateBy(dx,dy){
  const s=0.0021*parseFloat(ui.setSens.value)*(player.ads?0.55:1);
  player.yaw-=dx*s;
  player.pitch=clamp(player.pitch-dy*s,-1.35,1.35);
}

function onAttackDown(){
  attackEdge=true;
  if(player.weapon==='bow'){
    if(player.arrows>0&&player.reloading<=0){player.drawHeld=true;player.drawing=0.0001;AudioSys.bowDraw();}
  }
}
function onAttackUp(){
  if(player.weapon==='bow'&&player.drawHeld){
    player.drawHeld=false;
    const power=clamp(player.drawing/equipped.bow.drawTime,0,1);
    if(power>=0.22)fireBow(power);
    player.drawing=0;
  }
}
function switchWeapon(w){
  if(player.weapon===w)return;
  player.drawHeld=false;player.drawing=0;player.reloading=0;
  player.weapon=w;
  vmRifle.visible=w==='rifle';vmBow.visible=w==='bow';
  AudioSys.click();
  switchAnim=1;
}
let switchAnim=0;

function startReload(){
  if(player.weapon!=='rifle'||player.reloading>0)return;
  if(player.mag>=equipped.rifle.mag||player.reserve<=0)return;
  player.reloading=1.7;
  AudioSys.click();
}

/* ---------------- 12. SHOOTING ---------------- */
const raycaster=new THREE.Raycaster();
function rayGroundHit(o,d,maxD){
  let t=2;
  for(;t<maxD;t+=2){
    const px=o.x+d.x*t,py=o.y+d.y*t,pz=o.z+d.z*t;
    if(py-terrainH(px,pz)<=0){
      let lo=t-2,hi=t;
      for(let i=0;i<7;i++){
        const m=(lo+hi)/2;
        if(o.y+d.y*m-terrainH(o.x+d.x*m,o.z+d.z*m)<=0)hi=m;else lo=m;
      }
      return hi;
    }
  }
  return -1;
}
function shootDir(){
  const d=new THREE.Vector3(0,0,-1);
  d.applyQuaternion(camera.quaternion);
  return d;
}
function spreadMod(){
  let sp=1;
  if(player.ads)sp*=0.35;
  const spd=Math.hypot(player.vel.x,player.vel.z);
  sp*=1+spd*0.05;
  if(!player.onGround)sp*=1.8;
  return sp;
}

function fireRifle(){
  const R=equipped.rifle;
  if(player.mag<=0){startReload();return;}
  player.mag--;
  player.shotsFired++;
  player.fireCd=1/R.rps;
  AudioSys.shot(R.plasma);
  // muzzle flash
  vmRifle.userData.flash.material.opacity=rand(0.7,1);
  vmRifle.userData.flash.scale.setScalar(rand(0.28,0.5));
  vmRifle.userData.flash.material.rotation=rand(0,TAU);
  muzzleLight.intensity=R.plasma?6:4;
  // recoil
  player.recoil+=R.recoil;
  player.pitch+=0.011*R.recoil;
  player.yaw+=rand(-0.004,0.004)*R.recoil;
  player.fovKick+=R.recoil*0.6;
  // shell
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const mpos=muzzleWorld();
  if(!R.plasma)ejectShell(mpos,right,up);
  // ray
  const sp=R.spread*spreadMod();
  const dir=shootDir();
  dir.x+=rand(-sp,sp);dir.y+=rand(-sp,sp);dir.z+=rand(-sp,sp);
  dir.normalize();
  const origin=camera.position.clone();
  raycaster.set(origin,dir);
  raycaster.far=500;
  const hits=raycaster.intersectObjects(solidMeshes,false);
  let dist=500,hitObj=null,hitPoint=null;
  if(hits.length){dist=hits[0].distance;hitObj=hits[0].object;hitPoint=hits[0].point;}
  const gd=rayGroundHit(origin,dir,Math.min(dist,500));
  if(gd>0&&gd<dist){dist=gd;hitObj=null;hitPoint=origin.clone().addScaledVector(dir,gd);}
  const end=hitPoint||origin.clone().addScaledVector(dir,dist);
  tracer(mpos,end,R.plasma?0x7fe8ff:0xffd9a0,R.plasma?0.07:0.03);
  if(hitObj){
    const ud=hitObj.userData;
    if(ud.type==='enemy')damageEnemy(ud.ref,R.dmg,ud.part,end);
    else if(ud.type==='drone')damageDrone(ud.ref,R.dmg,end);
    else if(ud.type==='barrel')damageBarrel(ud.ref,R.dmg,end);
    else if(ud.type==='wall'){
      fx(end,{color:0xcfc8b8,count:5,speed:5,life:0.4,size:0.22});
      flashLight(end,0xffe0b0,2,7,0.1);
    }
  }else if(hitPoint){
    fx(hitPoint,{color:0x9b8f76,count:5,speed:4,life:0.5,size:0.3});
  }
  if(player.mag===0&&player.reserve>0)startReload();
}
function findBarrelByBody(body){for(const b of barrels)if(b.userData.body===body)return b;return null;}

function muzzleWorld(){
  const v=vmRifle.userData.muzzle.clone();
  vmRifle.updateWorldMatrix(true,false);
  v.applyMatrix4(vmRifle.matrixWorld);
  return v;
}

/* arrows in flight */
const flyingArrows=[];
function fireBow(power){
  if(player.arrows<=0)return;
  player.arrows--;
  player.shotsFired++;
  const B=equipped.bow;
  AudioSys.bowFire(power);
  const speed=lerp(26,B.speed,power);
  const dir=shootDir();
  const origin=camera.position.clone().addScaledVector(dir,0.4);
  const mesh=makeArrowMesh();
  mesh.position.copy(origin);
  scene.add(mesh);
  flyingArrows.push({
    mesh,
    vel:dir.multiplyScalar(speed),
    dmg:B.dmg*(0.55+0.45*power)*equipped.arrow.mul,
    windMul:B.windMul,
    t:0,power,
  });
  if(player.arrows===0)killFeed('<span style="color:#ff8a8a">Out of arrows — switch weapon</span>');
}
function updateArrows(dt){
  const wind=windVec;
  for(let i=flyingArrows.length-1;i>=0;i--){
    const a=flyingArrows[i];
    a.t+=dt;
    // substeps
    const steps=2,h=dt/steps;
    let dead=false,stuck=false;
    for(let s=0;s<steps&&!dead;s++){
      a.vel.y-=9.8*h;
      a.vel.x+=wind.x*0.42*a.windMul*h;
      a.vel.z+=wind.y*0.42*a.windMul*h;
      a.mesh.position.addScaledVector(a.vel,h);
      const p=a.mesh.position;
      // orient
      const look=p.clone().add(a.vel);
      a.mesh.lookAt(look);
      // ground
      if(p.y<=terrainH(p.x,p.z)+0.02){
        p.y=terrainH(p.x,p.z)+0.02;
        stickArrow(a.mesh,p);stuck=true;
        fx(p,{color:0x9b8f76,count:4,speed:3,life:0.4,size:0.25});
        dead=true;break;
      }
      // enemies
      let hitSomething=false;
      for(const e of enemies){
        if(!e.alive)continue;
        const ep=e.group.position;
        const headP=new THREE.Vector3(ep.x,ep.y+1.74,ep.z);
        const bodyP=new THREE.Vector3(ep.x,ep.y+1.15,ep.z);
        if(p.distanceTo(headP)<0.42){damageEnemy(e,a.dmg,'head',p);hitSomething=true;break;}
        if(p.distanceTo(bodyP)<0.62){damageEnemy(e,a.dmg,'body',p);hitSomething=true;break;}
      }
      if(hitSomething){dead=true;break;}
      for(const d of drones){
        if(d.alive&&p.distanceTo(d.group.position)<1.05){damageDrone(d,a.dmg,p);dead=true;break;}
      }
      if(dead)break;
      for(const b of barrels){
        if(b.userData.alive&&p.distanceTo(b.position.clone().add(new THREE.Vector3(0,0.7,0)))<0.9){
          damageBarrel(b,a.dmg,p);dead=true;break;
        }
      }
      if(dead)break;
      // buildings (AABB)
      for(const c of colliders){
        if(p.x>c.x1&&p.x<c.x2&&p.z>c.z1&&p.z<c.z2&&p.y<terrainH(p.x,p.z)+6){
          fx(p,{color:0xcfc8b8,count:4,speed:3,life:0.3,size:0.2});
          stickArrow(a.mesh,p);stuck=true;
          dead=true;break;
        }
      }
      if(a.t>12)dead=true;
    }
    if(dead){
      flyingArrows.splice(i,1);
      if(!stuck)scene.remove(a.mesh);
    }
  }
}
function stickArrow(mesh,pos){
  mesh.position.copy(pos);
  scene.add(mesh);
  stuckArrows.push(mesh);
  if(stuckArrows.length>40){const o=stuckArrows.shift();scene.remove(o);}
}

/* ---------------- 13. WEATHER / TIME ---------------- */
const weathers=[
  {id:'clear',name:'CLEAR',fog:0.00055,wind:2.2,vis:1},
  {id:'fog',name:'HEAVY FOG',fog:0.0042,wind:1.2,vis:0.75},
  {id:'rain',name:'RAIN',fog:0.0015,wind:4.5,vis:0.85},
  {id:'dust',name:'DUST STORM',fog:0.003,wind:7.5,vis:0.6},
  {id:'storm',name:'STORM',fog:0.0022,wind:9,vis:0.65},
];
let weatherIdx=0,weatherTimer=100;
let windAngle=rand(0,TAU),windMag=2.2,windVec=new THREE.Vector2(1,0);
let tod=0.19,timeSpeed=1;
const DAY_LEN=420;

function currentWeather(){return weathers[weatherIdx];}
function weatherAccuracy(){return currentWeather().vis;}
function cycleWeather(manual){
  weatherIdx=(weatherIdx+1)%weathers.length;
  weatherTimer=rand(80,140);
  const w=currentWeather();
  if(manual)banner('WEATHER SHIFT',w.name);
  else banner('WEATHER',w.name);
}

/* rain */
const RAIN_N=1500;
const rainGeo=new THREE.BufferGeometry();
const rainPos=new Float32Array(RAIN_N*3);
for(let i=0;i<RAIN_N;i++){rainPos[i*3]=rand(-45,45);rainPos[i*3+1]=rand(0,40);rainPos[i*3+2]=rand(-45,45);}
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rainMat=new THREE.PointsMaterial({color:0xa8c4d8,size:0.14,transparent:true,opacity:0,sizeAttenuation:true,depthWrite:false});
const rain=new THREE.Points(rainGeo,rainMat);
scene.add(rain);
/* dust */
const DUST_N=400;
const dustGeo=new THREE.BufferGeometry();
const dustPos=new Float32Array(DUST_N*3);
for(let i=0;i<DUST_N;i++){dustPos[i*3]=rand(-50,50);dustPos[i*3+1]=rand(0,10);dustPos[i*3+2]=rand(-50,50);}
dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dustMat=new THREE.PointsMaterial({color:0xd8b980,size:0.3,transparent:true,opacity:0,sizeAttenuation:true,depthWrite:false});
const dust=new THREE.Points(dustGeo,dustMat);
scene.add(dust);

function updateWeather(dt){
  const w=currentWeather();
  weatherTimer-=dt;
  if(weatherTimer<=0)cycleWeather(false);
  // wind drifts
  windAngle+=dt*0.02;
  windMag=lerp(windMag,w.wind*(0.8+0.4*fbm(perf*0.03,7,2)),dt*0.5);
  windVec.set(Math.cos(windAngle)*windMag,Math.sin(windAngle)*windMag);
  scene.fog.density=lerp(scene.fog.density,w.fog,dt*0.8);
  AudioSys.setWind(windMag);
  // rain
  const rainOn=w.id==='rain'||w.id==='storm';
  rainMat.opacity=lerp(rainMat.opacity,rainOn?(w.id==='storm'?0.75:0.55):0,dt*2);
  if(rainMat.opacity>0.02){
    rain.visible=true;
    const speed=w.id==='storm'?34:26;
    for(let i=0;i<RAIN_N;i++){
      rainPos[i*3+1]-=speed*dt;
      rainPos[i*3]+=windVec.x*dt*1.5;
      rainPos[i*3+2]+=windVec.y*dt*1.5;
      if(rainPos[i*3+1]<0){
        rainPos[i*3]=rand(-45,45);rainPos[i*3+1]=rand(25,40);rainPos[i*3+2]=rand(-45,45);
      }
      if(Math.abs(rainPos[i*3])>46)rainPos[i*3]*=-0.95;
      if(Math.abs(rainPos[i*3+2])>46)rainPos[i*3+2]*=-0.95;
    }
    rainGeo.attributes.position.needsUpdate=true;
    rain.position.set(player.pos.x,terrainH(player.pos.x,player.pos.z),player.pos.z);
  }else rain.visible=false;
  // dust
  const dustOn=w.id==='dust';
  dustMat.opacity=lerp(dustMat.opacity,dustOn?0.5:0,dt*2);
  if(dustOn){
    dust.visible=true;
    for(let i=0;i<DUST_N;i++){
      dustPos[i*3]+=windVec.x*dt*2.4;
      dustPos[i*3+2]+=windVec.y*dt*2.4;
      if(Math.abs(dustPos[i*3])>50)dustPos[i*3]*=-0.95;
      if(Math.abs(dustPos[i*3+2])>50)dustPos[i*3+2]*=-0.95;
    }
    dustGeo.attributes.position.needsUpdate=true;
    dust.position.set(player.pos.x,terrainH(player.pos.x,player.pos.z),player.pos.z);
  }else dust.visible=false;
}

const colDay={top:new THREE.Color(0x2c6fbd),bot:new THREE.Color(0xd6e9f4),sun:new THREE.Color(0xffe9c4),fog:new THREE.Color(0xb8cfdd)};
const colDusk={top:new THREE.Color(0x2a3a6e),bot:new THREE.Color(0xff9d5c),sun:new THREE.Color(0xffb066),fog:new THREE.Color(0xc8937a)};
const colNight={top:new THREE.Color(0x040814),bot:new THREE.Color(0x0d1626),sun:new THREE.Color(0x8fa8cc),fog:new THREE.Color(0x0a1018)};
const cA=new THREE.Color(),cB=new THREE.Color(),cC=new THREE.Color();
const sunDir=new THREE.Vector3();
let perf=0;

function updateSky(dt){
  tod=(tod+dt*timeSpeed/DAY_LEN)%1;
  const ang=tod*TAU;
  const elev=Math.sin(ang-Math.PI/2)*-1; // tod 0.25 => noon elev 1
  // actually: at tod=0.25 ang=pi/2, sin(0)=0... redo below properly
  const sunEl=Math.sin((tod-0.25)*TAU)*0.5+0.5; // 0 at tod=0 & .5, 1 at .25 — but tod0 should be night...
  // simpler explicit:
  const el=Math.sin(tod*TAU-Math.PI/2); // tod 0 -> -1 (midnight), tod .5 -> 1? sin(pi-pi/2)=1 yes noon at tod=.5
  const az=tod*TAU;
  sunDir.set(Math.cos(az)*Math.cos(el*1.2),Math.max(Math.sin(el*1.2),-0.4),Math.sin(az)*Math.cos(el*1.2)).normalize();
  const dayF=smoothstep(-0.12,0.25,el);
  const duskF=smoothstep(0.28,0.02,Math.abs(el))*0.9;
  const nightF=1-dayF;
  // colors
  cA.copy(colNight.top).lerp(colDay.top,dayF).lerp(colDusk.top,duskF*0.6);
  cB.copy(colNight.bot).lerp(colDay.bot,dayF).lerp(colDusk.bot,duskF);
  skyUni.top.value.copy(cA);
  skyUni.bot.value.copy(cB);
  skyUni.sunDir.value.copy(sunDir);
  skyUni.glow.value=dayF+duskF;
  const fogC=cC.copy(colNight.fog).lerp(colDay.fog,dayF).lerp(colDusk.fog,duskF*0.7);
  if(currentWeather().id==='dust')fogC.lerp(new THREE.Color(0xc0a06a),0.6);
  scene.fog.color.copy(fogC);
  // lights
  sun.position.copy(camera.position).addScaledVector(sunDir,300);
  sun.target.position.copy(camera.position);
  sun.intensity=Math.max(0,el)*1.35+0.06;
  cA.set(0xffe8c8).lerp(new THREE.Color(0xff9d5c),duskF);
  sun.color.copy(cA);
  moon.position.copy(camera.position).addScaledVector(sunDir.clone().negate(),300);
  moon.intensity=nightF*0.28;
  hemi.intensity=0.14+dayF*0.62;
  hemi.color.copy(cA.set(dayF>0.5?0xbfd8ff:0x31435e));
  starMat.opacity=clamp(nightF*1.2-0.15,0,0.9);
  // sprites
  sunSpr.position.copy(camera.position).addScaledVector(sunDir,1350);
  sunSpr.material.opacity=clamp(el*3,0,1)*0.95;
  moonSpr.position.copy(camera.position).addScaledVector(sunDir.clone().negate(),1350);
  moonSpr.material.opacity=nightF*0.8;
  stars.position.copy(camera.position);
  skyDome.position.copy(camera.position);
  // beacon blink
  const blink=(Math.sin(perf*3)>0.4)?1:0.05;
  towerBeacon.intensity=blink*(0.4+nightF*1.6);
  towerBulb.material.color.setHex(blink>0.5?0xff5555:0x551111);
  // clouds
  for(const c of clouds){
    c.position.x+=windVec.x*dt*1.2;
    c.position.z+=windVec.y*dt*1.2;
    if(c.position.x>950)c.position.x=-950;if(c.position.x<-950)c.position.x=950;
    if(c.position.z>950)c.position.z=-950;if(c.position.z<-950)c.position.z=950;
    c.material.opacity=lerp(c.material.opacity,currentWeather().id==='clear'?0.16:0.3,dt*0.2)*(0.3+dayF*0.7);
  }
  for(const m of mists){
    m.position.x+=windVec.x*dt*0.25;m.position.z+=windVec.y*dt*0.25;
    m.material.opacity=(currentWeather().id==='fog'?0.16:0.06)*(0.5+dayF*0.5);
  }
  // clock label
  const hh=Math.floor(tod*24),mm=Math.floor((tod*24-hh)*60);
  ui.clock.textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

/* ---------------- 14. MISSIONS / SCORE / UNLOCKS ---------------- */
let score=0,kills=0,missionIdx=-1,missionActive=false,missionCounter=0,betweenMissionT=3;
let endlessMode=false,waveTimer=30,ambientTimer=0;
const MISSIONS=[
  {title:'OPERATION: COLD OUTPOST',text:'Hostiles have occupied the abandoned outpost. Eliminate {n} of them.',type:'kill',target:5,wp:()=>new THREE.Vector3(VILLAGE.x,0,VILLAGE.z)},
  {title:'OPERATION: FIREBREAK',text:'Destroy {n} red fuel caches scattered around the sector.',type:'barrel',target:5,wp:()=>new THREE.Vector3(VILLAGE.x,0,VILLAGE.z)},
  {title:'OPERATION: SKY SWEEP',text:'Recon drones are tracking our movements. Shoot down {n} of them.',type:'drone',target:4,wp:()=>droneCenter()},
  {title:'OPERATION: HOLD THE LINE',text:'An assault force is incoming. Eliminate all {n} hostiles.',type:'wave',target:12,wp:()=>player.pos.clone()},
];
function droneCenter(){
  if(drones.length)return drones[0].group.position.clone();
  return new THREE.Vector3(VILLAGE.x+60,30,VILLAGE.z-60);
}
let missionWaypoint=new THREE.Vector3(VILLAGE.x,0,VILLAGE.z);

function startMission(i){
  missionIdx=i;missionActive=true;missionCounter=0;
  const m=MISSIONS[i];
  banner(m.title,`OBJECTIVE UPDATED`);
  AudioSys.unlock();
  if(m.type==='drone'){
    makeDrone(VILLAGE.x+40,VILLAGE.z-90,45,26);
    makeDrone(60,-120,55,30);
  }
  if(m.type==='barrel'){
    makeBarrel(VILLAGE.x+rand(-40,40),VILLAGE.z+rand(-40,40));
    makeBarrel(VILLAGE.x+rand(-50,50),VILLAGE.z+rand(-50,50));
  }
  if(m.type==='wave'){spawnWave(4);}
}
function missionEvent(type){
  if(!missionActive)return;
  const m=MISSIONS[missionIdx];
  if(m.type!==type)return;
  missionCounter++;
  if(type==='wave'&&missionCounter< m.target){
    const alive=enemies.filter(e=>e.alive).length;
    if(alive<=2)spawnWave(Math.min(4,m.target-missionCounter));
  }
  if(missionCounter>=m.target){
    missionActive=false;
    addScore(250);
    banner('MISSION COMPLETE',MISSIONS[missionIdx].title+' · +250');
    AudioSys.unlock();
    betweenMissionT=6;
    if(missionIdx===3){endlessMode=true;setTimeout(()=>banner('ENDLESS MODE','WAVES WILL KEEP COMING — SURVIVE'),4500);}
  }
}
function updateMissions(dt){
  if(missionIdx<MISSIONS.length-1&&!endlessMode){
    if(!missionActive){
      betweenMissionT-=dt;
      if(betweenMissionT<=0)startMission(missionIdx+1);
    }else{
      missionWaypoint=MISSIONS[missionIdx].wp();
    }
  }
  // ambient presence
  ambientTimer-=dt;
  if(ambientTimer<=0){
    ambientTimer=12;
    const alive=enemies.filter(e=>e.alive).length;
    if(alive<3&&!endlessMode){
      const a=rand(0,TAU),r=rand(70,130);
      const x=clamp(player.pos.x+Math.cos(a)*r,-700,700),z=clamp(player.pos.z+Math.sin(a)*r,-700,700);
      if(Math.hypot(x-LAKE.x,z-LAKE.z)>LAKE.r+8)makeSoldier(x,z);
    }
  }
  if(endlessMode){
    waveTimer-=dt;
    if(waveTimer<=0){
      waveTimer=Math.max(26,45-kills*0.3);
      spawnWave(clamp(Math.floor(3+kills/8),3,7));
      banner('WAVE INCOMING','DEFEND YOUR POSITION');
    }
    if(drones.length===0&&Math.random()<dt*0.02)makeDrone(player.pos.x+rand(-80,80),player.pos.z+rand(-80,80),rand(30,60),rand(18,30));
  }
}
function spawnWave(n){
  for(let k=0;k<n;k++){
    const a=rand(0,TAU),r=rand(55,85);
    let x=clamp(player.pos.x+Math.cos(a)*r,-720,720),z=clamp(player.pos.z+Math.sin(a)*r,-720,720);
    if(Math.hypot(x-LAKE.x,z-LAKE.z)<LAKE.r+6){x+=20;z+=20;}
    const e=makeSoldier(x,z);
    e.state='chase';
  }
}
function addScore(n){
  score+=n;
  for(const list of[BOWS,ARROWS,RIFLES])for(const it of list){
    if(!unlocked.has(it.id)&&score>=it.score){
      unlocked.add(it.id);
      banner('EQUIPMENT UNLOCKED',it.name+' — PRESS U');
      AudioSys.unlock();
      killFeed(`Unlocked <b>${it.name}</b>`);
    }
  }
}

/* ---------------- 15. HUD / DOM ---------------- */
const ui={
  hud:document.getElementById('hud'),
  hpF:document.getElementById('hpF'),arF:document.getElementById('arF'),stF:document.getElementById('stF'),
  hpV:document.getElementById('hpV'),arV:document.getElementById('arV'),stV:document.getElementById('stV'),
  scoreV:document.getElementById('scoreV'),killsV:document.getElementById('killsV'),accV:document.getElementById('accV'),
  fpsV:document.getElementById('fpsV'),qualV:document.getElementById('qualV'),
  wpnName:document.getElementById('wpnName'),wpnType:document.getElementById('wpnType'),
  ammoBig:document.getElementById('ammoBig'),ammoRes:document.getElementById('ammoRes'),ammoHint:document.getElementById('ammoHint'),
  objTitle:document.getElementById('objTitle'),objText:document.getElementById('objText'),objProgF:document.getElementById('objProgF'),
  banner:document.getElementById('banner'),bannerTitle:document.getElementById('bannerTitle'),bannerSub:document.getElementById('bannerSub'),
  killfeed:document.getElementById('killfeed'),
  windArrow:document.getElementById('windArrow'),windSpd:document.getElementById('windSpd'),
  clock:document.getElementById('clock'),weatherName:document.getElementById('weatherName'),
  dmgFlash:document.getElementById('dmgFlash'),
  hitmark:document.getElementById('hitmark'),
  minimap:document.getElementById('minimap'),compassCv:document.getElementById('compassCv'),
  chT:document.getElementById('chT'),chB:document.getElementById('chB'),chL:document.getElementById('chL'),chR:document.getElementById('chR'),chDot:document.getElementById('chDot'),
  interactHint:document.getElementById('interactHint'),
  startScreen:document.getElementById('startScreen'),pause:document.getElementById('pause'),loadout:document.getElementById('loadout'),deathScreen:document.getElementById('deathScreen'),
  deathStats:document.getElementById('deathStats'),
  setSens:document.getElementById('setSens'),setVol:document.getElementById('setVol'),setQual:document.getElementById('setQual'),setTime:document.getElementById('setTime'),
  lockNote:document.getElementById('lockNote'),
};
const hud=ui.hud;

let bannerT=null;
function banner(t,s){
  ui.bannerTitle.textContent=t;ui.bannerSub.textContent=s||'';
  ui.banner.style.opacity=1;
  if(bannerT)clearTimeout(bannerT);
  bannerT=setTimeout(()=>ui.banner.style.opacity=0,3200);
}
function killFeed(html){
  const d=document.createElement('div');
  d.className='kf';d.innerHTML=html;
  ui.killfeed.prepend(d);
  while(ui.killfeed.children.length>5)ui.killfeed.removeChild(ui.killfeed.lastChild);
  setTimeout(()=>{d.style.transition='opacity 1s';d.style.opacity=0;setTimeout(()=>d.remove(),1100);},5200);
}
let hmT=null;
function hitmark(hs){
  ui.hitmark.className=hs?'hs':'';
  ui.hitmark.style.opacity=1;
  if(hmT)clearTimeout(hmT);
  hmT=setTimeout(()=>ui.hitmark.style.opacity=0,140);
}

const mmCtx=ui.minimap.getContext('2d');
function drawMinimap(){
  const ctx=mmCtx,S=170,span=340;
  ctx.clearRect(0,0,S,S);
  ctx.save();
  ctx.beginPath();ctx.arc(S/2,S/2,S/2-1,0,TAU);ctx.clip();
  ctx.fillStyle='#0a1218';ctx.fillRect(0,0,S,S);
  const scale=256/(WORLD_HALF*2);
  const sw=span*scale;
  const sx=clamp((player.pos.x+WORLD_HALF)*scale-sw/2,0,256-sw);
  const sy=clamp((player.pos.z+WORLD_HALF)*scale-sw/2,0,256-sw);
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(mapCv,sx,sy,sw,sw,0,0,S,S);
  const toMap=(wx,wz)=>[S/2+(wx-player.pos.x)/span*S,S/2+(wz-player.pos.z)/span*S];
  // entities
  ctx.fillStyle='#ff5a5a';
  for(const e of enemies){if(!e.alive)continue;const[a,b]=toMap(e.group.position.x,e.group.position.z);ctx.fillRect(a-2,b-2,4,4);}
  ctx.fillStyle='#7fe3ff';
  for(const d of drones){if(!d.alive)continue;const[a,b]=toMap(d.group.position.x,d.group.position.z);ctx.beginPath();ctx.arc(a,b,3,0,TAU);ctx.fill();}
  ctx.fillStyle='#ffb454';
  for(const b of barrels){if(!b.userData.alive)continue;const[a,c2]=toMap(b.position.x,b.position.z);ctx.fillRect(a-1.5,c2-1.5,3,3);}
  ctx.fillStyle='#9dff7f';
  for(const p of pickups){if(p.userData.taken)continue;const[a,b]=toMap(p.position.x,p.position.z);ctx.fillRect(a-1.5,b-1.5,3,3);}
  // waypoint
  const[wx,wy]=toMap(missionWaypoint.x,missionWaypoint.z);
  ctx.strokeStyle='#ffd24d';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(clamp(wx,8,S-8),clamp(wy,8,S-8),5,0,TAU);ctx.stroke();
  // player arrow
  ctx.save();
  ctx.translate(S/2,S/2);ctx.rotate(-player.yaw);
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(4.5,5);ctx.lineTo(0,2.5);ctx.lineTo(-4.5,5);ctx.closePath();ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle='rgba(127,227,255,.4)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(S/2,S/2,S/2-1,0,TAU);ctx.stroke();
}

const cpCtx=ui.compassCv.getContext('2d');
function drawCompass(){
  const W=360,H=30;
  cpCtx.clearRect(0,0,W,H);
  const heading=(-player.yaw*180/Math.PI)%360;
  cpCtx.textAlign='center';
  for(let deg=-90;deg<=90;deg+=15){
    let a=(heading+deg+360)%360;
    const x=W/2+deg*2;
    if(deg%90===0){
      const names={0:'N',90:'E',180:'S',270:'W'};
      cpCtx.fillStyle='#fff';cpCtx.font='bold 13px sans-serif';
      const card=Math.round(a/90)*90%360;
      const dAng=Math.abs(((a-card+540)%360)-180);
      if(dAng<8)cpCtx.fillText(names[card],x,14);
    }else if(deg%45===0){
      cpCtx.fillStyle='rgba(255,255,255,.75)';cpCtx.font='9px sans-serif';
      const card=Math.round(a/45)*45%360;
      const nm={45:'NE',135:'SE',225:'SW',315:'NW'};
      const dAng=Math.abs(((a-card+540)%360)-180);
      if(nm[card]&&dAng<8)cpCtx.fillText(nm[card],x,12);
    }
    cpCtx.strokeStyle='rgba(255,255,255,.35)';
    cpCtx.beginPath();cpCtx.moveTo(x,H-6);cpCtx.lineTo(x,H-2);cpCtx.stroke();
  }
  // waypoint marker
  const dx=missionWaypoint.x-player.pos.x,dz=missionWaypoint.z-player.pos.z;
  const bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;
  let diff=((bearing-heading+540)%360)-180;
  if(Math.abs(diff)<90){
    const x=W/2+diff*2;
    cpCtx.fillStyle='#ffd24d';
    cpCtx.beginPath();cpCtx.moveTo(x,2);cpCtx.lineTo(x-5,9);cpCtx.lineTo(x+5,9);cpCtx.closePath();cpCtx.fill();
  }
  cpCtx.fillStyle='#7fe3ff';
  cpCtx.fillRect(W/2-1,0,2,H);
}

let lastHud={hp:-1,ar:-1,st:-1,score:-1,ammo:-1,res:-1,arr:-1,wpn:'',obj:''};
function updateHUD(){
  const set=(el,v,key,fmt)=>{if(lastHud[key]!==v){lastHud[key]=v;fmt();}};
  const hp=Math.ceil(player.hp),ar=Math.ceil(player.armor),st=Math.ceil(player.stamina);
  if(lastHud.hp!==hp){lastHud.hp=hp;ui.hpF.style.width=hp+'%';ui.hpV.textContent=hp;}
  if(lastHud.ar!==ar){lastHud.ar=ar;ui.arF.style.width=ar+'%';ui.arV.textContent=ar;}
  if(lastHud.st!==st){lastHud.st=st;ui.stF.style.width=st+'%';ui.stV.textContent=st;}
  if(lastHud.score!==score){lastHud.score=score;ui.scoreV.textContent=score;ui.killsV.textContent=kills;}
  ui.accV.textContent=player.shotsFired?Math.round(player.shotsHit/player.shotsFired*100)+'%':'—';
  // weapon panel
  if(player.weapon==='rifle'){
    const R=equipped.rifle;
    if(lastHud.wpn!=='r'+R.id){lastHud.wpn='r'+R.id;ui.wpnName.textContent=R.name;ui.wpnType.textContent=R.plasma?'PLASMA CANNON':'ASSAULT RIFLE';}
    const mg=player.reloading>0?'··':player.mag;
    if(lastHud.ammo!==mg){lastHud.ammo=mg;ui.ammoBig.textContent=mg;ui.ammoBig.style.color=player.mag===0?'#ff8a8a':'#fff';}
    if(lastHud.res!==player.reserve){lastHud.res=player.reserve;ui.ammoRes.textContent='/ '+player.reserve;}
    ui.ammoHint.textContent=player.reloading>0?'RELOADING…':'R RELOAD · Q / WHEEL SWITCH · U LOADOUT';
  }else{
    const B=equipped.bow;
    if(lastHud.wpn!=='b'+B.id){lastHud.wpn='b'+B.id;ui.wpnName.textContent=B.name;ui.wpnType.textContent='COMPOUND BOW · '+equipped.arrow.name;}
    if(lastHud.arr!==player.arrows){lastHud.arr=player.arrows;ui.ammoBig.textContent=player.arrows;ui.ammoBig.style.color=player.arrows===0?'#ff8a8a':'#fff';}
    ui.ammoRes.textContent='ARROWS';
    ui.ammoHint.textContent=player.drawHeld?'HOLD TO DRAW · RELEASE TO FIRE':'HOLD LMB TO DRAW · U LOADOUT';
  }
  // objectives
  let objHtml;
  if(missionIdx>=0&&missionIdx<MISSIONS.length&&missionActive){
    const m=MISSIONS[missionIdx];
    objHtml=m.title+'|'+m.text.replace('{n}',m.target)+'|'+missionCounter+'/'+m.target+'|'+(missionCounter/m.target*100);
  }else if(endlessMode){
    objHtml='ENDLESS MODE|Survive the assault waves. Next wave soon.|'+kills+' kills|100';
  }else{
    objHtml='STANDBY|Prepare for the next operation…|—|100';
  }
  if(lastHud.obj!==objHtml){
    lastHud.obj=objHtml;
    const[a,b,c,d]=objHtml.split('|');
    ui.objTitle.textContent=a;ui.objText.textContent=b;ui.objProgF.style.width=d+'%';
  }
  // wind
  ui.windSpd.textContent=windMag.toFixed(1);
  const wa=Math.atan2(windVec.y,windVec.x);
  ui.windArrow.style.transform=`rotate(${-player.yaw-wa}rad)`;
  ui.weatherName.textContent=currentWeather().name;
  // crosshair gap
  const R=equipped.rifle;
  let gap=10;
  if(player.weapon==='rifle')gap=8+R.spread*spreadMod()*900+(player.recoil*6);
  else gap=player.drawHeld?22-14*clamp(player.drawing/equipped.bow.drawTime,0,1):14;
  if(player.ads)gap*=0.5;
  ui.chT.style.top=(-gap-9)+'px';ui.chB.style.top=(gap)+'px';
  ui.chL.style.left=(-gap-9)+'px';ui.chR.style.left=(gap)+'px';
  ui.chDot.style.opacity=player.ads?'0':'1';
}

/* ---------------- 16. LOADOUT UI ---------------- */
function buildLoadout(){
  const mk=(list,holder,cat)=>{
    holder.innerHTML='';
    list.forEach(it=>{
      const isUn=unlocked.has(it.id);
      const isEq=equipped[cat].id===it.id;
      const d=document.createElement('div');
      d.className='itemCard'+(isEq?' eq':'')+(isUn?'':' lk');
      let stats='';
      if(cat==='bow')stats=`DMG ${it.dmg} · DRAW ${it.drawTime}s · WIND ×${it.windMul}`;
      if(cat==='arrow')stats=`DAMAGE ×${it.mul}`;
      if(cat==='rifle')stats=`DMG ${it.dmg} · ${it.rps}/s · MAG ${it.mag}`;
      d.innerHTML=`<div class="nm">${it.name}</div><div class="st">${it.desc}<br>${stats}</div>`+
        (isEq?'<span class="eqTag">EQUIPPED</span>':(isUn?'':'<span class="lk2">🔒 '+it.score+' PTS</span>'));
      if(isUn)d.onclick=()=>{
        equipped[cat]=it;
        if(cat==='rifle'){player.mag=Math.min(player.mag,it.mag);if(player.mag===0)player.mag=it.mag;}
        AudioSys.click();buildLoadout();switchAnim=1;
      };
      holder.appendChild(d);
    });
  };
  mk(BOWS,document.getElementById('loadBows'),'bow');
  mk(ARROWS,document.getElementById('loadArrows'),'arrow');
  mk(RIFLES,document.getElementById('loadRifles'),'rifle');
}
function openLoadout(){
  loadoutOpen=true;buildLoadout();
  ui.loadout.classList.remove('hidden');
  if(document.pointerLockElement)document.exitPointerLock();
  paused=true;
}
function closeLoadout(){
  loadoutOpen=false;paused=false;
  ui.loadout.classList.add('hidden');
  tryLock();
}

/* ---------------- 17. MENUS / FLOW ---------------- */
function tryLock(){
  if(fallbackLook)return;
  try{
    const p=canvas.requestPointerLock();
    if(p&&p.catch)p.catch(()=>{fallbackLook=true;});
  }catch(e){fallbackLook=true;}
  setTimeout(()=>{
    if(document.pointerLockElement!==canvas&&!fallbackLook)fallbackLook=true;
  },900);
}
function showPause(){
  if(loadoutOpen||player.dead)return;
  paused=true;
  ui.pause.classList.remove('hidden');
}
document.getElementById('btnStart').onclick=()=>{
  AudioSys.init();
  gameStarted=true;
  ui.startScreen.classList.add('hidden');
  hud.style.display='block';
  document.body.classList.add('cine');
  setTimeout(()=>document.body.classList.remove('cine'),4200);
  tryLock();
  banner('SECTOR 7 — IRON HORIZON','CLEAR THE OUTPOST');
  startMission(0);
};
document.getElementById('btnResume').onclick=()=>{
  paused=false;ui.pause.classList.add('hidden');
  if(!fallbackLook)tryLock();
};
document.getElementById('btnRestart').onclick=()=>{location.reload();};
document.getElementById('btnCloseLoad').onclick=closeLoadout;
document.getElementById('btnRespawn').onclick=()=>{
  player.dead=false;player.hp=100;player.armor=25;player.stamina=100;
  player.pos.set(SPAWN.x,terrainH(SPAWN.x,SPAWN.z)+1.7,SPAWN.z);
  player.vel.set(0,0,0);
  addScore(-50);
  ui.deathScreen.classList.add('hidden');
  hud.style.display='block';
  tryLock();
  banner('REDEPLOYED','SCORE PENALTY -50');
};
ui.setVol.oninput=()=>{if(AudioSys.master)AudioSys.master.gain.value=parseFloat(ui.setVol.value);};
ui.setQual.onchange=()=>{
  const q=ui.setQual.value;
  if(q==='low'){
    renderer.setPixelRatio(1);sun.castShadow=false;renderer.shadowMap.enabled=false;
    ui.qualV.textContent='PERF';
  }else{
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));sun.castShadow=true;renderer.shadowMap.enabled=true;
    ui.qualV.textContent='HIGH';
  }
  // re-enable shadows requires material update
  scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});
};
ui.setTime.onchange=()=>{timeSpeed=parseFloat(ui.setTime.value);};

/* ---------------- 18. MAIN LOOP ---------------- */
let last=performance.now(),fpsAcc=0,fpsN=0,fpsT=0,thirdPerson=false;
function toggleView(){thirdPerson=!thirdPerson;charGroup.visible=thirdPerson;vmRoot.visible=!thirdPerson;AudioSys.click();}

// initial enemies
for(let i=0;i<6;i++){
  const a=rand(0,TAU),r=rand(8,42);
  makeSoldier(VILLAGE.x+Math.cos(a)*r,VILLAGE.z+Math.sin(a)*r);
}

function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;
  dt=Math.min(dt,0.05);
  perf+=dt;

  if(gameStarted&&!paused&&!loadoutOpen&&!player.dead){
    update(dt);
  }
  updateFx(dt);updateTracers(dt);updateShells(dt);updateLights(dt);
  renderer.render(scene,camera);
  if(gameStarted){
    updateHUD();drawMinimap();drawCompass();
    fpsAcc+=dt;fpsN++;fpsT+=dt;
    if(fpsT>0.5){ui.fpsV.textContent=Math.round(fpsN/fpsAcc);fpsAcc=0;fpsN=0;fpsT=0;}
  }
}
requestAnimationFrame(frame);

function update(dt){
  const t=perf;
  /* ---- player movement ---- */
  const fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));
  let mx=0,mz=0;
  if(keys['KeyW']){mx+=fwd.x;mz+=fwd.z;}
  if(keys['KeyS']){mx-=fwd.x;mz-=fwd.z;}
  if(keys['KeyA']){mx-=right.x;mz-=right.z;}
  if(keys['KeyD']){mx+=right.x;mz+=right.z;}
  mx+=fwd.x*touchVec.y+right.x*touchVec.x;
  mz+=fwd.z*touchVec.y+right.z*touchVec.x;
  const moving=mx!==0||mz!==0;
  if(moving){const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l;}}
  player.sprint=(!!(keys['ShiftLeft']||keys['ShiftRight'])||touchSprint)&&moving&&player.stamina>1&&!player.ads&&!player.drawHeld;
  let speed=player.sprint?9.4:5.6;
  if(player.ads)speed*=0.62;
  if(player.drawHeld)speed*=0.5;
  player.vel.x=lerp(player.vel.x,mx*speed,clamp(dt*10,0,1));
  player.vel.z=lerp(player.vel.z,mz*speed,clamp(dt*10,0,1));
  // gravity / jump
  player.vel.y-=23*dt;
  if((keys['Space']||jumpQueued)&&player.onGround&&player.stamina>8){player.vel.y=7.8;player.onGround=false;player.stamina-=8;jumpQueued=false;}
  player.pos.addScaledVector(player.vel,dt);
  // ground
  const gh=terrainH(player.pos.x,player.pos.z);
  if(player.pos.y<=gh+1.7){player.pos.y=gh+1.7;player.vel.y=0;player.onGround=true;}
  else player.onGround=false;
  // water: don't sink below wade level
  if(player.pos.y<WL+1.5&&Math.hypot(player.pos.x-LAKE.x,player.pos.z-LAKE.z)<LAKE.r){
    player.pos.y=Math.max(player.pos.y,WL+1.5);player.vel.y=Math.max(player.vel.y,0);player.onGround=true;
    if(Math.random()<dt*6)fx(new THREE.Vector3(player.pos.x,WL+0.1,player.pos.z),{color:0x9fd0e0,count:1,speed:1,life:0.5,size:0.4});
  }
  // bounds + colliders
  const rad=Math.hypot(player.pos.x,player.pos.z);
  if(rad>WORLD_HALF-14){const s=(WORLD_HALF-14)/rad;player.pos.x*=s;player.pos.z*=s;}
  for(const c of colliders){
    if(player.pos.x>c.x1-0.5&&player.pos.x<c.x2+0.5&&player.pos.z>c.z1-0.5&&player.pos.z<c.z2+0.5){
      const dl=player.pos.x-(c.x1-0.5),dr=(c.x2+0.5)-player.pos.x;
      const db=player.pos.z-(c.z1-0.5),df=(c.z2+0.5)-player.pos.z;
      const mn=Math.min(dl,dr,db,df);
      if(mn===dl)player.pos.x=c.x1-0.5;else if(mn===dr)player.pos.x=c.x2+0.5;
      else if(mn===db)player.pos.z=c.z1-0.5;else player.pos.z=c.z2+0.5;
    }
  }
  // stamina
  if(player.sprint)player.stamina=Math.max(0,player.stamina-16*dt);
  else player.stamina=Math.min(100,player.stamina+(player.onGround?13:6)*dt);

  /* ---- weapons ---- */
  player.fireCd-=dt;
  if(player.reloading>0){
    player.reloading-=dt;
    if(player.reloading<=0){
      const need=equipped.rifle.mag-player.mag;
      const take=Math.min(need,player.reserve);
      player.mag+=take;player.reserve-=take;
    }
  }
  if(player.weapon==='rifle'&&player.fireCd<=0&&!player.reloading){
    if(equipped.rifle.auto?mouseDown:attackEdge){fireRifle();attackEdge=false;}
  }
  if(player.drawHeld){
    player.drawing+=dt;
    // sway
    const sw=0.0012+0.0018*clamp(player.drawing/equipped.bow.drawTime,0,1);
    player.pitch+=Math.sin(t*1.7)*sw*dt*8;
    player.yaw+=Math.cos(t*1.3)*sw*dt*8;
  }
  player.recoil=Math.max(0,player.recoil-dt*7);
  player.fovKick=Math.max(0,player.fovKick-dt*8);
  vmRifle.userData.flash.material.opacity*=Math.pow(0.0001,dt*8);
  muzzleLight.intensity*=Math.pow(0.001,dt*6);

  /* ---- camera ---- */
  const targetFov=player.ads?(player.weapon==='bow'?38:50):75+ (player.sprint?5:0)+player.fovKick*1.5;
  camera.fov=lerp(camera.fov,targetFov,clamp(dt*12,0,1));
  camera.updateProjectionMatrix();
  shake=Math.max(0,shake-dt*2.2);
  const shX=(Math.random()-0.5)*shake*0.02,shY=(Math.random()-0.5)*shake*0.02,shZ=(Math.random()-0.5)*shake*0.012;
  if(!thirdPerson){
    camera.position.copy(player.pos);
    camera.rotation.set(player.pitch+shX,player.yaw+shY,shZ);
    // viewmodel placement
    const ad=player.ads?1:0;
    const px=lerp(VM_POS.x,VM_ADS.x,ad),py=lerp(VM_POS.y,VM_ADS.y,ad),pz=lerp(VM_POS.z,VM_ADS.z,ad);
    const bob=Math.sin(t*(player.sprint?11:8))*clamp(Math.hypot(player.vel.x,player.vel.z)*0.012,0,0.02);
    vmRoot.position.set(px,py+bob*(1-ad),pz);
    vmRoot.rotation.set(player.recoil*0.06+shX,0,0);
    vmRoot.translateZ(player.recoil*0.035);
    switchAnim=Math.max(0,switchAnim-dt*3);
    vmRoot.position.y-=switchAnim*0.25;
    // bow anim
    if(player.weapon==='bow'){
      const B=equipped.bow,pw=clamp(player.drawing/B.drawTime,0,1);
      const u=vmBow.userData;
      const pull=pw*0.2;
      const midZ=u.restZ+pull;
      u.arrow.position.set(0,0,midZ);
      u.arrow.visible=player.arrows>0;
      const pa=u.string.geometry.attributes.position;
      pa.setXYZ(0,u.tipA.x,u.tipA.y,u.tipA.z);
      pa.setXYZ(1,0,0,midZ);
      pa.setXYZ(2,u.tipB.x,u.tipB.y,u.tipB.z);
      pa.needsUpdate=true;
      vmBow.rotation.z=pw*0.03;
    }
  }else{
    // third person
    const back=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
    const cp=player.pos.clone().addScaledVector(back,4.6).add(new THREE.Vector3(0,1.2,0));
    const tgh=terrainH(cp.x,cp.z)+0.5;
    if(cp.y<tgh)cp.y=tgh;
    camera.position.copy(cp);
    const lookT=player.pos.clone().addScaledVector(fwd,14);
    lookT.y+=1.2+Math.tan(clamp(player.pitch,-1.1,1.1))*9;
    camera.lookAt(lookT);
    camera.rotation.z+=shZ;
    // character
    charGroup.position.set(player.pos.x,player.pos.y-1.7,player.pos.z);
    charGroup.rotation.y=player.yaw;
    const spd=Math.hypot(player.vel.x,player.vel.z);
    const u=charGroup.userData;
    const ph=t*spd*1.8;
    u.legL.rotation.x=Math.sin(ph)*clamp(spd*0.12,0,0.7);
    u.legR.rotation.x=-Math.sin(ph)*clamp(spd*0.12,0,0.7);
    u.armL.rotation.x=-1.1;u.armR.rotation.x=-1.1;
  }

  /* ---- world updates ---- */
  updateSky(dt);
  updateWeather(dt);
  updateEnemies(dt,t);
  updateDrones(dt);
  updateArrows(dt);
  updateMissions(dt);

  /* ---- pickups & arrow recovery ---- */
  let hint='';
  for(const p of pickups){
    if(p.userData.taken)continue;
    p.rotation.y+=dt*2;p.position.y+=Math.sin(t*2+p.position.x)*dt*0.25;
    if(p.position.distanceTo(player.pos)<1.9){
      p.userData.taken=true;scene.remove(p);
      AudioSys.pickup();
      if(p.userData.type==='ammo'){player.reserve+=60;killFeed('Picked up <b>rifle ammo +60</b>');}
      if(p.userData.type==='med'){player.hp=Math.min(100,player.hp+50);killFeed('Used <b>medkit +50 HP</b>');}
      if(p.userData.type==='armor'){player.armor=Math.min(100,player.armor+50);killFeed('Equipped <b>armor plate +50</b>');}
    }
  }
  // recover arrows
  for(let i=stuckArrows.length-1;i>=0;i--){
    const a=stuckArrows[i];
    if(a.position.distanceTo(player.pos)<2.0){
      scene.remove(a);stuckArrows.splice(i,1);
      player.arrows=Math.min(48,player.arrows+1);
      AudioSys.click();
      hint='ARROW RECOVERED';
    }
  }
  if(player.arrows<=6&&player.weapon==='bow')hint=hint||'LOW ARROWS — RECOVER STUCK ARROWS';
  ui.interactHint.textContent=hint;
  ui.interactHint.style.opacity=hint?1:0;

  /* ---- shadow follow ---- */
  sun.shadow.camera.updateProjectionMatrix();
}

/* ---------------- 19. TOUCH CONTROLS ---------------- */
isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
if(isTouch){
  fallbackLook=true;
  document.body.classList.add('touch');
  ui.lockNote.textContent='TOUCH: LEFT STICK MOVE · RIGHT SIDE DRAG = LOOK · TAP DEPLOY';
  const stickBase=document.getElementById('stickBase');
  const stickKnob=document.getElementById('stickKnob');
  let stickId=null,stickOX=0,stickOY=0,lookId=null,lookLX=0,lookLY=0;
  const R=60;
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;
    if(e.target.closest('.tbtn')||e.target.closest('.overlay')||e.target.closest('#stickBase'))return;
    if(!gameStarted||player.dead)return;
    if(e.clientX<innerWidth*0.45&&stickId===null){
      stickId=e.pointerId;stickOX=e.clientX;stickOY=e.clientY;
      stickBase.style.display='block';
      stickBase.style.left=(stickOX-R)+'px';
      stickBase.style.top=(stickOY-R)+'px';
      stickKnob.style.left=(R-22)+'px';stickKnob.style.top=(R-22)+'px';
    }else if(lookId===null){
      lookId=e.pointerId;lookLX=e.clientX;lookLY=e.clientY;
    }
    if(!e.target.closest('.overlay'))e.preventDefault();
  },{passive:false});
  document.addEventListener('pointermove',e=>{
    if(e.pointerId===stickId){
      let dx=e.clientX-stickOX,dy=e.clientY-stickOY;
      const l=Math.hypot(dx,dy);
      if(l>R){dx=dx/l*R;dy=dy/l*R;}
      stickKnob.style.left=(R-22+dx)+'px';
      stickKnob.style.top=(R-22+dy)+'px';
      touchVec.x=dx/R;touchVec.y=-dy/R;
    }else if(e.pointerId===lookId){
      const dx=e.clientX-lookLX,dy=e.clientY-lookLY;
      lookLX=e.clientX;lookLY=e.clientY;
      rotateBy(dx*1.9,dy*1.9);
    }
  },{passive:true});
  const endTouch=e=>{
    if(e.pointerId===stickId){stickId=null;touchVec.x=0;touchVec.y=0;stickBase.style.display='none';}
    if(e.pointerId===lookId)lookId=null;
  };
  document.addEventListener('pointerup',endTouch);
  document.addEventListener('pointercancel',endTouch);
  // buttons
  const bind=(id,down,up)=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();down&&down();});
    const end=e=>{e.preventDefault();e.stopPropagation();up&&up();};
    el.addEventListener('pointerup',end);
    el.addEventListener('pointercancel',end);
  };
  const fireBtn=document.getElementById('btnFire');
  bind('btnFire',()=>{if(!gameStarted||paused||player.dead)return;fireBtn.classList.add('on');mouseDown=true;onAttackDown();},
                 ()=>{fireBtn.classList.remove('on');mouseDown=false;onAttackUp();});
  bind('btnAim',()=>{if(gameStarted&&!player.dead)player.ads=!player.ads;});
  bind('btnJump',()=>{jumpQueued=true;});
  bind('btnSprint',()=>{touchSprint=!touchSprint;document.getElementById('btnSprint').classList.toggle('on',touchSprint);});
  bind('btnSwap',()=>{if(gameStarted)switchWeapon(player.weapon==='rifle'?'bow':'rifle');});
  bind('btnReload',()=>{if(gameStarted)startReload();});
  bind('btnCam',()=>{if(gameStarted)toggleView();});
  bind('btnPauseT',()=>{if(gameStarted&&!player.dead){paused?resumeGame():showPause();}});
}
function resumeGame(){paused=false;ui.pause.classList.add('hidden');if(!fallbackLook)tryLock();}

/* fallback hint */
setTimeout(()=>{
  if(fallbackLook&&!isTouch)ui.lockNote.textContent='MOUSE CAPTURE UNAVAILABLE IN THIS VIEWER — HOLD RIGHT MOUSE BUTTON TO LOOK · DOWNLOAD THE FILE FOR FULL EXPERIENCE';
},1500);
