const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, powerMonitor, screen, shell } = require('electron');
const { makePet3D } = require('./tripo');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const Anthropic = require('@anthropic-ai/sdk').default;

// window = pet + room above it for the speech bubble and jumps
const winSize = () => ({ width: Math.max(260, settings.size + 100), height: Math.round(settings.size * 1.6) + 120 });
const PET_TYPES = ['horse', 'dog', 'cat', 'fox', 'bird', 'rabbit'];
const userFile = (name) => path.join(app.getPath('userData'), name);

const DEFAULTS = {
  name: '', // unnamed until you name it (right-click → Name your pet…)
  furColor: '#f4a259',
  size: 200, // pet size in pixels
  photo: '', // file:// URL of your own pet photo; set via right-click → Choose pet photo…
  type: 'cat', // which animal it is: decides the 3D model and how it moves
  walk: true, // wander around the screen on its own
  facing: 'left', // which way the animal in the photo faces; fix with right-click → Turn around
  breakMinutes: 45,
  model: 'claude-opus-5-5',
  apiKey: '', // empty = use ANTHROPIC_API_KEY from the environment
  tripoApiKey: '', // Tripo3D key for "Make my exact pet in 3D" (platform.tripo3d.ai)
  customModel: false, // true = use the 3D model made from your photo
  modelTurn: 0 // degrees to turn a custom model so it faces the right way
};

function readJson(file, fallback) {
  try { return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return fallback; }
}
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

let win, settings, memory, client;
let history = []; // this session's chat, append-only (thinking blocks must be echoed back unchanged)

function say(text) { win?.webContents.send('say', text); }
function notify(text) {
  new Notification({ title: settings.name || 'Your pet', body: text }).show();
  say(text);
}

// ---------- window ----------
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...winSize(),
    x: workArea.x + workArea.width - winSize().width - 20,
    y: workArea.y + workArea.height - winSize().height,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.on('closed', () => { win = null; });
  win.webContents.on('did-finish-load', sendHold); // a reload resets the page, so tell it again // timers check `win` and stop touching a destroyed window
}

