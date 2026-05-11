import React, { useEffect, useRef, useState } from 'react';
import Canvas from '../components/Canvas.jsx';
import { socket } from '../socket.js';

const COLORS = ['#000000', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#ec407a'];
const STAMP_EMOJIS = ['💀', '🔥', '😂', '🗿', '👁', '✨', '💯', '🤡'];

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export default function Game({ room, me }) {
  const remaining = useCountdown(room.endsAt);
  const canvasRef = useRef(null);
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(6);
  const [tool, setTool] = useState('brush');
  const [emoji, setEmoji] = useState('💀');
  const [prankActive, setPrankActive] = useState(false);
  const [sabotageTarget, setSabotageTarget] = useState(null);
  const [sabotagePickerOpen, setSabotagePickerOpen] = useState(false);
  const submittedRef = useRef(false);

  const hasSubmitted = !!me?.hasSubmitted;
  const amUnderdog = me?.id === room.underdogId;
  const blindMode = !!room.options?.blindMode;

  useEffect(() => {
    canvasRef.current?.resetRecording();
    submittedRef.current = false;
    setPrankActive(false);
    setSabotageTarget(null);
    setSabotagePickerOpen(false);
  }, [room.round]);

  useEffect(() => {
    function onPrank() { setPrankActive(true); }
    function onSabotageIncoming({ from, stroke }) {
      // Sabotage strokes from another player land directly on MY canvas.
      canvasRef.current?.applyStroke({ ...stroke, color: stroke.color || '#ff3d8a' });
    }
    socket.on('prank:active', onPrank);
    socket.on('sabotage:incoming', onSabotageIncoming);
    return () => {
      socket.off('prank:active', onPrank);
      socket.off('sabotage:incoming', onSabotageIncoming);
    };
  }, []);

  function handleStroke(s) {
    if (sabotageTarget) {
      socket.emit('sabotage:stroke', { targetId: sabotageTarget.id, stroke: s });
    } else {
      socket.emit('draw:stroke', s);
    }
  }
  function handleEmoji(e) {
    // emoji stamps don't get sabotaged, they go on your own canvas
    if (sabotageTarget) {
      // forward as a "stroke-ish" emoji to target by reusing sabotage channel
      socket.emit('sabotage:stroke', { targetId: sabotageTarget.id, stroke: { ...e, isEmoji: true } });
    }
    // local: nothing to broadcast for emoji stamps in live view (not implemented)
  }
  function handleClear() {
    canvasRef.current?.clear();
    socket.emit('draw:clear');
  }
  function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const img = canvasRef.current?.toDataURL();
    const strokes = canvasRef.current?.getRecordedStrokes() || [];
    socket.emit('draw:submit', { image: img, strokes });
  }
  function startSabotage(target) {
    setSabotagePickerOpen(false);
    setSabotageTarget(target);
    // auto-cancel after 6s on client side
    setTimeout(() => {
      setSabotageTarget(null);
      socket.emit('sabotage:end');
    }, 6000);
  }
  function useComeback() {
    if (!me?.comebackToken) return;
    socket.emit('comeback:use');
  }

  useEffect(() => {
    if (remaining === 0 && !submittedRef.current) submit();
  }, [remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  const isWarn = room.isSpeedrun ? remaining <= 10 : remaining <= 15;

  const otherPlayers = room.players.filter(p => p.id !== me?.id && p.connected);

  return (
    <div className="screen game">
      <div className="game-header">
        <div className="prompt-box">
          <div className="prompt-label">
            <span>Round {room.round}{room.isSpeedrun ? ' · ⚡ Speedrun' : ''}</span>
            {amUnderdog && <span className="underdog-badge">😔 underdog</span>}
            {room.judgeId === me?.id && <span className="badge judge">you're the judge</span>}
          </div>
          <div className="prompt-text">{room.prompt || '…'}</div>
        </div>
        <div className={`timer ${isWarn ? 'warn' : ''}`}>{mins}:{secs}</div>
      </div>

      <div className={`canvas-wrap ${blindMode && !hasSubmitted ? 'blind' : ''}`}>
        {sabotageTarget && (
          <div className="sabotage-banner">
            ✏ sabotaging {sabotageTarget.name} — scribble fast!
          </div>
        )}
        <Canvas
          ref={canvasRef}
          color={color}
          size={size}
          tool={tool}
          emoji={emoji}
          onStroke={handleStroke}
          onEmoji={handleEmoji}
          readOnly={hasSubmitted}
          recordStrokes={true}
          prankWobble={prankActive}
        />
      </div>

      <div className="toolbar">
        <div className="palette">
          {COLORS.map(c => (
            <button
              key={c}
              className={`swatch ${color === c && tool === 'brush' ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => { setColor(c); setTool('brush'); }}
              aria-label={`color ${c}`}
            />
          ))}
        </div>
        <div className="tool-row">
          <button className={`btn small ${tool === 'brush' ? 'active' : ''}`} onClick={() => setTool('brush')}>brush</button>
          <button className={`btn small ${tool === 'line' ? 'active' : ''}`} onClick={() => setTool('line')}>line</button>
          <button className={`btn small ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')}>eraser</button>
          <button className={`btn small ${tool === 'emoji' ? 'active' : ''}`} onClick={() => setTool('emoji')}>emoji</button>
          <button className="btn small" onClick={handleClear}>clear</button>
          <input
            type="range" min={2} max={40} value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="size-slider"
          />
          <span className="size-label">{size}px</span>
        </div>
        {tool === 'emoji' && (
          <div className="emoji-tray">
            {STAMP_EMOJIS.map(e => (
              <button
                key={e}
                className={emoji === e ? 'active' : ''}
                onClick={() => setEmoji(e)}
              >{e}</button>
            ))}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            {me?.sabotageToken && room.options?.sabotageEnabled && otherPlayers.length > 0 && !sabotageTarget && (
              <button className="btn outlined hot small" onClick={() => setSabotagePickerOpen(true)}>
                🎯 Sabotage
              </button>
            )}
            {amUnderdog && me?.comebackToken && (
              <button className="btn outlined cool small" onClick={useComeback}>
                🎲 Reroll prompt
              </button>
            )}
          </div>
          <button
            className="btn primary"
            onClick={submit}
            disabled={hasSubmitted}
          >
            {hasSubmitted ? '✓ Submitted' : 'Submit Drawing'}
          </button>
        </div>
      </div>

      <div className="player-status">
        {room.players.map(p => (
          <span key={p.id} className={`chip ${p.hasSubmitted ? 'done' : ''}`}>
            {p.name}{p.hasSubmitted ? ' ✓' : ''}
          </span>
        ))}
      </div>

      {sabotagePickerOpen && (
        <div className="sabotage-picker">
          <div className="card">
            <h3>Sabotage who?</h3>
            <p className="muted" style={{ fontSize: 13 }}>You'll have 6 seconds to draw on their canvas. One shot — make it count.</p>
            <div className="sabotage-target-list">
              {otherPlayers.map(p => (
                <button key={p.id} onClick={() => startSabotage(p)}>{p.name}</button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setSabotagePickerOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
