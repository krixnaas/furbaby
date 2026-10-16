const petEl = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const text = document.getElementById('text');
const chat = document.getElementById('chat');

let state = 'idle', stateTimer, bubbleTimer, wokenAt = 0, autoSlept = false;
let settings = {}, dir = 1, awaySlept = false; // dir: 1 = moving right, -1 = left

const STATES = ['sit', 'highfive', 'sleep', 'walk', 'trot', 'run', 'hop', 'fly', 'jump', 'spin', 'graze', 'rear'];

// speed > 0 slides the window along the screen while in this state
function setState(next, ms, speed = 0) {
  clearTimeout(stateTimer);
  state = next;
  petEl.classList.remove(...STATES);
  if (next !== 'idle') petEl.classList.add(next);
  window.pet.motion(speed, dir);
  if (ms) stateTimer = setTimeout(() => setState('idle'), ms);
}

// The photo faces settings.facing; mirror it so it always faces where it's going.
function face(d) {
  dir = d;
  petEl.dataset.dir = d; // pet3d.js turns the model with this
  petEl.classList.toggle('flip', !!settings.photo && (dir === 1) !== (settings.facing === 'right'));
}

// ---------- how each animal moves ----------
// gait = how it walks; moves = what it picks from when wandering (repeats = more likely)
const PETS = {
  horse: { gait: 'trot', walk: 2, run: 7, moves: ['walk', 'walk', 'run', 'jump', 'graze', 'graze', 'rear', 'idle'] },
  dog: { gait: 'trot', walk: 2, run: 6, moves: ['walk', 'walk', 'run', 'run', 'jump', 'spin', 'sit', 'idle'] },
  cat: { gait: 'walk', walk: 1, run: 5, moves: ['walk', 'walk', 'idle', 'idle', 'pounce', 'jump', 'sit'] },
  fox: { gait: 'trot', walk: 2, run: 6, moves: ['walk', 'walk', 'run', 'pounce', 'jump', 'sit', 'idle'] },
  bird: { gait: 'hop', walk: 1, run: 4, moves: ['walk', 'walk', 'fly', 'jump', 'idle'] },
  rabbit: { gait: 'hop', walk: 2, run: 5, moves: ['walk', 'run', 'jump', 'jump', 'idle', 'idle'] }
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const kind = () => PETS[settings.type] || PETS.cat;

const ACTIONS = {
  walk: () => { face(Math.random() < .5 ? 1 : -1); setState(kind().gait, rand(3000, 7000), kind().walk); },
  run: () => setState(settings.type === 'bird' ? 'fly' : 'run', rand(1500, 3500), kind().run),
  fly: () => setState('fly', rand(2000, 4000), kind().run),
  jump: () => setState('jump', 900),
  pounce: () => { setState('run', 500, kind().run); setTimeout(() => state === 'run' && setState('jump', 900), 500); },
  spin: () => setState('spin', 1000),
  graze: () => setState('graze', rand(3000, 6000)),
  rear: () => setState('rear', 1300),
  sit: () => setState('sit', rand(3000, 6000)),
  idle: () => {}
};

// Wander: when idle for a moment, pick something to do.
let nextMoveAt = Date.now() + 3000;
setInterval(() => {
  const busy = state !== 'idle' || drag || bubble.classList.contains('typing');
  if (busy) { nextMoveAt = Date.now() + rand(1500, 4000); return; }
  if (!settings.walk || Date.now() < nextMoveAt) return;
  ACTIONS[pick(kind().moves)]();
}, 250);

function say(msg, ms = 8000) {
  text.textContent = msg;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  if (ms) bubbleTimer = setTimeout(() => bubble.classList.remove('show', 'typing'), ms);
}

let inputMode = 'chat'; // the bubble's text box is reused for renaming
function openInput(mode, prompt, placeholder) {
  if (state === 'sleep') wake();
  inputMode = mode;
  chat.placeholder = placeholder;
  say(prompt, 0);
  bubble.classList.add('typing');
  chat.focus();
}
const openChat = () => openInput('chat', 'What’s up?', 'Say something…');

function wake() { wokenAt = Date.now(); setState('idle'); }

function happy() {
  petEl.classList.remove('happy');
  void petEl.getBoundingClientRect(); // restart the animation
  petEl.classList.add('happy');
}

const TRICKS = {
  sit: () => { setState('sit', 4000); say('*sits nicely*', 2500); },
  jump: ACTIONS.jump,
  // you've been away 5 min / you're back (from main.js)
  away: () => { if (state !== 'sleep') { setState('sleep'); awaySlept = true; } },
  back: () => { if (awaySlept && state === 'sleep') { awaySlept = false; wake(); say('Welcome back! 👋', 4000); } },
  run: ACTIONS.run,
  highfive: () => { setState('highfive', 1500); say('High five! ✋', 2000); },
  sleep: () => (state === 'sleep' ? wake() : setState('sleep')),
  chat: openChat,
  rename: () => openInput('rename', 'What should I be called?', 'New name, then Enter')
};

// ---------- chat ----------
chat.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') return bubble.classList.remove('show', 'typing');
  if (e.key !== 'Enter' || !chat.value.trim()) return;
  const msg = chat.value.trim();
  chat.value = '';
  bubble.classList.remove('typing');
  if (inputMode === 'rename') return window.pet.rename(msg);
  say('…', 0);
  say(await window.pet.chat(msg), 15000);
});