ipcMain.handle('settings', () => settings);
// Click-through: the window is mostly transparent, so it only takes the mouse when the cursor is over the pet
// or its speech bubble. Polled here (not on mousemove) because a walking pet slides under a still cursor.
let hitRects = [], grabbing = false, ignoring = null;
ipcMain.on('hit-rects', (_e, rects, isGrabbing) => { hitRects = rects; grabbing = isGrabbing; });
setInterval(() => {
  if (!win) return;
  const c = screen.getCursorScreenPoint(), b = win.getBounds();
  const x = c.x - b.x, y = c.y - b.y;
  const over = grabbing || hitRects.some((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
  if (over === !ignoring && ignoring !== null) return;
  ignoring = !over;
  win.setIgnoreMouseEvents(ignoring, { forward: true });
}, 50);
ipcMain.handle('model', (_e, type) => {
  if (settings.customModel && fs.existsSync(userFile('pet-model.glb'))) return fs.readFileSync(userFile('pet-model.glb'));
  if (!PET_TYPES.includes(type)) throw new Error(`unknown pet type ${type}`);
  return fs.readFileSync(path.join(__dirname, 'models', `${type}.glb`));
});

// ---------- stay still while you're using its menu, a dialog, or editing settings ----------
let holds = 0, editingSettings = false;
const sendHold = () => win?.webContents.send('hold', holds > 0 || editingSettings);
async function holdWhile(fn) {
  holds++; sendHold();
  try { return await fn(); } finally { holds--; sendHold(); }
}
const ask = (opts) => holdWhile(() => dialog.showMessageBox(win, opts));
function editSettings() {
  editingSettings = true; // cleared by Reload settings (saveSettings)
  sendHold();
  shell.openPath(userFile('settings.json'));
}

// ---------- v2: your exact pet in 3D (Tripo3D) ----------
let making3D = false;
async function makeExactPet() {
  if (making3D) return say('Still working on your 3D twin, hang on!');
  if (!settings.tripoApiKey) {
    const { response } = await ask({
      type: 'info', buttons: ['Open settings', 'Cancel'],
      message: 'A Tripo3D API key is needed',
      detail: 'Create one at platform.tripo3d.ai, then paste it into "tripoApiKey" in settings and choose Reload settings.'
    });
    if (response === 0) editSettings();
    return;
  }
  const { response } = await ask({
    type: 'question', buttons: ['Make it', 'Cancel'], defaultId: 0, cancelId: 1,
    message: 'Turn your photo into a 3D pet?',
    detail: 'Your cut-out photo is sent to Tripo3D. It uses about 65 Tripo credits (roughly $0.65) and takes a few minutes. Four-legged animals get a walk animation; running and jumping are done by Furbaby.'
  });
  if (response !== 0) return;

  making3D = true;
  try {
    await makePet3D({
      apiKey: settings.tripoApiKey,
      photoPath: userFile('pet-photo.png'),
      outPath: userFile('pet-model.glb'),
      onProgress: say
    });
    notify('Ta-da! This is the real me now 🎉');
    saveSettings({ customModel: true, modelTurn: 0 });
  } catch (err) {
    console.error(err);
    notify(`Couldn't make the 3D model: ${err.message}`);
  } finally {
    making3D = false;
  }
}

// ---------- reacting to you: doze off while you're away, perk up when you're back ----------
let away = false;
setInterval(() => {
  const idle = powerMonitor.getSystemIdleTime(); // seconds since your last keyboard/mouse input
  if (!away && idle > 300) { away = true; win?.webContents.send('trick', 'away'); }
  if (away && idle < 5) { away = false; win?.webContents.send('trick', 'back'); }
}, 5000);
ipcMain.on('move-by', (_e, dx, dy) => {
  const [x, y] = win.getPosition();
  // pointer deltas can be fractional on Retina screens; setPosition only takes integers
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

// The renderer decides what the pet does; this just slides the window and turns it round at screen edges.
let motion = { speed: 0, dir: 1 };
ipcMain.on('motion', (_e, speed, dir) => { motion = { speed, dir }; });
setInterval(() => {
  if (!win || !motion.speed) return;
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  let x = b.x + motion.speed * motion.dir;
  if (x < area.x || x + b.width > area.x + area.width) {
    motion.dir *= -1;
    x = Math.min(Math.max(x, area.x), area.x + area.width - b.width);
    win.webContents.send('turn', motion.dir);
  }
  win.setPosition(Math.round(x), b.y);
}, 16);

ipcMain.on('menu', () => {
  holds++; sendHold();
  const trick = (t) => () => win.webContents.send('trick', t);
  Menu.buildFromTemplate([
    { label: 'Sit', click: trick('sit') },
    { label: 'High five', click: trick('highfive') },
    { label: 'Jump', click: trick('jump') },
    { label: 'Run', click: trick('run') },
    { label: 'Nap / wake up', click: trick('sleep') },
    { label: 'Chat…', click: trick('chat') },
    { type: 'separator' },
    { label: 'Walk around', type: 'checkbox', checked: settings.walk, click: () => saveSettings({ walk: !settings.walk }) },
    {
      label: 'Pet type',
      submenu: PET_TYPES.map((type) => ({
        label: type[0].toUpperCase() + type.slice(1), type: 'radio', checked: settings.type === type,
        click: () => saveSettings({ type })
      }))
    },
    {
      label: 'Size',
      submenu: [['Small', 120], ['Medium', 200], ['Large', 300], ['Huge', 420]].map(([label, size]) => ({
        label, type: 'radio', checked: settings.size === size, click: () => saveSettings({ size })
      }))
    },
    { label: settings.name ? `Rename ${settings.name}…` : 'Name your pet…', click: trick('rename') },
    { label: 'Choose pet photo…', click: choosePhoto },
    { label: 'Make my exact pet in 3D…', enabled: !!settings.photo, click: makeExactPet },
    { label: 'Use standard 3D model', visible: settings.customModel, click: () => saveSettings({ customModel: false }) },
    {
      label: 'Turn around', visible: settings.customModel,
      click: () => saveSettings({ modelTurn: (settings.modelTurn + 180) % 360 })
    },
    { label: 'Remove photo', visible: !!settings.photo, click: () => saveSettings({ photo: '', customModel: false }) },
    { label: 'Edit settings…', click: editSettings },
    { label: 'Reload settings', click: () => saveSettings({}) },
    { label: 'Quit', click: () => app.quit() }
  ]).popup({ window: win, callback: () => { holds--; sendHold(); } });
});

async function choosePhoto() {
  const { canceled, filePaths } = await holdWhile(() => dialog.showOpenDialog(win, {
    title: 'Choose a photo of your pet (a PNG with the background removed looks best)',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    properties: ['openFile']
  }));
  if (!canceled) setPhoto(filePaths[0]);
}

// Cuts the pet out of its background (runs locally, ~5s) and trims the empty edges.
async function setPhoto(src) {
  say('Hold still… cutting out the background ✂️');
  let png;
  try {
    const { removeBackground } = require('@imgly/background-removal-node'); // heavy, load on first use
    // Point it at its own model files; otherwise it looks relative to the cwd, which breaks in the packaged app.
    const dist = path.dirname(require.resolve('@imgly/background-removal-node')).replace('app.asar', 'app.asar.unpacked');
    const blob = await removeBackground(pathToFileURL(src).href, { publicPath: `${pathToFileURL(dist).href}/` });
    png = await require('sharp')(Buffer.from(await blob.arrayBuffer())).trim().png().toBuffer();
  } catch (err) {
    console.error('background removal failed, using the photo as-is:', err);
    png = await require('sharp')(src).png().toBuffer();
  }
  const dest = userFile('pet-photo.png');
  fs.writeFileSync(dest, png);
  saveSettings({ photo: pathToFileURL(dest).href });
}
ipcMain.on('photo', (_e, file) => setPhoto(file));
ipcMain.on('rename', (_e, name) => name.trim() && saveSettings({ name: name.trim().slice(0, 30) }));

function saveSettings(patch) {
  // re-read the file first so hand edits made via "Edit settings…" aren't overwritten
  writeJson(userFile('settings.json'), { ...readJson(userFile('settings.json'), DEFAULTS), ...patch });
  editingSettings = false;
  loadSettings();
  // resize keeping the pet's bottom-right corner where it is
  const b = win.getBounds(), { width, height } = winSize();
  win.setBounds({ x: b.x + b.width - width, y: b.y + b.height - height, width, height });
  win.reload();
}

// ---------- break reminders ----------
const BREAKS = [
  'Stretch time! Roll your shoulders and stand up for a bit.',
  'Have a sip of water 💧',
  'Look away from the screen and take three slow breaths.'
];
let breakTimer, breakIdx = 0;
function startBreaks() {
  clearInterval(breakTimer);
  if (settings.breakMinutes > 0) {
    breakTimer = setInterval(() => notify(BREAKS[breakIdx++ % BREAKS.length]), settings.breakMinutes * 60_000);
  }
}

// ---------- chat ----------
const TOOLS = [
  {
    name: 'set_reminder',
    description: 'Remind the user about something after a number of minutes. Use when the user asks to be reminded.',
    input_schema: {
      type: 'object',
      properties: { minutes: { type: 'number' }, text: { type: 'string' } },
      required: ['minutes', 'text'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'remember',
    description: 'Save a lasting fact about the user (name, preferences, important dates) so you know it in future chats.',
    input_schema: {
      type: 'object',
      properties: { fact: { type: 'string' } },
      required: ['fact'],
      additionalProperties: false
    },
    strict: true
  }
];

function runTool({ name, input }) {
  if (name === 'set_reminder') {
    // ponytail: reminders live in memory only and are lost on quit; persist them if that matters
    setTimeout(() => notify(`⏰ ${input.text}`), Math.max(0, input.minutes) * 60_000);
    return `Reminder set for ${input.minutes} min from now.`;
  }
  if (name === 'remember') {
    memory.facts.push(input.fact);
    writeJson(userFile('memory.json'), memory);
    return 'Saved.';
  }
  return `Unknown tool ${name}`;
}

function systemPrompt() {
  // Built once per session so the history stays a valid, cacheable prefix.
  const facts = memory.facts.length ? memory.facts.map((f) => `- ${f}`).join('\n') : '(nothing yet)';
  return `You are ${settings.name || 'an unnamed pet (if it comes up, ask the user to name you via right-click → Name your pet)'}, a small, warm, playful pet who lives on the user's desktop.
Reply in 1-3 short sentences, friendly and a little cheeky. You can set reminders and remember facts with your tools.
Things you remember about the user:
${facts}`;
}
let system;

ipcMain.handle('chat', async (_e, text) => {
  client ??= new Anthropic(settings.apiKey ? { apiKey: settings.apiKey } : {});
  if (!system || history.length > 60) { history = []; system = systemPrompt(); } // ponytail: fresh session instead of trimming

  history.push({ role: 'user', content: text });
  try {
    for (let i = 0; i < 5; i++) {
      const res = await client.beta.messages.create({
        model: settings.model,
        max_tokens: 4000,
        system,
        tools: TOOLS,
        messages: history,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      });
      history.push({ role: 'assistant', content: res.content });

      if (res.stop_reason === 'refusal') return "Hmm, I can't help with that one.";
      if (res.stop_reason !== 'tool_use') {
        return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || '…';
      }
      const results = res.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: runTool(b) }));
      history.push({ role: 'user', content: results });
    }
    return 'I got a bit lost there, ask me again?';
  } catch (err) {
    history = []; system = null; // drop the broken turn
    if (err instanceof Anthropic.AuthenticationError) return 'I need an API key. Right-click me → Edit settings…';
    if (err instanceof Anthropic.RateLimitError) return "I'm out of breath, try again in a minute.";
    return `Something went wrong: ${err.message}`;
  }
});

// ---------- startup ----------
function loadSettings() {
  settings = readJson(userFile('settings.json'), DEFAULTS);
  writeJson(userFile('settings.json'), settings); // makes the file exist so it can be edited
  client = null;
  system = null;
  startBreaks();
}

// One pet at a time: a second launch just exits.
if (!app.requestSingleInstanceLock()) app.exit(0);

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  memory = readJson(userFile('memory.json'), { facts: [] });
  loadSettings();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
