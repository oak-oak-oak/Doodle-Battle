// Doodle Battle — PartyKit server
// One Party (Cloudflare Durable Object) per room. The room ID is the 4-char code.

const NORMAL_ROUND_SECONDS = 120;
const SPEEDRUN_ROUND_SECONDS = 30;
const VOTE_SECONDS = 45;
const PROMPT_SUBMIT_SECONDS = 30;
const PROMPT_VOTE_SECONDS = 15;
const JUDGE_ANNOUNCE_SECONDS = 3;
const SABOTAGE_SECONDS = 6;

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
function isSpeedrunRound(round) { return round > 0 && round % 3 === 0; }

function makePlayer(id, name) {
  return {
    id,
    name: (name || 'Player').slice(0, 20),
    score: 0, streak: 0, connected: true,
    sabotageToken: true,
    comebackToken: false,
    usedComebackThisRound: false,
    _sabotageStartedAt: null,
    _sabotageTarget: null,
  };
}

export default class DoodleRoom {
  constructor(party) {
    this.party = party;
    this.code = party.id;

    this.phase = 'lobby';
    this.players = new Map();
    this.hostId = null;
    this.round = 0;
    this.endsAt = null;
    this.timer = null;

    this.prompt = null;
    this.promptSubmissions = new Map();
    this.promptOptions = null;
    this.promptVoteMap = new Map();

    this.drawings = new Map();
    this.votes = new Map();
    this.drawingStartedAt = null;

    this.underdogId = null;
    this.judgeId = null;
    this.prankPlayerId = null;
    this.earlySubmitterId = null;
    this.winnerId = null;
    this.underdogWin = false;
    this.speedBonusAwarded = false;

    this.history = [];

    this.options = {
      blindMode: false,
      judgeMode: true,
      prankBrush: true,
      sabotageEnabled: true,
    };
  }

  // ============== transport helpers ==============

  broadcast(type, payload, exceptId) {
    const msg = JSON.stringify({ type, payload });
    this.party.broadcast(msg, exceptId ? [exceptId] : []);
  }

  sendTo(connId, type, payload) {
    const c = this.party.getConnection(connId);
    if (!c) return;
    c.send(JSON.stringify({ type, payload }));
  }

  emitRoom() {
    this.broadcast('room:update', this.publicRoom());
  }

  clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  // ============== public-room serializer ==============

