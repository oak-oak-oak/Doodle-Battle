import React, { useEffect, useRef, useState } from 'react';
import Confetti from '../components/Confetti.jsx';
import { fanfare } from '../sound.js';
import { socket } from '../socket.js';

export default function Results({ room, isHost, me, onNext, onLeave }) {
  const drawings = room.results?.drawings || [];
  const winnerId = room.results?.winnerId;
  const underdogWin = !!room.results?.underdogWin;
  const speedBonus = !!room.results?.speedBonusAwarded;
  const earlyId = room.results?.earlySubmitterId;
  const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
  const winner = drawings[0] && drawings[0].votes > 0 ? drawings[0] : null;

  const [showConfetti, setShowConfetti] = useState(false);
  const [stopThemFor, setStopThemFor] = useState(null);
  const announcedRef = useRef(-1);

  useEffect(() => {
    if (announcedRef.current === room.round) return;
    announcedRef.current = room.round;
    if (winner) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2400);
      fanfare();
    }
    if (winnerId && winnerId !== me?.id) {
      const w = room.players.find(p => p.id === winnerId);
      if (w && w.streak >= 3) {
        setStopThemFor(w.name);
        setTimeout(() => setStopThemFor(null), 4000);
      }
    }
  }, [room.round, winnerId, winner]);

  function endSession() {
    socket.emit('game:endSession');
  }

  return (
    <div className="screen results">
      <h2 className="center-text" style={{ fontSize: 32 }}>
        Round {room.round} {room.isSpeedrun ? '⚡ ' : ''}— Results
      </h2>
      <p className="subhead">Prompt: <strong style={{ color: 'var(--text)' }}>"{room.prompt}"</strong></p>

      {winner && (
        <div className="winner-block">
          <div className="winner-label">🏆 Round winner</div>
          <div className="winner-name">{winner.name}</div>
          <div className="winner-quote">
            {winner.votes} {winner.votes === 1 ? 'vote' : 'votes'}
            {underdogWin && ' · 😔 the underdog rises'}
            {speedBonus && earlyId === winner.id && ' · ⚡ speed bonus'}
          </div>
        </div>
      )}

      <div className="gallery">
        {drawings.map((d, i) => {
          const isWinner = winner && d.id === winner.id;
          return (
            <div key={d.id} className={`draw-card ${isWinner ? 'winner' : ''}`} style={{ cursor: 'default' }}>
              {d.image
                ? <img src={d.image} alt="drawing" />
                : <div className="blank">no submission</div>}
              <div className="meta">
                <span>{d.name}</span>
                <span className="votes">{d.votes} {d.votes === 1 ? 'vote' : 'votes'}</span>
              </div>
              {isWinner && <span className="stamp winner">🏆 winner</span>}
            </div>
          );
        })}
      </div>

      <div className="card narrow" style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: 20, marginBottom: 12 }}>Leaderboard</h3>
        <ol className="leaderboard">
          {leaderboard.map((p, i) => {
            const hot = p.streak >= 3;
            return (
              <li key={p.id}>
                <span className="rank">#{i + 1}</span>
                <span className="name">
                  <span className={hot ? 'streak-hot' : ''}>{p.name}</span>
                  {p.streak >= 1 && <span className={`streak-fire ${hot ? 'streak-hot' : ''}`}>🔥{p.streak}</span>}
                  {p.id === room.underdogId && <span className="underdog-badge">😔 underdog</span>}
                </span>
                <span className="score">{p.score}</span>
              </li>
            );
          })}
        </ol>

        <div className="stack">
          {isHost ? (
            <>
              <button className="btn primary" onClick={onNext}>Next round →</button>
              <button className="btn outlined" onClick={endSession}>End game · watch highlights</button>
            </>
          ) : (
            <div className="muted center-text" style={{ padding: 14, fontStyle: 'italic' }}>waiting for host…</div>
          )}
          <button className="btn ghost" onClick={onLeave}>← Leave room</button>
        </div>
      </div>

      {showConfetti && <Confetti count={120} />}
      {stopThemFor && (
        <div className="toast">
          ⚠ <span>STOP <strong>{stopThemFor}</strong> — they're on a streak</span>
        </div>
      )}
    </div>
  );
}
