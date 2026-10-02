import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = 'model3.glb';
const MODEL_SIZE = 6;
const SPIN_PARTS = ['parca_10', 'parca_11', 'parca_12', 'parca_13'];
const SPIN_SPEED = 32;
const COLOR_ORANGE = new THREE.Color(0xe7a15a);
const COLOR_PINK = new THREE.Color(0xff6fae);
const V3 = THREE.Vector3;

const stage = document.getElementById('stage');
const listEl = document.getElementById('list');
const railCanvas = document.getElementById('railCanvas');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const barEl = document.getElementById('bar');
const toastEl = document.getElementById('toast');
const hintEl = document.getElementById('hint');
const cubeEl = document.getElementById('cube');
const vcubeEl = document.getElementById('vcube');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f6fa);
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7f2, 1.35));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xfff6ea, 1.35);
sun.position.set(6, 10, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
sun.shadow.camera.right = sun.shadow.camera.top = 8;
sun.shadow.bias = -0.0004;
scene.add(sun);

const turntable = new THREE.Group();
scene.add(turntable);
const rotor = new THREE.Group();
let rotorReady = false;
let rotorSpeed = 0;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const railScene = new THREE.Scene();
railScene.add(new THREE.HemisphereLight(0xffffff, 0xe8eef6, 1.4));
railScene.add(new THREE.AmbientLight(0xffffff, 0.45));
const railKey = new THREE.DirectionalLight(0xffffff, 1.1);
railKey.position.set(2, 3, 4);
railScene.add(railKey);
const railCam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
const railRenderer = new THREE.WebGLRenderer({ canvas: railCanvas, antialias: true, alpha: true });
railRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
railRenderer.setClearColor(0x000000, 0);

const orbit = { yaw: 0.72, pitch: 0.42, dist: 14, homeYaw: 0.72, homePitch: 0.42, homeDist: 14 };
const target = new V3(0, 2.2, 0);
let spinVel = { y: 0, p: 0 };
let autoSpin = false;
let propellerOn = false;
let finished = false;
let loaded = false;
let S = 1;
const pieces = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hover = null;

const IDENT = new THREE.Quaternion();
const AXES = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];
const clock = new THREE.Clock();

let audioCtx = null;
function beep(freq, dur, type, vol, slide, delay = 0) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  pop: () => beep(560, 0.08, 'sine', 0.2, 820),
  knock: () => beep(360, 0.12, 'triangle', 0.35, 120),
  nope: () => beep(200, 0.14, 'square', 0.08, 140),
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.32, 'triangle', 0.28, null, i * 0.1)),
};

function applyOrbit() {
  const cp = Math.cos(orbit.pitch);
  camera.position.set(
    target.x + orbit.dist * cp * Math.sin(orbit.yaw),
    target.y + orbit.dist * Math.sin(orbit.pitch),
    target.z + orbit.dist * cp * Math.cos(orbit.yaw)
  );
  camera.lookAt(target);
  cubeEl.style.transform = `rotateX(${-orbit.pitch}rad) rotateY(${-orbit.yaw}rad)`;
}

function fitDistance() {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect || 1;
  const radius = MODEL_SIZE * 0.72;
  const dist = radius / Math.sin(fov / 2);
  return dist / Math.min(1, aspect) * 0.92;
}

function resize() {
  const w = Math.max(1, stage.clientWidth);
  const h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const rail = railCanvas.parentElement.getBoundingClientRect();
  railRenderer.setSize(Math.max(1, rail.width), Math.max(1, rail.height), false);
  applyOrbit();
}
new ResizeObserver(resize).observe(stage);
new ResizeObserver(resize).observe(listEl);

function updateInfo() {
  const done = pieces.filter((p) => p.placed).length;
  countEl.textContent = pieces.length ? `${done} / ${pieces.length}` : '—';
  statusEl.textContent = finished ? 'Bitti' : `${done} / ${pieces.length}`;
  barEl.style.width = pieces.length ? `${(done / pieces.length) * 100}%` : '0%';
}

function activePiece() {
  return pieces.find((p) => !p.placed) || null;
}

function showHint(text) {
  hintEl.textContent = text;
}