  publicRoom() {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      isSpeedrun: isSpeedrunRound(this.round),
      options: this.options,
      prompt: ['drawing', 'voting', 'results'].includes(this.phase) ? this.prompt : null,
      promptOptions: this.phase === 'prompt_vote'
        ? this.promptOptions.map(o => o.text) : null,
      promptVotes: this.phase === 'prompt_vote'
        ? [...this.promptVoteMap.values()] : null,
      underdogId: this.underdogId,
      judgeId: this.judgeId,
      earlySubmitterId: this.earlySubmitterId,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected,
        streak: p.streak,
        sabotageToken: p.sabotageToken,
        comebackToken: p.comebackToken,
        hasSubmittedPrompt: this.promptSubmissions.has(p.id),
        hasSubmitted: this.drawings.has(p.id),
        hasVoted: this.votes.has(p.id),
        hasVotedPrompt: this.promptVoteMap.has(p.id),
      })),
      endsAt: this.endsAt,
      drawings: ['voting', 'results'].includes(this.phase) ? this.buildVotingDrawings() : [],
      results: this.phase === 'results' ? this.buildResults() : null,
      history: this.phase === 'highlights' ? this.history : null,
    };
  }

  buildVotingDrawings() {
    const arr = [...this.drawings.entries()].map(([pid, d]) => ({
      id: pid, image: d.image, strokes: d.strokes, submittedAt: d.submittedAt,
    }));
    arr.sort((a, b) => (a.submittedAt || Infinity) - (b.submittedAt || Infinity));
    return arr;
  }

  computeTally() {
    const tally = new Map();
    for (const [voterId, targetId] of this.votes.entries()) {
      const w = (voterId === this.judgeId) ? 2 : 1;
      tally.set(targetId, (tally.get(targetId) || 0) + w);
    }
    return tally;
  }

  buildResults() {
    const tally = this.computeTally();
    const drawingResults = [...this.drawings.keys()].map(pid => {
      const player = this.players.get(pid);
      const d = this.drawings.get(pid);
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
      winnerId: this.winnerId,
      underdogWin: this.underdogWin,
      judgeId: this.judgeId,
      earlySubmitterId: this.earlySubmitterId,
      speedBonusAwarded: this.speedBonusAwarded,
    };
  }

  // ============== game flow ==============

  determineUnderdog() {
    if (this.round === 0) return null;
    const active = [...this.players.values()].filter(p => p.connected);
    if (active.length < 2) return null;
    const min = Math.min(...active.map(p => p.score));
    const max = Math.max(...active.map(p => p.score));
    if (min === max) return null;
    return active.find(p => p.score === min).id;
  }

  startRound() {
    this.round += 1;
    this.underdogId = this.determineUnderdog();
    if (this.underdogId) {
      const u = this.players.get(this.underdogId);
      if (u) u.comebackToken = true;
    }
    const active = [...this.players.values()].filter(p => p.connected);
    this.judgeId = this.options.judgeMode ? (pickRandom(active)?.id || null) : null;
    this.prankPlayerId = this.options.prankBrush ? (pickRandom(active)?.id || null) : null;
    for (const p of this.players.values()) p.usedComebackThisRound = false;

    this.prompt = null;
    this.promptSubmissions = new Map();
    this.promptOptions = null;
    this.promptVoteMap = new Map();
    this.drawings = new Map();
    this.votes = new Map();
    this.winnerId = null;
    this.underdogWin = false;
    this.earlySubmitterId = null;
    this.speedBonusAwarded = false;

    this.beginPromptSubmission();
  }

  beginPromptSubmission() {
    this.phase = 'prompt_submission';
    this.endsAt = Date.now() + PROMPT_SUBMIT_SECONDS * 1000;
    this.clearTimer();
    this.timer = setTimeout(() => this.endPromptSubmission(), PROMPT_SUBMIT_SECONDS * 1000);
    this.emitRoom();
  }

  endPromptSubmission() {
    this.clearTimer();
    const subs = [...this.promptSubmissions.entries()];
    if (subs.length === 0) {
      this.prompt = pickRandom(FALLBACK_PROMPTS);
      return this.startDrawingOrJudgeReveal();
    }
    if (subs.length === 1) {
      this.prompt = subs[0][1];
      return this.startDrawingOrJudgeReveal();
    }
    this.promptOptions = shuffle(subs.map(([id, text]) => ({ id, text })));
    this.phase = 'prompt_vote';
    this.endsAt = Date.now() + PROMPT_VOTE_SECONDS * 1000;
    this.clearTimer();
    this.timer = setTimeout(() => this.endPromptVote(), PROMPT_VOTE_SECONDS * 1000);
    this.emitRoom();
  }

  endPromptVote() {
    this.clearTimer();
    if (!this.promptOptions || this.promptOptions.length === 0) {
      this.prompt = pickRandom(FALLBACK_PROMPTS);
      return this.startDrawingOrJudgeReveal();
    }
    const tally = new Array(this.promptOptions.length).fill(0);
    for (const [voterId, idx] of this.promptVoteMap.entries()) {
      if (idx >= 0 && idx < tally.length) {
        const w = (voterId === this.judgeId) ? 2 : 1;
        tally[idx] += w;
      }
    }
    const topVal = Math.max(...tally);
    const ties = tally.map((v, i) => v === topVal ? i : -1).filter(i => i >= 0);
    const winnerIdx = ties[Math.floor(Math.random() * ties.length)];
    this.prompt = this.promptOptions[winnerIdx].text;
    this.startDrawingOrJudgeReveal();
  }

  startDrawingOrJudgeReveal() {
    if (this.options.judgeMode && this.judgeId) {
      this.phase = 'judge_reveal';
      this.endsAt = Date.now() + JUDGE_ANNOUNCE_SECONDS * 1000;
      this.emitRoom();
      this.clearTimer();
      this.timer = setTimeout(() => this.startDrawingPhase(), JUDGE_ANNOUNCE_SECONDS * 1000);
    } else {
      this.startDrawingPhase();
    }
  }

  startDrawingPhase() {
    this.phase = 'drawing';
    this.drawings = new Map();
    this.votes = new Map();
    this.drawingStartedAt = Date.now();
    const seconds = isSpeedrunRound(this.round) ? SPEEDRUN_ROUND_SECONDS : NORMAL_ROUND_SECONDS;
    this.endsAt = this.drawingStartedAt + seconds * 1000;
    this.clearTimer();
    this.timer = setTimeout(() => this.endDrawingPhase(), seconds * 1000);
    this.emitRoom();
    if (this.prankPlayerId) {
      this.sendTo(this.prankPlayerId, 'prank:active', { round: this.round });
    }
  }

  endDrawingPhase() {
    this.clearTimer();
    for (const p of this.players.values()) {
      if (!this.drawings.has(p.id) && p.connected) {
        this.drawings.set(p.id, { image: '', strokes: [], submittedAt: null });
      }
    }
    if (this.drawings.size < 2) {
      this.phase = 'results';
      this.endsAt = null;
      this.finalizeResults();
      this.archiveRound();
      this.emitRoom();
      return;
    }
    let earliestT = Infinity, earliestId = null;
    for (const [pid, d] of this.drawings.entries()) {
      if (d.submittedAt && d.submittedAt < earliestT) { earliestT = d.submittedAt; earliestId = pid; }
    }
    this.earlySubmitterId = earliestId;

    this.phase = 'voting';
    this.endsAt = Date.now() + VOTE_SECONDS * 1000;
    this.timer = setTimeout(() => this.endVotingPhase(), VOTE_SECONDS * 1000);
    this.emitRoom();
  }

  applyScoresAndStreaks() {
    const tally = this.computeTally();
    for (const [pid, votes] of tally.entries()) {
      const p = this.players.get(pid);
      if (p) p.score += votes;
    }
    if (this.earlySubmitterId) {
      const d = this.drawings.get(this.earlySubmitterId);
      if (d && d.submittedAt) {
        const p = this.players.get(this.earlySubmitterId);
        if (p && d.submittedAt < (this.drawingStartedAt + (this.endsAt - this.drawingStartedAt) * 0.7)) {
          p.score += 1;
          this.speedBonusAwarded = true;
        }
      }
    }
    let topVotes = 0, topPids = [];
    for (const [pid, v] of tally.entries()) {
      if (v > topVotes) { topVotes = v; topPids = [pid]; }
      else if (v === topVotes) topPids.push(pid);
    }
    const winnerId = (topPids.length === 1 && topVotes > 0) ? topPids[0] : null;
    this.winnerId = winnerId;
    this.underdogWin = winnerId && winnerId === this.underdogId;
    for (const p of this.players.values()) {
      if (winnerId && p.id === winnerId) p.streak = (p.streak || 0) + 1;
      else p.streak = 0;
    }
  }

  finalizeResults() { this.applyScoresAndStreaks(); }

  archiveRound() {
    if (!this.winnerId) return;
    const d = this.drawings.get(this.winnerId);
    if (!d) return;
    const winner = this.players.get(this.winnerId);
    this.history.push({
      round: this.round,
      prompt: this.prompt,
      winnerName: winner?.name || 'Unknown',
      image: d.image,
      strokes: d.strokes,
    });
  }

  endVotingPhase() {
    this.clearTimer();
    this.finalizeResults();
    this.archiveRound();
    this.phase = 'results';
    this.endsAt = null;
    this.emitRoom();
  }

  startHighlights() {
    this.phase = 'highlights';
    this.endsAt = null;
    this.clearTimer();
    this.emitRoom();
  }

  // ============== connection lifecycle ==============

  onConnect(conn /* , ctx */) {
    // we don't add to players until 'room:identify' arrives
    conn.send(JSON.stringify({ type: 'connect:ready', payload: { id: conn.id } }));
  }

  onRequest(_req) {
    // health probe — return room status without exposing player data
    return new Response(
      JSON.stringify({ ok: true, room: this.code, phase: this.phase, players: this.players.size }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  onClose(conn) {
    const player = this.players.get(conn.id);
    if (!player) return;
    player.connected = false;

    if (this.hostId === conn.id) {
      const next = [...this.players.values()].find(p => p.connected);
      if (next) this.hostId = next.id;
    }

    const anyConnected = [...this.players.values()].some(p => p.connected);
    if (!anyConnected) {
      this.clearTimer();
      // Let the DO go cold; no need to preserve state.
      return;
    }
    this.emitRoom();
  }

  // ============== message dispatch ==============

  onMessage(message, conn) {
    let data;
    try { data = JSON.parse(message); } catch { return; }
    const { type, payload } = data;
    const sid = conn.id;

    switch (type) {
      case 'room:identify':
        return this.onIdentify(sid, payload?.name);
      case 'room:options':
        return this.onOptions(sid, payload?.options);
      case 'game:start':
        return this.onGameStart(sid);
      case 'game:nextRound':
        return this.onNextRound(sid);
      case 'game:endSession':
        return this.onEndSession(sid);
      case 'prompt:submit':
        return this.onPromptSubmit(sid, payload?.text);
      case 'prompt:vote':
        return this.onPromptVote(sid, payload?.index);
      case 'comeback:use':
        return this.onComeback(sid);
      case 'draw:stroke':
        return this.onDrawStroke(sid, payload);
      case 'draw:clear':
        return this.onDrawClear(sid);
      case 'sabotage:stroke':
        return this.onSabotageStroke(sid, payload);
      case 'sabotage:end':
        return this.onSabotageEnd(sid);
      case 'draw:submit':
        return this.onDrawSubmit(sid, payload);
      case 'vote:cast':
        return this.onVoteCast(sid, payload?.targetId);
      case 'reaction:send':
        return this.onReaction(sid, payload?.emoji);
      case 'room:leave':
        return this.handleLeave(sid);
    }
  }

  // ============== handlers ==============

  onIdentify(id, name) {
    if (this.players.has(id)) return;
    if (this.players.size >= 12) {
      this.sendTo(id, 'room:error', { error: 'Room full' });
      this.party.getConnection(id)?.close();
      return;
    }
    if (!this.hostId) this.hostId = id;
    this.players.set(id, makePlayer(id, name));
    this.sendTo(id, 'room:joined', { playerId: id, code: this.code });
    this.emitRoom();
  }

  onOptions(sid, options) {
    if (this.hostId !== sid || this.phase !== 'lobby') return;
    const allow = ['blindMode', 'judgeMode', 'prankBrush', 'sabotageEnabled'];
    for (const k of allow) {
      if (typeof options?.[k] === 'boolean') this.options[k] = options[k];
    }
    this.emitRoom();
  }

  onGameStart(sid) {
    if (this.hostId !== sid) return;
    if (!['lobby', 'results', 'highlights'].includes(this.phase)) return;
    if (this.players.size < 1) return;
    if (this.phase === 'highlights') {
      this.history = [];
      for (const p of this.players.values()) {
        p.score = 0; p.streak = 0; p.sabotageToken = true; p.comebackToken = false;
      }
      this.round = 0;
    }
    this.startRound();
  }

  onNextRound(sid) {
    if (this.hostId !== sid || this.phase !== 'results') return;
    this.startRound();
  }

  onEndSession(sid) {
    if (this.hostId !== sid) return;
    if (!['results', 'lobby'].includes(this.phase)) return;
    if (this.history.length === 0) return;
    this.startHighlights();
  }

  onPromptSubmit(sid, text) {
    if (this.phase !== 'prompt_submission') return;
    if (typeof text !== 'string') return;
    const cleaned = text.trim().slice(0, 80);
    if (!cleaned) return;
    this.promptSubmissions.set(sid, cleaned);
    this.emitRoom();
    const active = [...this.players.values()].filter(p => p.connected);
    if (active.every(p => this.promptSubmissions.has(p.id))) {
      this.endPromptSubmission();
    }
  }

  onPromptVote(sid, index) {
    if (this.phase !== 'prompt_vote') return;
    if (typeof index !== 'number') return;
    if (!this.promptOptions || index < 0 || index >= this.promptOptions.length) return;
    this.promptVoteMap.set(sid, index);
    this.emitRoom();
    const active = [...this.players.values()].filter(p => p.connected);
    if (active.every(p => this.promptVoteMap.has(p.id))) this.endPromptVote();
  }

  onComeback(sid) {
    const p = this.players.get(sid);
    if (!p || !p.comebackToken || p.id !== this.underdogId) return;
    if (this.phase === 'prompt_submission') {
      const myPrompt = this.promptSubmissions.get(sid);
      if (!myPrompt) return;
      p.comebackToken = false;
      p.usedComebackThisRound = true;
      this.broadcast('toast', { kind: 'comeback', name: p.name });
      this.prompt = myPrompt;
      this.startDrawingOrJudgeReveal();
    } else if (this.phase === 'prompt_vote') {
      const myIdx = this.promptOptions.findIndex(o => o.id === sid);
      if (myIdx < 0) return;
      p.comebackToken = false;
      p.usedComebackThisRound = true;
      this.broadcast('toast', { kind: 'comeback', name: p.name });
      this.prompt = this.promptOptions[myIdx].text;
      this.startDrawingOrJudgeReveal();
    }
  }

  onDrawStroke(sid, stroke) {
    if (this.phase !== 'drawing') return;
    this.broadcast('draw:stroke', { playerId: sid, stroke }, sid);
  }

  onDrawClear(sid) {
    if (this.phase !== 'drawing') return;
    this.broadcast('draw:clear', { playerId: sid }, sid);
  }

  onSabotageStroke(sid, payload) {
    if (this.phase !== 'drawing') return;
    if (!this.options.sabotageEnabled) return;
    const sender = this.players.get(sid);
    if (!sender || !sender.sabotageToken) return;
    const targetId = payload?.targetId;
    const stroke = payload?.stroke;
    if (!this.players.has(targetId) || targetId === sid) return;
    if (!sender._sabotageStartedAt) {
      sender._sabotageStartedAt = Date.now();
      sender._sabotageTarget = targetId;
      setTimeout(() => {
        const s = this.players.get(sid);
        if (s) { s._sabotageStartedAt = null; s._sabotageTarget = null; }
      }, SABOTAGE_SECONDS * 1000);
    }
    if (Date.now() - sender._sabotageStartedAt > SABOTAGE_SECONDS * 1000) {
      sender.sabotageToken = false;
      sender._sabotageStartedAt = null;
      this.emitRoom();
      return;
    }
    if (sender._sabotageTarget !== targetId) return;
    this.sendTo(targetId, 'sabotage:incoming', { from: sender.name, stroke });
  }

  onSabotageEnd(sid) {
    const sender = this.players.get(sid);
    if (!sender) return;
    sender.sabotageToken = false;
    sender._sabotageStartedAt = null;
    sender._sabotageTarget = null;
    this.emitRoom();
  }

  onDrawSubmit(sid, payload) {
    if (this.phase !== 'drawing') return;
    const { image, strokes } = payload || {};
    if (typeof image !== 'string' || image.length > 3_000_000) return;
    const cleanStrokes = Array.isArray(strokes) ? strokes.slice(0, 50000) : [];
    this.drawings.set(sid, { image, strokes: cleanStrokes, submittedAt: Date.now() });
    this.emitRoom();
    const active = [...this.players.values()].filter(p => p.connected);
    if (active.every(p => this.drawings.has(p.id))) this.endDrawingPhase();
  }

  onVoteCast(sid, targetId) {
    if (this.phase !== 'voting') return;
    if (targetId === sid) return;
    if (!this.drawings.has(targetId)) return;
    this.votes.set(sid, targetId);
    this.broadcast('vote:ding', { voterId: sid });
    this.emitRoom();
    const active = [...this.players.values()].filter(p => p.connected);
    if (active.every(p => this.votes.has(p.id))) this.endVotingPhase();
  }

  onReaction(sid, emoji) {
    if (this.phase !== 'voting') return;
    if (typeof emoji !== 'string' || emoji.length > 8) return;
    const allowed = ['😂', '🔥', '👏', '💀', '🎨'];
    if (!allowed.includes(emoji)) return;
    this.broadcast('reaction', { playerId: sid, emoji, t: Date.now() });
  }

  handleLeave(sid) {
    const c = this.party.getConnection(sid);
    if (c) c.close();
    // onClose will run the cleanup
  }
}
