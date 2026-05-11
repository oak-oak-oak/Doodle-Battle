import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

const W = 800;
const H = 600;

const Canvas = forwardRef(function Canvas(
  {
    color, size, tool, emoji,
    onStroke, onEmoji,
    readOnly = false,
    recordStrokes = false,
    prankWobble = false,
  },
  ref
) {
  const canvasRef = useRef(null);
  const offscreenRef = useRef(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef([]);
  const prevMidRef = useRef(null);
  const widthRef = useRef(null);
  const dprRef = useRef(1);

  // line tool state
  const lineStartRef = useRef(null);
  const lineEndRef = useRef(null);

  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const emojiRef = useRef(emoji);
  const prankRef = useRef(prankWobble);
  const startTimeRef = useRef(null);
  const recordedRef = useRef([]);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { emojiRef.current = emoji; }, [emoji]);
  useEffect(() => { prankRef.current = prankWobble; }, [prankWobble]);

  // initial sizing with DPR
  useEffect(() => {
    const c = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // offscreen for line-tool preview
    const off = document.createElement('canvas');
    off.width = W * dpr;
    off.height = H * dpr;
    offscreenRef.current = off;

    if (recordStrokes) startTimeRef.current = Date.now();
  }, [recordStrokes]);

  useImperativeHandle(ref, () => ({
    clear() {
      const ctx = canvasRef.current.getContext('2d');
      ctx.save();
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      if (recordStrokes) recordedRef.current.push({ t: nowT(), type: 'clear' });
    },
    applyStroke(s) {
      const ctx = canvasRef.current.getContext('2d');
      drawSegment(ctx, s);
      if (recordStrokes) recordedRef.current.push({ ...s, t: nowT() });
    },
    applyEmoji(e) {
      drawEmoji(canvasRef.current.getContext('2d'), e);
      if (recordStrokes) recordedRef.current.push({ ...e, type: 'emoji', t: nowT() });
    },
    toDataURL() {
      // Downscale to logical W×H so submission size doesn't balloon on HiDPI
      const src = canvasRef.current;
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.fillStyle = '#fff';
      octx.fillRect(0, 0, W, H);
      octx.drawImage(src, 0, 0, src.width, src.height, 0, 0, W, H);
      return out.toDataURL('image/png');
    },
    getRecordedStrokes() { return recordedRef.current.slice(); },
    resetRecording() {
      recordedRef.current = [];
      startTimeRef.current = Date.now();
      const c = canvasRef.current;
      const ctx = c.getContext('2d');
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    },
  }));

  function nowT() {
    if (!startTimeRef.current) startTimeRef.current = Date.now();
    return Date.now() - startTimeRef.current;
  }

  function getPos(e) {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    // map CSS pixels → logical canvas pixels
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    let x = (point.clientX - rect.left) * scaleX;
    let y = (point.clientY - rect.top) * scaleY;
    if (prankRef.current && toolRef.current !== 'line') {
      const t = Date.now() / 1000;
      x += Math.sin(t * 6) * 12 + Math.sin(t * 17) * 5;
      y += Math.cos(t * 5.5) * 12 + Math.cos(t * 19) * 4;
    }
    return { x, y, time: performance.now() };
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function computeWidth(prev, cur) {
    const base = sizeRef.current;
    if (toolRef.current === 'eraser') return base * 1.4;
    const dt = Math.max(1, cur.time - prev.time);
    const v = dist(prev, cur) / dt;
    const fast = 4.5;
    const slow = 0.4;
    const t = Math.max(0, Math.min(1, (v - slow) / (fast - slow)));
    const factor = 1.0 - t * 0.45;
    const prevW = widthRef.current ?? base * factor;
    const target = base * factor;
    const smoothed = prevW + (target - prevW) * 0.45;
    widthRef.current = smoothed;
    return smoothed;
  }
  function colorFor() {
    return toolRef.current === 'eraser' ? '#ffffff' : colorRef.current;
  }

  // snapshot main → offscreen (raw pixel copy)
  function snapshotMain() {
    const off = offscreenRef.current;
    const offCtx = off.getContext('2d');
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(canvasRef.current, 0, 0);
  }
  // restore offscreen → main (matches the dpr transform)
  function restoreMain() {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(offscreenRef.current, 0, 0);
    ctx.restore();
    // ensure transform back to dpr-scaled logical
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // ---------- input handlers ----------

  function handleDown(e) {
    if (readOnly) return;
    e.preventDefault();
    const pos = getPos(e);

    // EMOJI stamp
    if (toolRef.current === 'emoji') {
      const ev = { x: pos.x, y: pos.y, emoji: emojiRef.current, size: sizeRef.current * 6 };
      drawEmoji(canvasRef.current.getContext('2d'), ev);
      onEmoji?.(ev);
      if (recordStrokes) recordedRef.current.push({ ...ev, type: 'emoji', t: nowT() });
      return;
    }

    // LINE tool — snapshot, then preview on move
    if (toolRef.current === 'line') {
      drawingRef.current = true;
      lineStartRef.current = pos;
      lineEndRef.current = pos;
      snapshotMain();
      return;
    }

    // BRUSH / ERASER
    drawingRef.current = true;
    pointsRef.current = [pos];
    prevMidRef.current = null;
    widthRef.current = null;
    // small dot for single-tap
    const ctx = canvasRef.current.getContext('2d');
    const w = sizeRef.current;
    ctx.fillStyle = colorFor();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, w / 2, 0, Math.PI * 2);
    ctx.fill();
    const dotSeg = { type: 'dot', x: pos.x, y: pos.y, size: w, color: colorFor() };
    onStroke?.(dotSeg);
    if (recordStrokes) recordedRef.current.push({ ...dotSeg, t: nowT() });
  }

  function handleMove(e) {
    if (readOnly || !drawingRef.current) return;
    if (toolRef.current === 'emoji') return;
    e.preventDefault();
    const cur = getPos(e);

    if (toolRef.current === 'line') {
      // preview: restore snapshot, draw the line to current position
      restoreMain();
      const ctx = canvasRef.current.getContext('2d');
      const start = lineStartRef.current;
      ctx.strokeStyle = colorFor();
      ctx.lineWidth = sizeRef.current;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      lineEndRef.current = cur;
      return;
    }

    // smoothed brush/eraser
    const pts = pointsRef.current;
    pts.push(cur);
    if (pts.length < 3) return;

    const ctx = canvasRef.current.getContext('2d');
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];
    const p0 = pts[pts.length - 3];
    const startPt = prevMidRef.current || p0;
    const endPt = midpoint(p1, p2);
    const width = computeWidth(p1, p2);

    ctx.strokeStyle = colorFor();
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.quadraticCurveTo(p1.x, p1.y, endPt.x, endPt.y);
    ctx.stroke();

    const seg = {
      type: 'curve',
      x0: startPt.x, y0: startPt.y,
      cx: p1.x, cy: p1.y,
      x1: endPt.x, y1: endPt.y,
      size: width,
      color: colorFor(),
    };
    onStroke?.(seg);
    if (recordStrokes) recordedRef.current.push({ ...seg, t: nowT() });

    prevMidRef.current = endPt;
  }

  function handleUp(e) {
    if (readOnly) return;
    e?.preventDefault?.();

    // commit line
    if (toolRef.current === 'line' && drawingRef.current && lineStartRef.current && lineEndRef.current) {
      const start = lineStartRef.current;
      const end = lineEndRef.current;
      restoreMain();
      const ctx = canvasRef.current.getContext('2d');
      ctx.strokeStyle = colorFor();
      ctx.lineWidth = sizeRef.current;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const seg = {
        type: 'line',
        x0: start.x, y0: start.y, x1: end.x, y1: end.y,
        size: sizeRef.current, color: colorFor(),
      };
      onStroke?.(seg);
      if (recordStrokes) recordedRef.current.push({ ...seg, t: nowT() });
      drawingRef.current = false;
      lineStartRef.current = null;
      lineEndRef.current = null;
      return;
    }

    // finish smoothed brush stroke
    const pts = pointsRef.current;
    if (drawingRef.current && pts.length >= 2 && prevMidRef.current && toolRef.current !== 'emoji') {
      const last = pts[pts.length - 1];
      const ctx = canvasRef.current.getContext('2d');
      const width = widthRef.current ?? sizeRef.current;
      ctx.strokeStyle = colorFor();
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(prevMidRef.current.x, prevMidRef.current.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      const seg = {
        type: 'line',
        x0: prevMidRef.current.x, y0: prevMidRef.current.y,
        x1: last.x, y1: last.y,
        size: width, color: colorFor(),
      };
      onStroke?.(seg);
      if (recordStrokes) recordedRef.current.push({ ...seg, t: nowT() });
    }
    drawingRef.current = false;
    pointsRef.current = [];
    prevMidRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      style={{ width: '100%', height: 'auto', aspectRatio: '4 / 3' }}
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
      onTouchStart={handleDown}
      onTouchMove={handleMove}
      onTouchEnd={handleUp}
      onTouchCancel={handleUp}
    />
  );
});

function drawSegment(ctx, s) {
  if (s.type === 'emoji') return drawEmoji(ctx, s);
  if (s.type === 'clear') {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.type === 'dot') {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0.5, s.size / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (s.type === 'curve') {
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1);
    ctx.stroke();
    return;
  }
  // line
  ctx.beginPath();
  ctx.moveTo(s.x0, s.y0);
  ctx.lineTo(s.x1, s.y1);
  ctx.stroke();
}

function drawEmoji(ctx, e) {
  ctx.save();
  ctx.font = `${e.size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.emoji, e.x, e.y);
  ctx.restore();
}

export { drawSegment as drawStroke, drawEmoji };
export default Canvas;
