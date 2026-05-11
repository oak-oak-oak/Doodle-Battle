# Doodle Battle

[![play](https://img.shields.io/badge/play-doodle--battle-b14a33)](https://github.com/oak-oak-oak/Doodle-Battle)

A multiplayer drawing party game. Each round, every player writes a prompt — then the room votes on which one to draw. Two minutes on the canvas (30 seconds on speedrun rounds), then anonymous voting, then results.

No accounts. No API keys. No external services. Just open it in a few browser tabs and play.

## Stack

- **Server:** Node + Express + Socket.io
- **Client:** React + Vite + HTML5 Canvas

## Quick start

```bash
git clone <this-repo>
cd doodle-battle
npm install              # installs root dev deps (concurrently)
npm run install:all      # installs server + client
npm run dev              # starts both
```

Then open `http://localhost:5173` in a few browser windows or on your phone (LAN — replace `localhost` with your machine's IP and set `VITE_SERVER_URL` in `client/.env`).

## Round flow

1. **Pitch** (30s) — every player types a prompt
2. **Vote** (15s) — the room sees the anonymous list and picks one
3. **Draw** (2 minutes; 30 seconds on every 3rd round)
4. **Judge** (45s) — anonymous gallery, vote for your favorite (not your own)
5. **Results** — leaderboard, streaks, and a new round

## Features

- **Brush, eraser, line, emoji stamp** tools with smoothed strokes and velocity-based width
- **Speedrun rounds** every 3rd — 30-second timer with a breaking-news banner
- **Judge mode** — random player's vote counts double; dramatic announcement
- **Prank brush** — one unlucky player gets a wobbly cursor each round; they don't know
- **Sabotage tokens** — once per game, draw a scribble live on someone else's canvas
- **Comeback token** — last-place player gets one; uses their own pitched prompt
- **Blind mode** — your canvas is blurred while you draw, revealed at voting
- **Reactions** during voting (😂 🔥 👏 💀 🎨)
- **Streak alerts** — win 3 in a row and the whole room gets a "stop them" toast
- **Post-game highlight reel** — replays of each round's winning drawing

## Configuration

`server/.env` (optional — defaults shown):

```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

## Project layout

```
server/          Express + Socket.io game server
client/          Vite + React frontend
package.json     Root scripts (concurrently runs server + client)
```

## License

MIT