// ---------- drag, click, double-click, right-click ----------
let drag = null;
petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (state !== 'sleep' && state !== 'idle') setState('idle'); // stop walking when grabbed
  drag = { x: e.screenX, y: e.screenY, moved: false };
  petEl.setPointerCapture(e.pointerId);
});
petEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  window.pet.moveBy(dx, dy);
  drag.x = e.screenX; drag.y = e.screenY;
});
petEl.addEventListener('pointerup', () => {
  const clicked = drag && !drag.moved;
  drag = null;
  if (!clicked) return;
  if (state === 'sleep') return wake();
  happy(); // petting
});
petEl.addEventListener('dblclick', openChat);
petEl.addEventListener('contextmenu', (e) => { e.preventDefault(); window.pet.menu(); });

// Drop an image onto the pet to make it your pet.
petEl.addEventListener('dragover', (e) => e.preventDefault());
petEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (file) window.pet.dropPhoto(file);
});

// Tell the main process which parts of the window are clickable; everything else clicks through.
setInterval(() => {
  const rects = [petEl.getBoundingClientRect()];
  if (bubble.classList.contains('show')) rects.push(bubble.getBoundingClientRect());
  window.pet.hitRects(rects.map(({ x, y, width, height }) => ({ x, y, width, height })), !!drag);
}, 100);

// ---------- life ----------
setInterval(() => {
  if (state !== 'sleep') { petEl.classList.add('blink'); setTimeout(() => petEl.classList.remove('blink'), 150); }
}, 4000);

function checkBedtime() {
  const h = new Date().getHours();
  const night = h >= 22 || h < 7;
  if (night && state === 'idle' && Date.now() - wokenAt > 10 * 60_000) { setState('sleep'); autoSlept = true; }
  if (!night && state === 'sleep' && autoSlept) { autoSlept = false; wake(); }
}
setInterval(checkBedtime, 60_000);

window.pet.onSay((msg) => { if (state === 'sleep') wake(); happy(); say(msg, 12000); });
window.pet.onTrick((t) => TRICKS[t]?.());
window.pet.onTurn(face);

window.pet.settings().then((s) => {
  settings = s;
  const facingLeft = s.facing !== 'right';
  document.documentElement.style.setProperty('--head', facingLeft ? -1 : 1); // which way "head down" tilts
  document.documentElement.style.setProperty('--hind', facingLeft ? '75%' : '25%'); // pivot for rearing
  face(dir);
  document.documentElement.style.setProperty('--fur', s.furColor);
  document.documentElement.style.setProperty('--size', `${s.size}px`);
  if (s.photo) {
    document.getElementById('photo').src = `${s.photo}?${Date.now()}`; // bust cache after a new pick
    petEl.classList.add('photo');
  }
  checkBedtime();
  if (state !== 'sleep') {
    say(s.name
      ? `Hi! I'm ${s.name}. Double-click me to chat, right-click for tricks.`
      : 'Hi! I don’t have a name yet. Right-click me → Name your pet…', 6000);
  }
});
