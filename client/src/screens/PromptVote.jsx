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

export default function PromptVote({ room, me }) {
  const remaining = useCountdown(room.endsAt);
  const [picked, setPicked] = useState(null);

  useEffect(() => { setPicked(null); }, [room.round]);

  const options = room.promptOptions || [];
  const tally = new Array(options.length).fill(0);
  (room.promptVotes || []).forEach(idx => {
    if (idx >= 0 && idx < tally.length) tally[idx]++;
  });

  function pick(i) {
    if (picked !== null) return;
    setPicked(i);
    socket.emit('prompt:vote', { index: i });
  }

  function useComeback() {
    if (!me?.comebackToken) return;
    socket.emit('comeback:use');
  }

  return (
    <div className="screen center">
      <div className="prompt-stage wide">
        <div className="prompt-stage-head">
          <span className="eyebrow">round {room.round}{room.isSpeedrun ? ' · speedrun' : ''}</span>
          <div className={`timer small ${remaining <= 5 ? 'warn' : ''}`}>{remaining}s</div>
        </div>
        <h2 className="prompt-stage-title">pick a prompt to draw</h2>
        <p className="prompt-stage-sub">anonymous · {options.length} submissions</p>

        <div className="prompt-options">
          {options.map((text, i) => {
            const votes = tally[i];
            const isPicked = picked === i;
            return (
              <button
                key={i}
                className={`prompt-option ${isPicked ? 'picked' : ''}`}
                onClick={() => pick(i)}
                disabled={picked !== null}
              >
                <span className="po-text">{text}</span>
                {votes > 0 && (
                  <span className="po-votes mono">
                    {votes} {votes === 1 ? 'vote' : 'votes'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {me?.comebackToken && me?.id === room.underdogId && (
          <button className="btn outlined amber small" onClick={useComeback} style={{ marginTop: 12 }}>
            🎲 use comeback — force your prompt
          </button>
        )}
      </div>
    </div>
  );
}
