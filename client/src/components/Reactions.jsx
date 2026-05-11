import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';

const EMOJIS = ['😂', '🔥', '👏', '💀', '🎨'];

export default function Reactions() {
  const [floats, setFloats] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    function onReaction({ emoji }) {
      const id = ++idRef.current;
      const left = 10 + Math.random() * 80;   // vw
      const bottom = 80 + Math.random() * 40; // px from bottom
      setFloats(f => [...f, { id, emoji, left, bottom }]);
      setTimeout(() => {
        setFloats(f => f.filter(x => x.id !== id));
      }, 2300);
    }
    socket.on('reaction', onReaction);
    return () => socket.off('reaction', onReaction);
  }, []);

  function send(emoji) {
    socket.emit('reaction:send', { emoji });
  }

  return (
    <>
      <div className="reactions-overlay">
        {floats.map(f => (
          <span
            key={f.id}
            className="floating-emoji"
            style={{ left: `${f.left}vw`, bottom: `${f.bottom}px` }}
          >{f.emoji}</span>
        ))}
      </div>
      <div className="reactions-bar">
        {EMOJIS.map(e => (
          <button key={e} onClick={() => send(e)}>{e}</button>
        ))}
      </div>
    </>
  );
}
