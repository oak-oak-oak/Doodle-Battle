import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
// CLIENT_ORIGIN can be a single origin or a comma-separated list (dev + prod URLs)
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const corsOrigin = CLIENT_ORIGINS.length === 1 ? CLIENT_ORIGINS[0] : CLIENT_ORIGINS;

const NORMAL_ROUND_SECONDS = 120;
const SPEEDRUN_ROUND_SECONDS = 30;
const VOTE_SECONDS = 45;
const PROMPT_SUBMIT_SECONDS = 30;
const PROMPT_VOTE_SECONDS = 15;
const JUDGE_ANNOUNCE_SECONDS = 3;
const SABOTAGE_SECONDS = 6;

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin },
  maxHttpBufferSize: 5_000_000,
});

// Used only when no players submit anything in time.
const FALLBACK_PROMPTS = [
  'a cat riding a skateboard',
  'a robot at a job interview',
  'a haunted teapot',
  'a dragon trying to file taxes',
  'a goose at the opera',
  'a vampire dentist',
  'a banana running a marathon',
  'a sentient pizza slice',
];

function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }
function pickRandom(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }

const rooms = new Map();

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function makePlayer(id, name) {
  return {
    id,
    name: (name || 'Player').slice(0, 20),
    score: 0, streak: 0, connected: true,
    sabotageToken: true,
    comebackToken: false,
    usedComebackThisRound: false,
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    isSpeedrun: isSpeedrunRound(room.round),
    options: room.options,
    prompt: ['drawing', 'voting', 'results'].includes(room.phase) ? room.prompt : null,
    promptOptions: room.phase === 'prompt_vote'
      ? room.promptOptions.map(o => o.text)
      : null,
    promptVotes: room.phase === 'prompt_vote'
      ? [...room.promptVoteMap.values()]
      : null,
    underdogId: room.underdogId,
    judgeId: room.judgeId,
    earlySubmitterId: room.earlySubmitterId,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected,
      streak: p.streak,
      sabotageToken: p.sabotageToken,
      comebackToken: p.comebackToken,
      hasSubmittedPrompt: room.promptSubmissions.has(p.id),
      hasSubmitted: room.drawings.has(p.id),
      hasVoted: room.votes.has(p.id),
      hasVotedPrompt: room.promptVoteMap.has(p.id),
    })),
    endsAt: room.endsAt,
    drawings: ['voting', 'results'].includes(room.phase) ? buildVotingDrawings(room) : [],
    results: room.phase === 'results' ? buildResults(room) : null,
    history: room.phase === 'highlights' ? room.history : null,
  };
}

function buildVotingDrawings(room) {
  const arr = [...room.drawings.entries()].map(([pid, d]) => ({
    id: pid, image: d.image, strokes: d.strokes, submittedAt: d.submittedAt,
  }));
  arr.sort((a, b) => (a.submittedAt || Infinity) - (b.submittedAt || Infinity));
  return arr;
}

function isSpeedrunRound(round) { return round > 0 && round % 3 === 0; }

function buildResults(room) {
  const tally = computeTally(room);
  const drawingResults = [...room.drawings.keys()].map(pid => {
    const player = room.players.get(pid);
    const d = room.drawings.get(pid);
    return {
      id: pid,
      name: player?.name || 'Unknown',
      votes: tally.get(pid) || 0,
      image: d.image,
      strokes: d.strokes,
    };
  }).sort((a, b) => b.votes - a.votes);
  return {
    drawings: drawingResults,
    winnerId: room.winnerId,
    underdogWin: room.underdogWin,
    judgeId: room.judgeId,
    earlySubmitterId: room.earlySubmitterId,
    speedBonusAwarded: room.speedBonusAwarded,
  };
}

function computeTally(room) {
  const tally = new Map();
  for (const [voterId, targetId] of room.votes.entries()) {
    const weight = (voterId === room.judgeId) ? 2 : 1;
    tally.set(targetId, (tally.get(targetId) || 0) + weight);
  }
  return tally;
}

function emitRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('room:update', publicRoom(room));
}

function clearRoomTimer(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
}

function determineUnderdog(room) {
  if (room.round === 0) return null;
  const active = [...room.players.values()].filter(p => p.connected);
  if (active.length < 2) return null;
  const minScore = Math.min(...active.map(p => p.score));
  const maxScore = Math.max(...active.map(p => p.score));
  if (minScore === maxScore) return null;
  const lasts = active.filter(p => p.score === minScore);
  return lasts[0].id;
}

function startRound(room) {
  room.round += 1;
  room.underdogId = determineUnderdog(room);
  if (room.underdogId) {
    const u = room.players.get(room.underdogId);
    if (u) u.comebackToken = true;
  }
  if (room.options.judgeMode) {
    const active = [...room.players.values()].filter(p => p.connected);
    room.judgeId = pickRandom(active)?.id || null;
  } else {
    room.judgeId = null;
  }
  if (room.options.prankBrush) {
    const active = [...room.players.values()].filter(p => p.connected);
    room.prankPlayerId = pickRandom(active)?.id || null;
  } else {
    room.prankPlayerId = null;
  }
  for (const p of room.players.values()) p.usedComebackThisRound = false;

  room.prompt = null;
  room.promptSubmissions = new Map();
  room.promptOptions = null;
  room.promptVoteMap = new Map();
  room.drawings = new Map();
  room.votes = new Map();
  room.winnerId = null;
  room.underdogWin = false;
  room.earlySubmitterId = null;
  room.speedBonusAwarded = false;

  beginPromptSubmission(room);
}

function beginPromptSubmission(room) {
  room.phase = 'prompt_submission';
  room.endsAt = Date.now() + PROMPT_SUBMIT_SECONDS * 1000;
  clearRoomTimer(room);
  room.timer = setTimeout(() => endPromptSubmission(room), PROMPT_SUBMIT_SECONDS * 1000);
  emitRoom(room.code);
}

function endPromptSubmission(room) {
  clearRoomTimer(room);
  const subs = [...room.promptSubmissions.entries()];
  if (subs.length === 0) {
    room.prompt = pickRandom(FALLBACK_PROMPTS);
    return startDrawingOrJudgeReveal(room);
  }
  if (subs.length === 1) {
    room.prompt = subs[0][1];
    return startDrawingOrJudgeReveal(room);
  }
  // shuffle the submissions; UI uses indices for voting
  room.promptOptions = shuffle(subs.map(([id, text]) => ({ id, text })));
  room.phase = 'prompt_vote';
  room.endsAt = Date.now() + PROMPT_VOTE_SECONDS * 1000;
  clearRoomTimer(room);
  room.timer = setTimeout(() => endPromptVote(room), PROMPT_VOTE_SECONDS * 1000);
  emitRoom(room.code);
}

function endPromptVote(room) {
  clearRoomTimer(room);
  if (!room.promptOptions || room.promptOptions.length === 0) {
    room.prompt = pickRandom(FALLBACK_PROMPTS);
    return startDrawingOrJudgeReveal(room);
  }
  const tally = new Array(room.promptOptions.length).fill(0);
  for (const [voterId, idx] of room.promptVoteMap.entries()) {
    if (idx >= 0 && idx < tally.length) {
      const w = (voterId === room.judgeId) ? 2 : 1;
      tally[idx] += w;
    }
  }
  const topVal = Math.max(...tally);
  const ties = tally.map((v, i) => v === topVal ? i : -1).filter(i => i >= 0);
  const winnerIdx = ties[Math.floor(Math.random() * ties.length)];
  room.prompt = room.promptOptions[winnerIdx].text;
  startDrawingOrJudgeReveal(room);
}

