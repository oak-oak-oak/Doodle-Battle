import React, { useEffect, useState } from 'react';
import { socket } from '../socket.js';

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export default function PromptSubmission({ room, me }) {
  const remaining = useCountdown(room.endsAt);
  const [text, setText] = useState('');
  const submitted = !!me?.hasSubmittedPrompt;

  useEffect(() => { setText(''); }, [room.round]);

  function submit() {
    const t = text.trim();
    if (!t || submitted) return;
    socket.emit('prompt:submit', { text: t });
  }

  function useComeback() {
    if (!me?.comebackToken) return;
    socket.emit('comeback:use');
  }

  const total = room.players.filter(p => p.connected).length;
  const submittedCount = room.players.filter(p => p.hasSubmittedPrompt).length;

  return (
    <div className="screen center">
      <div className="prompt-stage">
        <div className="prompt-stage-head">
          <span className="eyebrow">round {room.round}{room.isSpeedrun ? ' · speedrun' : ''}</span>
          <div className={`timer small ${remaining <= 5 ? 'warn' : ''}`}>{remaining}s</div>
        </div>
        <h2 className="prompt-stage-title">pitch a prompt</h2>
        <p className="prompt-stage-sub">
          everyone writes one. then we vote on which one to draw.
        </p>

        <div className="submit-row">
          <input
            className="input"
            placeholder="e.g. a dog at a job interview"
            value={text}
            disabled={submitted}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button
            className="btn primary"
            onClick={submit}
            disabled={submitted || !text.trim()}
          >
            {submitted ? 'submitted' : 'submit'}
          </button>
        </div>

        {me?.comebackToken && me?.id === room.underdogId && submitted && (
          <button className="btn outlined amber small" onClick={useComeback} style={{ marginTop: 12 }}>
            🎲 use comeback — force your prompt
          </button>
        )}

        <div className="ready-grid">
          <div className="ready-meta">
            <span className="ready-count mono">{submittedCount}/{total}</span>
            <span className="ready-label">submitted</span>
          </div>
          <div className="ready-chips">
            {room.players.map(p => (
              <span key={p.id} className={`chip ${p.hasSubmittedPrompt ? 'done' : ''}`}>
                {p.name}{p.hasSubmittedPrompt ? ' ✓' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
