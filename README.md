# Furbaby

A small AI pet that lives on your desktop (macOS + Windows, Electron).

## Run

Needs Node 22+.

```bash
npm install
npx electron --version   # first run downloads the Electron binary
npm start
```

## Use

- **Drag** to move · **click** to pet · **double-click** to chat · **right-click** for tricks, settings, quit
- Reminds you to stretch / drink water / breathe every `breakMinutes`
- Falls asleep 22:00–07:00 (click to wake)
- Chat can set reminders ("remind me in 20 min to call Sam") and remember facts about you

## Settings

Right-click → *Edit settings…* (then *Reload settings*). Stored in the app's user-data folder
(`~/Library/Application Support/Furbaby/` on macOS, `%APPDATA%\Furbaby\` on Windows).

| Key | Default | |
|---|---|---|
| `name` | `""` | Pet's name (unnamed until you set one) |
| `furColor` | `#f4a259` | Any CSS colour |
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