function startDrawingOrJudgeReveal(room) {
  if (room.options.judgeMode && room.judgeId) {
    room.phase = 'judge_reveal';
    room.endsAt = Date.now() + JUDGE_ANNOUNCE_SECONDS * 1000;
    emitRoom(room.code);
    clearRoomTimer(room);
    room.timer = setTimeout(() => startDrawingPhase(room), JUDGE_ANNOUNCE_SECONDS * 1000);
  } else {
    startDrawingPhase(room);
  }
}

function startDrawingPhase(room) {
  room.phase = 'drawing';
  room.drawings = new Map();
  room.votes = new Map();
  room.drawingStartedAt = Date.now();
  const seconds = isSpeedrunRound(room.round) ? SPEEDRUN_ROUND_SECONDS : NORMAL_ROUND_SECONDS;
  room.endsAt = room.drawingStartedAt + seconds * 1000;
  clearRoomTimer(room);
  room.timer = setTimeout(() => endDrawingPhase(room), seconds * 1000);
  emitRoom(room.code);
  if (room.prankPlayerId) {
    io.to(room.prankPlayerId).emit('prank:active', { round: room.round });
  }
}

function endDrawingPhase(room) {
  clearRoomTimer(room);
  for (const p of room.players.values()) {
    if (!room.drawings.has(p.id) && p.connected) {
      room.drawings.set(p.id, { image: '', strokes: [], submittedAt: null });
    }
  }
  if (room.drawings.size < 2) {
    room.phase = 'results';
    room.endsAt = null;
    finalizeResults(room);
    archiveRound(room);
    emitRoom(room.code);
    return;
  }
  let earliestT = Infinity, earliestId = null;
  for (const [pid, d] of room.drawings.entries()) {
    if (d.submittedAt && d.submittedAt < earliestT) { earliestT = d.submittedAt; earliestId = pid; }
  }
  room.earlySubmitterId = earliestId;

  room.phase = 'voting';
  room.endsAt = Date.now() + VOTE_SECONDS * 1000;
  room.timer = setTimeout(() => endVotingPhase(room), VOTE_SECONDS * 1000);
  emitRoom(room.code);
}

function applyScoresAndStreaks(room) {
  const tally = computeTally(room);
  for (const [pid, votes] of tally.entries()) {
    const p = room.players.get(pid);
    if (p) p.score += votes;
  }
  if (room.earlySubmitterId) {
    const drawingEntry = room.drawings.get(room.earlySubmitterId);
    if (drawingEntry && drawingEntry.submittedAt) {
      const p = room.players.get(room.earlySubmitterId);
      if (p && drawingEntry.submittedAt < (room.drawingStartedAt + (room.endsAt - room.drawingStartedAt) * 0.7)) {
        p.score += 1;
        room.speedBonusAwarded = true;
      }
    }
  }
  let topVotes = 0, topPids = [];
  for (const [pid, v] of tally.entries()) {
    if (v > topVotes) { topVotes = v; topPids = [pid]; }
    else if (v === topVotes) topPids.push(pid);
  }
  const winnerId = (topPids.length === 1 && topVotes > 0) ? topPids[0] : null;
  room.winnerId = winnerId;
  room.underdogWin = winnerId && winnerId === room.underdogId;
  for (const p of room.players.values()) {
    if (winnerId && p.id === winnerId) p.streak = (p.streak || 0) + 1;
    else p.streak = 0;
  }
}

function finalizeResults(room) { applyScoresAndStreaks(room); }

function archiveRound(room) {
  if (!room.winnerId) return;
  const d = room.drawings.get(room.winnerId);
  if (!d) return;
  const winner = room.players.get(room.winnerId);
  room.history.push({
    round: room.round,
    prompt: room.prompt,
    winnerName: winner?.name || 'Unknown',
    image: d.image,
    strokes: d.strokes,
  });
}

function endVotingPhase(room) {
  clearRoomTimer(room);
  finalizeResults(room);
  archiveRound(room);
  room.phase = 'results';
  room.endsAt = null;
  emitRoom(room.code);
}