function finish() {
  if (finished) return;
  finished = true;
  updateInfo();
  toastEl.classList.add('show');
  document.querySelector('[data-act="spin"]').classList.add('attention');
  showHint('Model tamamlandı. Animasyon düğmesi pervaneleri döndürür.');
  sfx.win();
  autoSpin = true;
}

function place(p) {
  if (p.placed || p.flying) return;
  if (p !== activePiece()) {
    p.card.classList.remove('shake');
    void p.card.offsetWidth;
    p.card.classList.add('shake');
    sfx.nope();
    showHint('Önce pembe çerçeveli parçayı yerleştirin.');
    return;
  }
  p.placed = true;
  p.flying = true;
  p.fly = 0;
  const next = activePiece();
  const rest = [...listEl.querySelectorAll('.card')].filter((card) => card !== p.card);
  const before = new Map(rest.map((card) => [card, card.getBoundingClientRect().top]));
  p.card.remove();
  sfx.pop();
  updateInfo();
  if (next) {
    next.card.classList.add('active', 'rise');
    next.card.addEventListener('animationend', () => next.card.classList.remove('rise'), { once: true });
  }
  rest.forEach((card) => {
    const dy = before.get(card) - card.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    card.style.transition = 'none';
    card.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      card.style.transition = 'transform 0.38s ease';
      card.style.transform = '';
    });
  });
  showHint(next ? 'Sıradaki pembe parçaya tıklayın. Kart üzerinde sürükleyerek parçayı döndürebilirsiniz.' : 'Son parça yerine oturuyor.');
}

function labelOf(name) {
  const n = name.match(/(\d+)/);
  return n ? n[1].padStart(2, '0') : name;
}

function ensureRotor() {
  if (rotorReady) return rotor;
  const blades = pieces.filter((item) => item.spin);
  const hub = blades[0];
  const center = new V3();
  blades.forEach((item) => center.add(item.targetLocal));
  center.multiplyScalar(1 / blades.length);
  rotor.position.copy(center);
  rotor.quaternion.setFromUnitVectors(new V3(0, 1, 0), hub.spin.shaft.clone().normalize());
  turntable.add(rotor);
  rotorReady = true;
  return rotor;
}

function mountPropeller(p) {
  const hub = ensureRotor();
  hub.attach(p.pivot);
  if (p.blur) return;
  p.blur = [];
  const axis = new V3(0, 1, 0);
  [-0.34, 0.34].forEach((angle) => {
    const copy = p.pivot.clone(true);
    copy.traverse((node) => {
      if (!node.isMesh) return;
      node.material = node.material.clone();
      node.material.transparent = true;
      node.material.opacity = 0;
      node.material.depthWrite = false;
      node.castShadow = false;
    });
    copy.position.copy(p.pivot.position).applyAxisAngle(axis, angle);
    copy.quaternion.setFromAxisAngle(axis, angle).multiply(p.pivot.quaternion);
    copy.visible = false;
    hub.add(copy);
    p.blur.push(copy);
  });
}

