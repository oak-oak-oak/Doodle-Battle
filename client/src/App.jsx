import React, { useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';
import Game from './screens/Game.jsx';
import Vote from './screens/Vote.jsx';
import Results from './screens/Results.jsx';
import PromptVote from './screens/PromptVote.jsx';
import PromptSubmission from './screens/PromptSubmission.jsx';
import Highlights from './screens/Highlights.jsx';
import SpeedrunBanner from './components/SpeedrunBanner.jsx';
import GithubCorner from './components/GithubCorner.jsx';
import { fanfare } from './sound.js';

function JudgeOverlay({ name }) {
  return (
    <div className="judge-overlay">
      <div className="judge-title">⚖ The Judge Is</div>
      <div className="judge-name">{name}</div>
      <div className="judge-sub">Their vote counts double this round.</div>
    </div>
  );
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoomCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

export default function App() {
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [error, setError] = useState('');
  const [speedrunCue, setSpeedrunCue] = useState(0);
  const [toast, setToast] = useState(null);
  const announcedRoundRef = useRef(-1);
  const judgeAnnouncedRef = useRef(-1);
  const pendingNameRef = useRef(null);

  useEffect(() => {
    function onUpdate(r) { setRoom(r); }
    function onReady({ id }) {
      // server tells us our connection ID
      setPlayerId(id);
      // identify ourselves with the pending name
      if (pendingNameRef.current) {
        socket.emit('room:identify', { name: pendingNameRef.current });
      }
    }
    function onJoined({ playerId }) {
      setPlayerId(playerId);
      pendingNameRef.current = null;
      setError('');
    }
    function onRoomError({ error }) {
      setError(error || 'Connection failed');
      socket.disconnect();
      setRoom(null);
      pendingNameRef.current = null;
    }
    function onDisconnect() {
      // a clean disconnect from leaving — already handled in leaveRoom
    }
    function onToast({ kind, name }) {
      if (kind === 'comeback') {
        setToast(`🎲 ${name} burned a comeback token — re-rolling!`);
        setTimeout(() => setToast(null), 3500);
      }
    }
    socket.on('room:update', onUpdate);
    socket.on('connect:ready', onReady);
    socket.on('room:joined', onJoined);
    socket.on('room:error', onRoomError);
    socket.on('disconnect', onDisconnect);
    socket.on('toast', onToast);
    return () => {
      socket.off('room:update', onUpdate);
      socket.off('connect:ready', onReady);
      socket.off('room:joined', onJoined);
      socket.off('room:error', onRoomError);
      socket.off('disconnect', onDisconnect);
      socket.off('toast', onToast);
    };
  }, []);

  useEffect(() => {
    if (!room) return;
    if (room.isSpeedrun && room.phase === 'drawing' && announcedRoundRef.current !== room.round) {
      announcedRoundRef.current = room.round;
      setSpeedrunCue(c => c + 1);
    }
    if (room.phase === 'judge_reveal' && judgeAnnouncedRef.current !== room.round) {
      judgeAnnouncedRef.current = room.round;
      fanfare();
    }
  }, [room?.phase, room?.round, room?.isSpeedrun]);

  function createRoom(name) {
    setError('');
    pendingNameRef.current = name;
    socket.connect(makeRoomCode());
  }
  function joinRoom(code, name) {
    setError('');
    pendingNameRef.current = name;
    socket.connect((code || '').toUpperCase());
  }
  function leaveRoom() {
    socket.emit('room:leave');
    socket.disconnect();
    setRoom(null);
    setPlayerId(null);
    pendingNameRef.current = null;
  }

  if (!room) return (
    <>
      <Home onCreate={createRoom} onJoin={joinRoom} error={error} />
      <GithubCorner />
    </>
  );

  const me = room.players.find(p => p.id === playerId);
  const isHost = room.hostId === playerId;
  const judgeName = room.judgeId ? room.players.find(p => p.id === room.judgeId)?.name : null;

  let screen;
  switch (room.phase) {
    case 'lobby':
      screen = <Lobby room={room} isHost={isHost} onStart={() => socket.emit('game:start')} onLeave={leaveRoom} />;
      break;
    case 'prompt_submission':
      screen = <PromptSubmission room={room} me={me} />;
      break;
    case 'prompt_vote':
      screen = <PromptVote room={room} me={me} />;
      break;
    case 'judge_reveal':
      screen = <div className="screen center" />;
      break;
    case 'drawing':
      screen = <Game room={room} me={me} />;
      break;
    case 'voting':
      screen = <Vote room={room} me={me} />;
      break;
    case 'results':
      screen = <Results room={room} isHost={isHost} me={me} onNext={() => socket.emit('game:nextRound')} onLeave={leaveRoom} />;
      break;
    case 'highlights':
      screen = <Highlights room={room} isHost={isHost} onLeave={leaveRoom} />;
      break;
    default:
      screen = <div className="screen center">Loading…</div>;
  }

  return (
    <>
      <SpeedrunBanner show={speedrunCue} />
      {room.phase === 'judge_reveal' && judgeName && <JudgeOverlay name={judgeName} />}
      {toast && <div className="toast">{toast}</div>}
      {screen}
      <GithubCorner />
    </>
  );
}