function startHighlights(room) {
  room.phase = 'highlights';
  room.endsAt = null;
  clearRoomTimer(room);
  emitRoom(room.code);
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  socket.on('room:create', ({ name }, cb) => {
    const code = makeRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: new Map(),
      phase: 'lobby',
      prompt: null,
      promptSubmissions: new Map(),
      promptOptions: null,
      promptVoteMap: new Map(),
      drawings: new Map(),
      votes: new Map(),
      round: 0,
      timer: null,
      endsAt: null,
      underdogId: null,
      judgeId: null,
      prankPlayerId: null,
      earlySubmitterId: null,
      winnerId: null,
      underdogWin: false,
      speedBonusAwarded: false,
      drawingStartedAt: null,
      history: [],
      options: {
        blindMode: false,
        judgeMode: true,
        prankBrush: true,
        sabotageEnabled: true,
      },
    };
    room.players.set(socket.id, makePlayer(socket.id, name));
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    cb?.({ ok: true, code, playerId: socket.id });
    emitRoom(code);
  });

  socket.on('room:join', ({ code, name }, cb) => {
    code = (code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    if (room.players.size >= 12) return cb?.({ ok: false, error: 'Room full' });
    room.players.set(socket.id, makePlayer(socket.id, name));
    socket.join(code);
    socket.data.roomCode = code;
    cb?.({ ok: true, code, playerId: socket.id });
    emitRoom(code);
  });

  socket.on('room:options', ({ options }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    const allow = ['blindMode', 'judgeMode', 'prankBrush', 'sabotageEnabled'];
    for (const k of allow) {
      if (typeof options?.[k] === 'boolean') room.options[k] = options[k];
    }
    emitRoom(room.code);
  });

  socket.on('game:start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (!['lobby', 'results', 'highlights'].includes(room.phase)) return;
    if (room.players.size < 1) return;
    if (room.phase === 'highlights') {
      room.history = [];
      for (const p of room.players.values()) {
        p.score = 0; p.streak = 0; p.sabotageToken = true; p.comebackToken = false;
      }
      room.round = 0;
    }
    startRound(room);
  });

  socket.on('game:nextRound', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'results') return;
    startRound(room);
  });

  socket.on('game:endSession', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (!['results', 'lobby'].includes(room.phase)) return;
    if (room.history.length === 0) return;
    startHighlights(room);
  });

  socket.on('prompt:submit', ({ text }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'prompt_submission') return;
    if (typeof text !== 'string') return;
    const cleaned = text.trim().slice(0, 80);
    if (!cleaned) return;
    room.promptSubmissions.set(socket.id, cleaned);
    emitRoom(room.code);
    const active = [...room.players.values()].filter(p => p.connected);
    if (active.every(p => room.promptSubmissions.has(p.id))) {
      endPromptSubmission(room);
    }
  });

  socket.on('prompt:vote', ({ index }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'prompt_vote') return;
    if (typeof index !== 'number') return;
    if (!room.promptOptions || index < 0 || index >= room.promptOptions.length) return;
    room.promptVoteMap.set(socket.id, index);
    emitRoom(room.code);
    const active = [...room.players.values()].filter(p => p.connected);
    if (active.every(p => room.promptVoteMap.has(p.id))) endPromptVote(room);
  });

  socket.on('comeback:use', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || !p.comebackToken || p.id !== room.underdogId) return;
    if (room.phase === 'prompt_submission') {
      const myPrompt = room.promptSubmissions.get(socket.id);
      if (!myPrompt) return; // must submit your own prompt first
      p.comebackToken = false;
      p.usedComebackThisRound = true;
      io.to(room.code).emit('toast', { kind: 'comeback', name: p.name });
      room.prompt = myPrompt;
      startDrawingOrJudgeReveal(room);
    } else if (room.phase === 'prompt_vote') {
      const myIdx = room.promptOptions.findIndex(o => o.id === socket.id);
      if (myIdx < 0) return;
      p.comebackToken = false;
      p.usedComebackThisRound = true;
      io.to(room.code).emit('toast', { kind: 'comeback', name: p.name });
      room.prompt = room.promptOptions[myIdx].text;
      startDrawingOrJudgeReveal(room);
    }
  });

  socket.on('draw:stroke', (stroke) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'drawing') return;
    socket.to(room.code).emit('draw:stroke', { playerId: socket.id, stroke });
  });

  socket.on('draw:clear', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'drawing') return;
    socket.to(room.code).emit('draw:clear', { playerId: socket.id });
  });

  socket.on('sabotage:stroke', ({ targetId, stroke }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'drawing') return;
    if (!room.options.sabotageEnabled) return;
    const sender = room.players.get(socket.id);
    if (!sender || !sender.sabotageToken) return;
    if (!room.players.has(targetId) || targetId === socket.id) return;
    if (!sender._sabotageStartedAt) {
      sender._sabotageStartedAt = Date.now();
      sender._sabotageTarget = targetId;
      setTimeout(() => {
        const s = room.players.get(socket.id);
        if (s) { s._sabotageStartedAt = null; s._sabotageTarget = null; }
      }, SABOTAGE_SECONDS * 1000);
    }
    if (Date.now() - sender._sabotageStartedAt > SABOTAGE_SECONDS * 1000) {
      sender.sabotageToken = false;
      sender._sabotageStartedAt = null;
      emitRoom(room.code);
      return;
    }
    if (sender._sabotageTarget !== targetId) return;
    io.to(targetId).emit('sabotage:incoming', { from: sender.name, stroke });
  });

  socket.on('sabotage:end', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const sender = room.players.get(socket.id);
    if (!sender) return;
    sender.sabotageToken = false;
    sender._sabotageStartedAt = null;
    sender._sabotageTarget = null;
    emitRoom(room.code);
  });

  socket.on('draw:submit', ({ image, strokes }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'drawing') return;
    if (typeof image !== 'string' || image.length > 3_000_000) return;
    const cleanStrokes = Array.isArray(strokes) ? strokes.slice(0, 50000) : [];
    room.drawings.set(socket.id, { image, strokes: cleanStrokes, submittedAt: Date.now() });
    emitRoom(room.code);
    const active = [...room.players.values()].filter(p => p.connected);
    if (active.every(p => room.drawings.has(p.id))) endDrawingPhase(room);
  });

  socket.on('vote:cast', ({ targetId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'voting') return;
    if (targetId === socket.id) return;
    if (!room.drawings.has(targetId)) return;
    room.votes.set(socket.id, targetId);
    io.to(room.code).emit('vote:ding', { voterId: socket.id });
    emitRoom(room.code);
    const active = [...room.players.values()].filter(p => p.connected);
    if (active.every(p => room.votes.has(p.id))) endVotingPhase(room);
  });

  socket.on('reaction:send', ({ emoji }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'voting') return;
    if (typeof emoji !== 'string' || emoji.length > 8) return;
    const allowed = ['😂', '🔥', '👏', '💀', '🎨'];
    if (!allowed.includes(emoji)) return;
    io.to(room.code).emit('reaction', { playerId: socket.id, emoji, t: Date.now() });
  });

  socket.on('room:leave', () => handleLeave(socket));
  socket.on('disconnect', () => handleLeave(socket));
});

function handleLeave(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.get(socket.id);
  if (player) player.connected = false;
  if (room.hostId === socket.id) {
    const next = [...room.players.values()].find(p => p.connected && p.id !== socket.id);
    if (next) room.hostId = next.id;
  }
  const anyConnected = [...room.players.values()].some(p => p.connected);
  if (!anyConnected) {
    clearRoomTimer(room);
    rooms.delete(code);
    return;
  }
  emitRoom(code);
  socket.data.roomCode = null;
}

server.listen(PORT, () => {
  console.log(`doodle server on :${PORT}`);
});
