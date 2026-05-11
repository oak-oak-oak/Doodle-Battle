// Tiny WebAudio sound utility — no asset files.
let ctx = null;
function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq = 880, type = 'sine', dur = 0.15, gain = 0.08, attack = 0.005, decay = 0.12 }) {
  const a = audio(); if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g); g.connect(a.destination);
  const t0 = a.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  osc.start(t0);
  osc.stop(t0 + dur);
}

export function ding() {
  tone({ freq: 1175, type: 'triangle', dur: 0.18, gain: 0.06, decay: 0.15 });
  setTimeout(() => tone({ freq: 1568, type: 'triangle', dur: 0.18, gain: 0.05, decay: 0.13 }), 60);
}

export function pop() {
  tone({ freq: 520, type: 'square', dur: 0.06, gain: 0.04, decay: 0.05 });
}

export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.08, decay: 0.18 }), i * 90);
  });
}
