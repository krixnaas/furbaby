// Live 3D pet: plays the model's real animations for whatever state renderer.js puts on #pet.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const petEl = document.getElementById('pet');
const canvas = document.getElementById('stage');

// state → [clip names to try in order, playback speed, play once?]
const CLIPS = {
  idle: [['idle'], 1],
  walk: [['walk'], 1],
  trot: [['walk'], 1.7],
  hop: [['walk'], 1.3],
  run: [['gallop', 'run', 'walk'], 1],
  fly: [['gallop', 'run', 'walk'], 1.4],
  jump: [['gallop_jump', 'jump', 'jump_loop', 'jump_start'], 1, true],
  graze: [['eating', 'idle_eating', 'idle_headlow', 'idle_2_headlow'], 1],
  rear: [['attack_kick', 'attack_headbutt', 'headbutt', 'attack'], 1, true],
  sit: [['idle_2_headlow', 'idle_headlow', 'idle_eating', 'idle'], 1],
  sleep: [['idle_headlow', 'idle_2_headlow', 'idle'], 0.35],
  highfive: [['attack_kick', 'attack', 'yes', 'bite_front', 'jump'], 1, true],
  spin: [['dance', 'idle_2', 'idle'], 1],
  happy: [['idle_2', 'yes', 'jump', 'idle'], 1, true]
};
const MOVING = ['walk', 'trot', 'hop', 'run', 'fly'];

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 1.2, 5.2);
camera.lookAt(0, 0.8, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7c6a, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 5, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
sun.shadow.radius = 4;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.3 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const holder = new THREE.Group(); // turned to face where the pet is going
scene.add(holder);

let mixer, clips = new Map(), current, currentKey;

function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

// ---------- model ----------
async function load(type) {
  const bytes = await window.pet.model(type); // read by the main process (fetch can't read file:// here)
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

  // Normalise size: every model pack uses a different scale. Models face +Z.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(2 / Math.max(size.x, size.z), 1.6 / size.y);
  model.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  holder.add(model);

  mixer = new THREE.AnimationMixer(model);
  // Clip names look like "AnimalArmature|Walk" and are sometimes duplicated; keep the first of each.
  for (const clip of gltf.animations) {
    const name = clip.name.split('|').pop().replace(/^bunny_/i, '').toLowerCase();
    if (!clips.has(name)) clips.set(name, clip);
  }
  return model;
}

function play(state) {
  if (!mixer) return; // model still loading
  const [names, speed, once] = CLIPS[state] || CLIPS.idle;
  const name = names.find((n) => clips.has(n)) || (clips.has('idle') ? 'idle' : clips.keys().next().value);
  const key = `${name}@${speed}`;
  if (key === currentKey && !once) return;
  const action = mixer.clipAction(clips.get(name));
  action.reset().setEffectiveTimeScale(speed).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = !!once;
  if (current && current !== action) current.fadeOut(0.25);
  action.fadeIn(0.25).play();
  current = action;
  currentKey = key;
}

// ---------- tint the model with the photo's colours ----------
async function photoColours(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 64, 64);
  const px = [];
  const d = g.getImageData(0, 0, 64, 64).data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (px.length < 50) return null;
  px.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const avg = (from, to) => {
    const part = px.slice(Math.floor(px.length * from), Math.ceil(px.length * to));
    return new THREE.Color().setRGB(...[0, 1, 2].map((k) => part.reduce((s, p) => s + p[k], 0) / part.length / 255), THREE.SRGBColorSpace);
  };
  // middle of the brightness range = coat; darkest = mane/tail/points
  return { coat: avg(0.35, 0.75), dark: avg(0, 0.15) };
}

function tint(model, { coat, dark }) {
  const light = coat.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
  const pick = { main: coat, fur: coat, pigeon_main: coat, main_light: light, fur_white: light, main_dark: dark, hair: dark, pigeon_secondary: dark };
  model.traverse((o) => {
    for (const m of [o.material].flat().filter(Boolean)) {
      const colour = pick[m.name?.toLowerCase()];
      if (colour) m.color.copy(colour);
    }
  });
}

// ---------- follow renderer.js ----------
let state = 'idle', dir = 1, spinUntil = 0;

function readState() {
  dir = Number(petEl.dataset.dir) || 1;
  const next = Object.keys(CLIPS).find((s) => s !== 'happy' && s !== 'idle' && petEl.classList.contains(s)) || 'idle';
  if (next === 'spin' && state !== 'spin') spinUntil = performance.now() + 1000;
  state = next;
  play(state);
}
let wasHappy = false;
new MutationObserver(() => {
  const happy = petEl.classList.contains('happy');
  if (happy && !wasHappy && state === 'idle') play('happy');
  wasHappy = happy;
  readState();
}).observe(petEl, { attributes: true, attributeFilter: ['class', 'data-dir'] });

let last = performance.now();
function frame(now = performance.now()) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  mixer.update(dt);
  // a one-shot clip that finished hands back to the state's own clip
  if (current && !current.isRunning() && current.loop === THREE.LoopOnce) { currentKey = null; play(state); }

  // side-on while travelling, three-quarter towards you while standing
  let target = dir * (MOVING.includes(state) ? Math.PI / 2 : Math.PI / 4);
  if (performance.now() < spinUntil) target += (1 - (spinUntil - performance.now()) / 1000) * Math.PI * 2;
  holder.rotation.y += (target - holder.rotation.y) * Math.min(1, dt * 6);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.pet.settings().then(async (s) => {
  try {
    const model = await load(s.type || 'cat');
    if (s.photo) {
      const colours = await photoColours(s.photo).catch(() => null);
      if (colours) tint(model, colours);
    }
    petEl.classList.add('three');
    resize();
    readState();
    frame();
  } catch (err) {
    console.error('3D pet failed, staying 2D:', err);
  }
});
