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

        <a
          className="github-link"
          href="https://github.com/oak-oak-oak/Doodle-Battle"
          target="_blank"
          rel="noreferrer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          open source on github
        </a>
      </div>
    </div>
  );
}
