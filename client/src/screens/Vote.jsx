import React, { useEffect, useState } from 'react';
import { socket } from '../socket.js';
import Reactions from '../components/Reactions.jsx';
import { ding, pop } from '../sound.js';

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export default function Vote({ room, me }) {
  const remaining = useCountdown(room.endsAt);
  const [voted, setVoted] = useState(null);

  useEffect(() => {
    function onDing({ voterId }) {
      if (voterId === me?.id) ding();
      else pop();
    }
    socket.on('vote:ding', onDing);
    return () => socket.off('vote:ding', onDing);
  }, [me?.id]);

  function cast(id, e) {
    e?.stopPropagation?.();
    if (id === me?.id || voted) return;
    setVoted(id);
    socket.emit('vote:cast', { targetId: id });
  }

  // Server already ordered drawings by submission time (earliest first).
  const drawings = room.drawings;

  return (
    <div className="screen vote">
      <div className="game-header">
        <div className="prompt-box">
          <div className="prompt-label">
            <span>The Gallery</span>
            {room.judgeId && <span className="badge judge">judge: {room.players.find(p => p.id === room.judgeId)?.name}</span>}
          </div>
          <div className="prompt-text">"{room.prompt}"</div>
        </div>
        <div className={`timer ${remaining <= 10 ? 'warn' : ''}`}>{remaining}s</div>
      </div>
      <p className="subhead">
        Vote for your favorite · can't pick your own
        {room.judgeId === me?.id && <span style={{ color: 'var(--gold)' }}> · your vote counts 2×</span>}
      </p>
      <div className="gallery">
        {drawings.map((d, i) => {
          const isMine = d.id === me?.id;
          const isVoted = voted === d.id;
          const isFirst = i === 0 && room.earlySubmitterId === d.id;
          return (
            <button
              key={d.id}
              className={`draw-card ${isMine ? 'mine' : ''} ${isVoted ? 'voted' : ''}`}
              onClick={(e) => cast(d.id, e)}
              disabled={isMine || !!voted}
            >
              {d.image
                ? <img src={d.image} alt="drawing" />
                : <div className="blank">no submission</div>}
              {isFirst && <span className="stamp first">first!</span>}
              {isMine && !isFirst && <span className="stamp mine">yours</span>}
              {isVoted && <span className="stamp voted">✓ voted</span>}
            </button>
          );
        })}
      </div>
      <Reactions />
    </div>
  );
}
