# Doodle Battle

[![play](https://img.shields.io/badge/play-doodle--battle-b14a33)](https://github.com/oak-oak-oak/Doodle-Battle)

A multiplayer drawing party game. Each round, every player writes a prompt — then the room votes on which one to draw. Two minutes on the canvas (30 seconds on speedrun rounds), then anonymous voting, then results.

## Stack

- **Server:** [PartyKit](https://partykit.io) (Cloudflare Durable Objects). One Party = one room.
- **Client:** React + Vite + HTML5 Canvas.
- **Transport:** WebSockets via [`partysocket`](https://github.com/partykit/partykit/tree/main/packages/partysocket).

## Quick start

```bash
git clone https://github.com/oak-oak-oak/Doodle-Battle
cd Doodle-Battle
npm install              # installs root dev deps (concurrently)
npm run install:all      # installs server + client
npm run dev              # PartyKit on :1999, Vite on :5173
```

Open `http://localhost:5173` in a few browser windows. Or join from your phone on LAN — copy `client/.env.example` to `client/.env` and set `VITE_PARTYKIT_HOST` to your machine's IP.

## Round flow

1. **Pitch** (30s) — every player types a prompt
2. **Vote** (15s) — the room sees the anonymous list and picks one
3. **Draw** (2 min; 30s on every 3rd round — speedrun)
4. **Judge** (45s) — anonymous gallery, vote for your favorite (not your own)
5. **Results** — leaderboard, streaks, and a new round

## Features

- Brush, line, eraser, emoji stamp tools with smoothed strokes and velocity-based width
- **Speedrun rounds** every 3rd — 30-second timer with a breaking-news banner
- **Judge mode** — random player's vote counts double; dramatic announcement
- **Prank brush** — one unlucky player gets a wobbly cursor each round; they don't know
- **Sabotage tokens** — once per game, draw a scribble live on someone else's canvas
- **Comeback token** — last-place player gets one; forces their pitched prompt to win
- **Blind mode** — your canvas is blurred while you draw, revealed at voting
- **Reactions** during voting (😂 🔥 👏 💀 🎨)
- **Streak alerts** — win 3 in a row and the whole room gets a "stop them" toast
- **Post-game highlight reel** — replays of each round's winning drawing

## Deploy

**Server (PartyKit / Cloudflare):**

```bash
cd server
npx partykit deploy
```

Free tier, hard-capped (no automatic billing). First run prompts a one-time PartyKit / Cloudflare login. Outputs a URL like `https://doodle-battle.<your-user>.partykit.dev`.

**Client (Vercel):**

In Vercel dashboard, import the GitHub repo and set:
- **Root Directory:** `client`
- **Environment variable:** `VITE_PARTYKIT_HOST` = the host from the PartyKit deploy (no `https://`, no port — e.g. `doodle-battle.you.partykit.dev`)

Vercel will auto-detect Vite and build.

## Project layout

```
server/
  party.js          PartyKit Party class — game logic per room
  partykit.json     PartyKit project config
client/
  src/              React app
```

## License

MIT