new GLTFLoader().load(MODEL_URL, (gltf) => {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const whole = new THREE.Box3();
  const packed = [];
  meshes.forEach((m) => {
    const box = new THREE.Box3().setFromObject(m);
    whole.union(box);
    packed.push({ m, box, center: box.getCenter(new V3()), size: box.getSize(new V3()) });
  });
  const wholeSize = whole.getSize(new V3());
  const wholeCenter = whole.getCenter(new V3());
  S = MODEL_SIZE / Math.max(wholeSize.x, wholeSize.y, wholeSize.z);
  target.y = (wholeSize.y * S) * 0.46;

  packed.forEach((o, index) => {
    const pivot = new THREE.Group();
    pivot.position.copy(o.center);
    scene.add(pivot);
    pivot.attach(o.m);
    o.m.material = new THREE.MeshStandardMaterial({ color: COLOR_ORANGE.clone(), roughness: 0.42, metalness: 0.04 });
    o.m.castShadow = true;
    o.m.receiveShadow = true;

    const ghost = pivot.clone(true);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0xc5d7ea, transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.2,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    ghost.traverse((node) => {
      if (!node.isMesh) return;
      node.material = ghostMat;
      node.castShadow = false;
      node.add(new THREE.LineSegments(new THREE.EdgesGeometry(node.geometry, 28), edgeMat));
    });

    const targetLocal = new V3(
      (o.center.x - wholeCenter.x) * S,
      (o.center.y - whole.min.y) * S,
      (o.center.z - wholeCenter.z) * S
    );
    ghost.position.copy(targetLocal);
    ghost.scale.setScalar(S);
    turntable.add(ghost);

    const preview = new THREE.Group();
    const previewMesh = o.m.clone();
    previewMesh.material = o.m.material;
    previewMesh.castShadow = false;
    preview.add(previewMesh);
    const pb = new THREE.Box3().setFromObject(preview);
    const pc = pb.getCenter(new V3());
    const ps = pb.getSize(new V3());
    previewMesh.position.sub(pc);
    preview.scale.setScalar(1.65 / (Math.max(ps.x, ps.y, ps.z) || 1));

    const lname = o.m.name.toLowerCase();
    const key = SPIN_PARTS.find((k) => lname.includes(k));
    const shaft = new THREE.Vector3(0, 1, 0);
    o.m.updateWorldMatrix(true, false);
    shaft.transformDirection(o.m.matrixWorld).normalize();
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card' + (index === 0 ? ' active' : '');
    card.innerHTML = `<span class="tag">${labelOf(o.m.name)}</span><span class="check">✓</span>`;
    listEl.appendChild(card);

    pieces.push({
      name: o.m.name,
      pivot,
      ghost,
      ghostMat,
      edgeMat,
      mat: o.m.material,
      preview,
      previewYaw: 0.6,
      previewPitch: 0.35,
      card,
      targetLocal,
      placed: false,
      flying: false,
      arrived: false,
      fly: 0,
      spin: key ? { shaft, v: 0 } : null,
    });
  });

  orbit.homeDist = fitDistance();
  orbit.dist = orbit.homeDist;
  loaded = true;
  updateInfo();
  showHint('Pembe çerçeveli parçaya tıklayın; yerine ilerleyip oturur. Kart üzerinde sürükleyerek parçayı 360° döndürebilirsiniz.');
  resize();
}, undefined, (err) => {
  console.error(err);
  statusEl.textContent = 'Model yüklenemedi';
});

function renderRail() {
  const view = railCanvas.getBoundingClientRect();
  if (view.width < 2 || view.height < 2) return;
  railRenderer.setScissorTest(true);
  railRenderer.setClearColor(0x000000, 0);
  railRenderer.clear();
  pieces.forEach((p) => {
    if (p.placed) return;
    const r = p.card.getBoundingClientRect();
    const x = r.left - view.left;
    const y = view.bottom - r.bottom;
    const w = r.width;
    const h = r.height;
    if (w < 4 || h < 4 || r.bottom < view.top || r.top > view.bottom) return;
    p.preview.rotation.set(p.previewPitch, p.previewYaw, 0);
    railScene.add(p.preview);
    railCam.aspect = w / h;
    railCam.position.set(0, 0.12, 2.45);
    railCam.lookAt(0, 0, 0);
    railCam.updateProjectionMatrix();
    railRenderer.setViewport(x, y, w, h);
    railRenderer.setScissor(x, y, w, h);
    railRenderer.render(railScene, railCam);
    railScene.remove(p.preview);
  });
  railRenderer.setScissorTest(false);
}

let rotatingView = null;
let cubeDrag = null;
let cardDrag = null;

stage.addEventListener('pointerdown', (e) => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (!loaded || e.target.closest('.tools')) return;
  rotatingView = { x: e.clientX, y: e.clientY, moved: false };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  if (!rotatingView) return;
  const dx = e.clientX - rotatingView.x;
  const dy = e.clientY - rotatingView.y;
  if (Math.hypot(dx, dy) > 3) rotatingView.moved = true;
  orbit.yaw -= dx * 0.008;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.008, -1.2, 1.2);
  spinVel.y = -dx * 0.008;
  spinVel.p = dy * 0.008;
  rotatingView.x = e.clientX;
  rotatingView.y = e.clientY;
  applyOrbit();
});
stage.addEventListener('pointerup', () => { rotatingView = null; });
stage.addEventListener('pointercancel', () => { rotatingView = null; });
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  orbit.dist = THREE.MathUtils.clamp(orbit.dist * (e.deltaY > 0 ? 1.08 : 0.92), 4, 40);
  applyOrbit();
}, { passive: false });

