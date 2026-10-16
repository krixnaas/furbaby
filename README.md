# Furbaby

A live 3D pet that wanders your desktop (macOS + Windows, Electron + three.js).

## Run locally

### 1. Prerequisites

- **Node.js 22 or newer** (`node -v` to check). Older versions fail on install.
  - macOS with Homebrew: `brew install node`
  - Or with nvm: `nvm install 22 && nvm use 22`
  - Windows: install the LTS from [nodejs.org](https://nodejs.org)
- **git**

### 2. Get the code and install

```bash
git clone https://github.com/krixnaas/furbaby.git
cd furbaby
npm install
npx electron --version   # one-time: downloads the Electron binary (~100 MB)
```

### 3. Start it

```bash
npm start
```

The pet appears at the bottom-right of your screen. There's no Dock/taskbar icon:
**right-click the pet** for everything, including **Quit**. Only one Furbaby runs at a time, so a second
`npm start` does nothing while one is already running.

### 4. Optional: API keys

Furbaby works without any keys. Two features need one; add them via right-click → *Edit settings…*,
then *Reload settings*:

| Feature | Setting | Get a key |
|---|---|---|
| Chatting with your pet | `apiKey` (or the `ANTHROPIC_API_KEY` environment variable) | [console.anthropic.com](https://console.anthropic.com) |
| *Make my exact pet in 3D* | `tripoApiKey` | [platform.tripo3d.ai](https://platform.tripo3d.ai) |

### Troubleshooting

- **`npm start` says Electron failed to install** → run `npx electron --version` once, then `npm start` again.
- **Errors mentioning `import` / syntax on install or start** → your Node is too old; check `node -v` (needs 22+).
  With nvm, the terminal may still be on an old default: `nvm use 22`.
- **The pet seems stuck or you've lost it** → quit it from the terminal with `Ctrl+C` and run `npm start` again.
- **Start fresh** → quit Furbaby and delete its settings folder (see *Settings* below).

## Use

- **Drag** to move · **click** to pet · **double-click** to chat · **right-click** for tricks, settings, quit
- Reminds you to stretch / drink water / breathe every `breakMinutes`
- Wanders, walks, runs, jumps and grazes on its own (right-click → *Walk around* to stop)
- **Your pet:** right-click → *Choose pet photo…* (or drop a photo on it). The background is cut out locally and its colours tint the 3D animal; pick the animal under *Pet type*
- **Your exact pet in 3D (v2):** right-click → *Make my exact pet in 3D…* sends the cut-out photo to [Tripo3D](https://platform.tripo3d.ai), which builds, rigs and animates a 3D model of it (~65 credits ≈ $0.65, a few minutes). Four-legged animals only get a walk animation from Tripo, so running is a faster walk
- Falls asleep 22:00–07:00 and when you've been away 5 minutes; says hi when you're back (click to wake)
- Chat can set reminders ("remind me in 20 min to call Sam") and remember facts about you

## Settings

Right-click → *Edit settings…* (then *Reload settings*). Stored in the app's user-data folder
(`~/Library/Application Support/Furbaby/` on macOS, `%APPDATA%\Furbaby\` on Windows).

| Key | Default | |
|---|---|---|
| `name` | `""` | Pet's name (unnamed until you set one) |
| `type` | `cat` | horse, dog, cat, fox, bird, rabbit |
| `size` | `200` | Pet size in pixels |
| `walk` | `true` | Wander around on its own |
| `tripoApiKey` | `""` | Tripo3D key for *Make my exact pet in 3D* |
| `breakMinutes` | `45` | `0` turns break reminders off |
| `model` | `claude-opus-5-5` | Claude model for chat |
| `apiKey` | `""` | Anthropic API key; empty = use `ANTHROPIC_API_KEY` env var |

Memories are kept in `memory.json` in the same folder.

## Build installers

```bash
npm run dist:mac   # .dmg
npm run dist:win   # .exe installer (most reliable when run on Windows)
```

Unsigned builds: macOS needs right-click → Open the first time; Windows SmartScreen shows "More info → Run anyway".

## Credits

3D animals: see [models/CREDITS.md](models/CREDITS.md). The rabbit is by Sherkiz (CC-BY 3.0); the others are CC0 by Quaternius.
