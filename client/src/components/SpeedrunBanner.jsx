import React, { useEffect, useState } from 'react';

export default function SpeedrunBanner({ show }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [show]);
  if (!visible) return null;
  return (
    <div className="speedrun-banner">
      <span className="marquee">⚡ BREAKING NEWS — SPEEDRUN ROUND — 30 SECONDS ON THE CLOCK ⚡</span>
    </div>
  );
}
