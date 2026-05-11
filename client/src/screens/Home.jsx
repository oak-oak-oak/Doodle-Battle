import React, { useEffect, useState } from 'react';

const TAGLINES = [
  'draw the prompt. judge the chaos. maybe win.',
  'six rounds, three friendships ruined. easy.',
  "it's like pictionary, but worse on purpose.",
  'cursed prompts available on request.',
];

export default function Home({ onCreate, onJoin, error }) {
  const [name, setName] = useState(localStorage.getItem('doodle:name') || '');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('menu');
  const [tagIdx, setTagIdx] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTagIdx(t => (t + 1) % TAGLINES.length), 5000);
    return () => clearInterval(i);
  }, []);

  function persistName(n) {
    setName(n);
    localStorage.setItem('doodle:name', n);
  }

  return (
    <div className="screen center">
      <div className="home">
        <h1 className="title">doodle <em>battle</em></h1>
        <p className="tagline">{TAGLINES[tagIdx]}</p>

        <div className="home-form">
          <input
            className="input"
            placeholder="your name"
            value={name}
            maxLength={20}
            onChange={(e) => persistName(e.target.value)}
          />

          {mode === 'menu' && (
            <>
              <button
                className="btn primary block"
                disabled={!name.trim()}
                onClick={() => onCreate(name.trim())}
              >
                start a room
              </button>
              <button className="btn-link" onClick={() => setMode('join')}>
                or join with a code →
              </button>
            </>
          )}

          {mode === 'join' && (
            <>
              <input
                className="input mono"
                placeholder="code"
                value={code}
                maxLength={4}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button
                className="btn primary block"
                disabled={!name.trim() || code.length !== 4}
                onClick={() => onJoin(code, name.trim())}
              >
                join
              </button>
              <button className="btn-link" onClick={() => setMode('menu')}>← back</button>
            </>
          )}

          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
