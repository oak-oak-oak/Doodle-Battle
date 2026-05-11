import React, { useEffect, useState } from 'react';
import { socket } from '../socket.js';

const OPTION_DEFS = [
  { key: 'blindMode', label: 'blind mode', desc: "you can't see what you're drawing. revealed at voting." },
  { key: 'judgeMode', label: 'judge mode', desc: "a random player's vote counts double. power corrupts." },
  { key: 'prankBrush', label: 'prank brush', desc: "one unlucky player gets a wobbly cursor. they won't know." },
  { key: 'sabotageEnabled', label: 'sabotage tokens', desc: "each player gets one scribble on someone else's canvas." },
];

const TIPS = [
  '✍ each round, everyone writes a prompt. then we vote on which to draw.',
  '⚡ every third round is a 30-second speedrun. plan accordingly.',
  '🎯 sabotage tokens are once per game. spend them well.',
  '😔 the player in last gets a comeback token. it forces their prompt.',
  '🔥 win three rounds in a row and everyone gets a "stop them" alert.',
  '⚖ judges vote 2×. dramatic announcement included.',
  '✏ blind mode is funnier with sabotage on. just saying.',
];

function PlayerRow({ p, isHost, slotIndex }) {
  const hot = p.streak >= 3;
  return (
    <li className={p.connected ? '' : 'offline'}>
      <span className="slot-num">P{String(slotIndex).padStart(2, '0')}</span>
      <span className="dot" />
      <span className="name">
        <span className={hot ? 'streak-hot' : ''}>{p.name}</span>
        {p.streak >= 1 && (
          <span className={`streak-fire ${hot ? 'streak-hot' : ''}`} style={{ marginLeft: 6 }}>
            🔥{p.streak}
          </span>
        )}
      </span>
      {isHost && <span className="badge host">host</span>}
    </li>
  );
}

function EmptySlot({ slotIndex }) {
  const messages = ['waiting for chaos…', 'this seat is for sale', 'pull up a chair', 'tap the join button friend'];
  const m = messages[slotIndex % messages.length];
  return (
    <li className="empty">
      <span className="slot-num">P{String(slotIndex).padStart(2, '0')}</span>
      <span className="dot" style={{ background: 'var(--text-mute)', boxShadow: 'none' }} />
      <span className="name">{m}</span>
    </li>
  );
}

export default function Lobby({ room, isHost, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTipIdx(t => (t + 1) % TIPS.length), 5200);
    return () => clearInterval(i);
  }, []);

  function copyCode() {
    navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function toggle(key) {
    if (!isHost) return;
    socket.emit('room:options', { options: { [key]: !room.options[key] } });
  }

  const minSlots = 4;
  const emptyCount = Math.max(0, minSlots - room.players.length);

  return (
    <div className="screen center">
      <div className="lobby-grid">
        {/* LEFT: identity + players + start */}
        <div className="card accent">
          <div className="lobby-head">
            <div>
              <span className="eyebrow">round 0 · pre-game</span>
              <h2 style={{ fontSize: 30, marginTop: 2 }}>The Lobby</h2>
            </div>
            <div className="player-count-pill">
              <span className="live-dot" />
              <span><strong>{room.players.filter(p => p.connected).length}</strong> / 12</span>
            </div>
          </div>

          <div className="code-display" onClick={copyCode} title="Click to copy">
            {room.code}
            <span className="copy-hint">{copied ? '✓ copied' : 'tap to copy'}</span>
          </div>

          <h4 style={{ marginBottom: 6 }}>Players</h4>
          <ul className="player-list">
            {room.players.map((p, i) => (
              <PlayerRow key={p.id} p={p} isHost={p.id === room.hostId} slotIndex={i + 1} />
            ))}
            {Array.from({ length: emptyCount }, (_, i) => (
              <EmptySlot key={`empty-${i}`} slotIndex={room.players.length + i + 1} />
            ))}
          </ul>

          <div className="stack">
            {isHost ? (
              <button className="btn primary" onClick={onStart}>
                Start the chaos →
              </button>
            ) : (
              <div className="muted center-text" style={{ padding: 14, fontStyle: 'italic' }}>
                waiting for host to start…
              </div>
            )}
            <button className="btn ghost" onClick={onLeave}>← Leave room</button>
          </div>

          <div className="tip-ticker" key={tipIdx}>
            <span className="tip-label">TIP</span>
            <span className="tip-body">{TIPS[tipIdx]}</span>
          </div>
        </div>

        {/* RIGHT: options + custom prompts */}
        <div className="stack">
          <div className="card accent hot">
            <span className="eyebrow hot">house rules</span>
            <h3 style={{ fontSize: 22, marginTop: 2, marginBottom: 4 }}>Game options</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
              {isHost ? 'Toggle the chaos. Host only.' : 'Only the host can change these.'}
            </p>
            <div className="options-list">
              {OPTION_DEFS.map(opt => (
                <div className="option-row" key={opt.key}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="label">{opt.label}</div>
                    <div className="desc">{opt.desc}</div>
                  </div>
                  <div
                    className={`switch ${room.options[opt.key] ? 'on' : ''}`}
                    onClick={() => toggle(opt.key)}
                    role="switch"
                    aria-checked={room.options[opt.key]}
                    aria-disabled={!isHost}
                  />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