vcubeEl.addEventListener('pointerdown', (e) => {
  if (e.target.dataset.face) return;
  cubeDrag = { x: e.clientX, y: e.clientY };
  vcubeEl.setPointerCapture(e.pointerId);
});
vcubeEl.addEventListener('pointermove', (e) => {
  if (!cubeDrag) return;
  const dx = e.clientX - cubeDrag.x;
  const dy = e.clientY - cubeDrag.y;
  orbit.yaw -= dx * 0.012;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.012, -1.2, 1.2);
  cubeDrag.x = e.clientX;
  cubeDrag.y = e.clientY;
  applyOrbit();
});
const endCube = () => { cubeDrag = null; };
vcubeEl.addEventListener('pointerup', endCube);
vcubeEl.addEventListener('pointercancel', endCube);
cubeEl.addEventListener('click', (e) => {
  const face = e.target.dataset.face;
  if (!face) return;
  const map = {
    front: [0, 0.08],
    back: [Math.PI, 0.08],
    left: [-Math.PI / 2, 0.08],
    right: [Math.PI / 2, 0.08],
    top: [orbit.yaw, 1.15],
    bottom: [orbit.yaw, -1.05],
  };
  const [yaw, pitch] = map[face];
  orbit.yaw = yaw;
  orbit.pitch = pitch;
  applyOrbit();
});

document.getElementById('tools').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'home') {
    orbit.yaw = orbit.homeYaw;
    orbit.pitch = orbit.homePitch;
    orbit.dist = orbit.homeDist;
  } else if (act === 'fit') {
    orbit.dist = fitDistance();
  } else if (act === 'zin') {
    orbit.dist = Math.max(4, orbit.dist * 0.82);
  } else if (act === 'zout') {
    orbit.dist = Math.min(40, orbit.dist * 1.22);
  } else if (act === 'iso') {
    orbit.yaw = Math.PI / 4;
    orbit.pitch = 0.62;
    orbit.dist = fitDistance();
  } else if (act === 'spin') {
    const ready = pieces.some((p) => p.spin && p.arrived);
    if (!ready) {
      showHint('Pervane parçaları yerine oturunca animasyon düğmesi dönüşü başlatır.');
      return;
    }
    propellerOn = !propellerOn;
    btn.classList.toggle('on', propellerOn);
    btn.classList.remove('attention');
    showHint(propellerOn ? 'Pervane animasyonu açık.' : 'Pervane animasyonu durdu.');
    return;
  }
  applyOrbit();
});

listEl.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.card');
  if (!card || !loaded) return;
  const p = pieces.find((item) => item.card === card);
  if (!p || p.placed) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  cardDrag = { p, x: e.clientX, y: e.clientY, moved: false };
  card.setPointerCapture(e.pointerId);
});
listEl.addEventListener('pointermove', (e) => {
  if (!cardDrag) return;
  const dx = e.clientX - cardDrag.x;
  const dy = e.clientY - cardDrag.y;
  if (Math.hypot(dx, dy) > 4) cardDrag.moved = true;
  cardDrag.p.previewYaw += dx * 0.015;
  cardDrag.p.previewPitch = THREE.MathUtils.clamp(cardDrag.p.previewPitch + dy * 0.015, -1.4, 1.4);
  cardDrag.x = e.clientX;
  cardDrag.y = e.clientY;
});
const endCard = () => {
  if (cardDrag && !cardDrag.moved) place(cardDrag.p);
  cardDrag = null;
};
listEl.addEventListener('pointerup', endCard);
listEl.addEventListener('pointercancel', endCard);

