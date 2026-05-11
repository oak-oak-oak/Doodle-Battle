import React, { useMemo } from 'react';

const COLORS = ['#ee3d3d', '#ffb800', '#2b6cb0', '#2f8f4a', '#f5b400', '#8e24aa'];

export default function Confetti({ count = 80 }) {
  const pieces = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * 500;
      return {
        key: i,
        bg: COLORS[Math.floor(Math.random() * COLORS.length)],
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist + 200, // bias downward
        delay: Math.random() * 0.2,
        rotate: Math.random() * 360,
      };
    });
  }, [count]);
  return (
    <div className="confetti-burst">
      {pieces.map(p => (
        <span
          key={p.key}
          className="confetti-piece"
          style={{
            background: p.bg,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
