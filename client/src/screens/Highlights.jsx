import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { drawStroke, drawEmoji } from '../components/Canvas.jsx';

const W = 800;
const H = 600;
const REPLAY_MS = 6000;

export default function Highlights({ room, isHost, onLeave }) {
  const reel = room.history || [];
  const [idx, setIdx] = useState(0);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const current = reel[idx];

  useEffect(() => {
    if (!canvasRef.current || !current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const strokes = current.strokes || [];
    if (strokes.length === 0) {
      if (current.image) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, W, H);
        img.src = current.image;
      }
      return;
    }
    const totalT = strokes[strokes.length - 1]?.t || 1;
    const speed = totalT / Math.min(REPLAY_MS, Math.max(2500, totalT));
    const start = performance.now();
    let i = 0;
    function step(nowMs) {
      const elapsed = (nowMs - start) * speed;
      while (i < strokes.length && strokes[i].t <= elapsed) {
        drawStroke(ctx, strokes[i]);
        i++;
      }
      if (i < strokes.length) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [idx, current]);

  function backToLobby() {
    socket.emit('game:start');
  }

  if (reel.length === 0) {
    return (
      <div className="screen center">
        <div className="card">
          <h2>No highlights yet</h2>
          <p className="muted">Play at least one round with a clear winner.</p>
          <button className="btn ghost" onClick={onLeave}>← Leave</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen highlights">
      <h2 style={{ fontSize: 32 }}>📼 Highlight Reel</h2>
      <p className="subhead">
        Replay {idx + 1} of {reel.length}
      </p>

      <div className="highlight-stage">
        <div className="highlight-meta">
          <div>
            <div className="label">Round {current.round}</div>
            <div className="prompt">"{current.prompt}"</div>
          </div>
          <div className="winner">🏆 {current.winnerName}</div>
        </div>
        <canvas ref={canvasRef} width={W} height={H} className="highlight-canvas" />
      </div>

      <div className="highlight-controls">
        <button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Prev</button>
        <button className="btn" onClick={() => setIdx(idx)}>Replay</button>
        <button className="btn" disabled={idx === reel.length - 1} onClick={() => setIdx(idx + 1)}>Next →</button>
      </div>

      {isHost && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={backToLobby}>New game →</button>
          <button className="btn ghost" onClick={onLeave}>← Leave</button>
        </div>
      )}
    </div>
  );
}