function updateHover() {
  if (!loaded || finished || rotatingView) {
    hover = null;
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const ghosts = pieces.filter((p) => !p.arrived).map((p) => p.ghost);
  const hits = raycaster.intersectObjects(ghosts, true);
  hover = null;
  if (hits.length) {
    let o = hits[0].object;
    while (o) {
      const found = pieces.find((p) => p.ghost === o);
      if (found) { hover = found; break; }
      o = o.parent;
    }
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const k = 1 - Math.exp(-dt * 8);
  const time = clock.elapsedTime;
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);

  if (!rotatingView && !cubeDrag) {
    if (Math.abs(spinVel.y) > 0.0003 || Math.abs(spinVel.p) > 0.0003) {
      orbit.yaw += spinVel.y;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + spinVel.p, -1.2, 1.2);
      spinVel.y *= Math.pow(0.9, dt * 60);
      spinVel.p *= Math.pow(0.9, dt * 60);
      applyOrbit();
    } else if (autoSpin) {
      orbit.yaw += dt * 0.25;
      applyOrbit();
    }
  }

  const next = activePiece();
  pieces.forEach((p) => {
    const isNext = p === next && !p.placed;
    p.mat.color.lerp(isNext || p === hover ? COLOR_PINK : COLOR_ORANGE, 0.2);
    p.mat.emissive.setHex(isNext ? 0xff2d8a : 0x000000);
    p.mat.emissiveIntensity = isNext ? 0.15 + 0.2 * pulse : 0;
    if (!p.arrived) {
      p.ghostMat.opacity = THREE.MathUtils.lerp(p.ghostMat.opacity, isNext ? 0.34 + 0.1 * pulse : 0.16, 0.2);
      p.edgeMat.opacity = THREE.MathUtils.lerp(p.edgeMat.opacity, isNext ? 0.9 : 0.35, 0.2);
      p.ghostMat.color.setHex(isNext ? 0xffc0dc : 0xc5d7ea);
    }
    p.pivot.visible = p.flying || p.arrived;

    if (p.flying) {
      p.fly = Math.min(1, p.fly + dt * 0.85);
      const ease = 1 - Math.pow(1 - p.fly, 3);
      const start = target.clone().add(new V3(-3.2, 1.4, 1.6));
      const goal = p.targetLocal.clone();
      turntable.localToWorld(goal);
      p.pivot.position.copy(start).lerp(goal, ease);
      p.pivot.quaternion.copy(IDENT).slerp(turntable.quaternion, ease);
      p.pivot.scale.setScalar(THREE.MathUtils.lerp(S * 0.45, S, ease));
      if (p.fly >= 1) {
        turntable.attach(p.pivot);
        p.pivot.position.copy(p.targetLocal);
        p.pivot.quaternion.copy(IDENT);
        p.pivot.scale.setScalar(S);
        p.flying = false;
        p.arrived = true;
        p.ghost.visible = false;
        sfx.knock();
        if (pieces.every((item) => item.arrived)) finish();
      }
    }

    if (p.spin && p.arrived) {
      const goal = propellerOn ? SPIN_SPEED : 0;
      p.spin.v = THREE.MathUtils.lerp(p.spin.v, goal, 1 - Math.exp(-dt * (propellerOn ? 1.6 : 2.4)));
      if (p.spin.v > 0.02) p.pivot.rotateOnAxis(p.spin.shaft, p.spin.v * dt);
    }
  });

  updateHover();
  renderer.render(scene, camera);
  if (loaded) renderRail();
});

resize();
applyOrbit();

const assistantLog = document.getElementById('assistantLog');
const assistantPanel = document.getElementById('assistantPanel');

function addBubble(text) {
  const el = document.createElement('div');
  el.className = 'bubble bot';
  el.textContent = text;
  assistantLog.appendChild(el);
  assistantLog.scrollTop = assistantLog.scrollHeight;
}

function openAssistant() {
  assistantPanel.hidden = false;
  assistantLog.replaceChildren();
  const done = pieces.filter((p) => p.placed).length;
  const next = pieces.find((p) => !p.placed);
  addBubble('Builder. Parçalar soldaki listede montaj sırasıyla durur. Pembe kart sıradaki parçadır; tıklayınca yerine oturur.');
  addBubble(pieces.length
    ? `Modelde ${pieces.length} parça var. Yerleşen: ${done}. ${next ? `Sıradaki parça: ${labelOf(next.name)}.` : 'Tüm parçalar yerleşti.'}`
    : 'Model henüz yüklenmedi.');
  addBubble('Pervane parçaları 10, 11, 12 ve 13 kendi eksenlerinde döner. Animasyon düğmesi yalnızca bu parçaları çalıştırır.');
}

assistantPanel.hidden = true;
document.getElementById('assistantOpen').addEventListener('click', openAssistant);
document.getElementById('assistantClose').addEventListener('click', () => {
  assistantPanel.hidden = true;
});
