import { useEffect, useRef, useCallback, useState } from 'react';
import type { PolySegment, LeyIntersection } from '../Types';

interface Props {
  segments: PolySegment[];
  intersections: LeyIntersection[];
  playerX: number;
  playerZ: number;
  detectRadius: number;
  onMovePlayer: (x: number, z: number) => void;
  sidebarOpen: boolean;
}

interface ViewState { cx: number; cz: number; scale: number; }

const OFFCANVAS_SIZE = 8192;

export default function LeyMapCanvas({ segments, intersections, playerX, playerZ, detectRadius, onMovePlayer, sidebarOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapBgRef = useRef<HTMLDivElement>(null);
  const linesBgRef = useRef<HTMLDivElement>(null);
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ cx: 0, cz: 0, scale: 12 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scz: 0 });
  const imageLoaded = useRef(false);
  const imgNat = useRef({ w: 0, h: 0, ox: 0, oz: 0, bw: 0, bh: 0 });
  const [scaleLabel, setScaleLabel] = useState({ blocks: 500, px: 100 });
  const [linesReady, setLinesReady] = useState(false);
  const linesUrlRef = useRef<string | null>(null);

  // ── Callbacks (defined first) ──────────────────

  const updateBg = useCallback((el: HTMLDivElement | null, _iw: number, _ih: number, ox: number, oz: number, bw: number, bh: number) => {
    if (!el) return;
    const { cx, cz, scale } = viewRef.current;
    const cw = el.clientWidth, ch = el.clientHeight;
    const sx = (ox - (cx - (cw / 2) * scale)) / scale;
    const sy = (oz - (cz - (ch / 2) * scale)) / scale;
    el.style.backgroundSize = `${bw / scale}px ${bh / scale}px`;
    el.style.backgroundPosition = `${sx}px ${sy}px`;
  }, []);

  const updateAllBg = useCallback(() => {
    if (imageLoaded.current) {
      const { ox, oz, bw, bh, w, h } = imgNat.current;
      updateBg(mapBgRef.current, w, h, ox, oz, bw, bh);
    }
    if (linesUrlRef.current) {
      const WORLD_EXTENT = 600000;
      updateBg(linesBgRef.current, OFFCANVAS_SIZE, OFFCANVAS_SIZE, -WORLD_EXTENT, -WORLD_EXTENT, 2 * WORLD_EXTENT, 2 * WORLD_EXTENT);
    }
  }, [updateBg]);

  const drawPlayer = useCallback(() => {
    const c = playerCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { cx, cz, scale } = viewRef.current;
    const sx = W / 2 + (playerX - cx) / scale;
    const sy = H / 2 + (playerZ - cz) / scale;
    const rPx = detectRadius / scale;
    if (rPx > 1 && rPx < W * 2) {
      ctx.beginPath(); ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,160,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6,10]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fillStyle = '#e8d0ff'; ctx.fill(); ctx.strokeStyle = '#c0a0ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx-14,sy); ctx.lineTo(sx+14,sy); ctx.moveTo(sx,sy-14); ctx.lineTo(sx,sy+14); ctx.strokeStyle = '#e8d0ff'; ctx.lineWidth = 1; ctx.stroke();
  }, [playerX, playerZ, detectRadius]);

  const sw = useCallback(
    (sx: number, sy: number, w: number, h: number) => {
      const { cx, cz, scale } = viewRef.current;
      return { wx: cx + (sx - w / 2) * scale, wz: cz + (sy - h / 2) * scale };
    }, []
  );

  const syncView = useCallback(() => {
    updateAllBg();
    drawPlayer();
    const s = viewRef.current.scale;
    const cw = containerRef.current?.clientWidth ?? 800;
    const maxPx = Math.min(200, cw * 0.35);
    const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    let best = nice[0];
    for (const b of nice) { if (b / s <= maxPx) best = b; else break; }
    setScaleLabel({ blocks: best, px: Math.round(best / s) });
  }, [updateAllBg, drawPlayer]);

  // ── Effects ────────────────────────────────────

  // Generate overlay image once
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OFFCANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, OFFCANVAS_SIZE, OFFCANVAS_SIZE);

    // Map world coords (-WORLD_EXTENT..+WORLD_EXTENT) → canvas (0..OFFCANVAS_SIZE)
    const WORLD_EXTENT = 600000;
    const worldToCanvas = (wx: number, wz: number) => ({
      x: ((wx + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * OFFCANVAS_SIZE,
      y: ((wz + WORLD_EXTENT) / (2 * WORLD_EXTENT)) * OFFCANVAS_SIZE,
    });

    // Major lines
    ctx.beginPath();
    for (const s of segments.filter(s => s.color === 'major')) {
      const a = worldToCanvas(s.x1, s.z1), b = worldToCanvas(s.x2, s.z2);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = 'rgba(200,160,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Local lines
    for (const s of segments.filter(s => s.color === 'local')) {
      if (s.alpha < 0.02) continue;
      const a = worldToCanvas(s.x1, s.z1), b = worldToCanvas(s.x2, s.z2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(100,220,230,${0.4 * s.alpha})`; ctx.lineWidth = 1; ctx.stroke();
    }

    // Intersections
    for (const int of intersections) {
      const { x, y } = worldToCanvas(int.x, int.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = '#f0e8ff'; ctx.fill();
    }

    linesUrlRef.current = canvas.toDataURL('image/png');
    setLinesReady(true);
  }, [segments, intersections]);

  // Load map
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageLoaded.current = true;
      fetch('/duskwood-bounds.json').then(r => r.json()).then((b: { ox: number; oz: number; bw: number; bh: number }) => {
        imgNat.current = { w: img.naturalWidth, h: img.naturalHeight, ox: b.ox, oz: b.oz, bw: b.bw, bh: b.bh };
        viewRef.current.cx = b.ox + b.bw / 2;
        viewRef.current.cz = b.oz + b.bh / 2;
        syncView();
      }).catch(() => syncView());
    };
    img.src = '/duskwood-map.png';
  }, []);

  // Position lines layer after it mounts
  useEffect(() => {
    if (linesReady && linesUrlRef.current) {
      updateAllBg();
      drawPlayer();
    }
  }, [linesReady, updateAllBg, drawPlayer]);

  // Redraw player on move
  useEffect(() => { drawPlayer(); }, [playerX, playerZ, drawPlayer]);

  // Handle sidebar resize
  useEffect(() => {
    const t = setTimeout(() => syncView(), 150);
    return () => clearTimeout(t);
  }, [sidebarOpen]);

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz };
  };

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const s = viewRef.current.scale;
      viewRef.current.cx = dragRef.current.scx - (e.clientX - dragRef.current.sx) * s;
      viewRef.current.cz = dragRef.current.scz - (e.clientY - dragRef.current.sy) * s;
      syncView();
    };
    const up = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy;
      dragRef.current.active = false;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        const { wx, wz } = sw(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
        onMovePlayer(Math.round(wx), Math.round(wz));
      }
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [syncView, sw, onMovePlayer]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const before = sw(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    viewRef.current.scale = Math.max(1, Math.min(300, viewRef.current.scale * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
    const after = sw(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    viewRef.current.cx += before.wx - after.wx;
    viewRef.current.cz += before.wz - after.wz;
    syncView();
  }, [sw, syncView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Resize
  useEffect(() => {
    const ro = new ResizeObserver(() => syncView());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [syncView]);

  return (
    <div ref={containerRef} style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'hidden', cursor: 'crosshair', background: '#06060e' }} onMouseDown={onMouseDown}>
      <div ref={mapBgRef} style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/duskwood-map.png)', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none' }} />
      {linesReady && linesUrlRef.current && (
        <div ref={linesBgRef} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${linesUrlRef.current})`, backgroundRepeat: 'no-repeat', imageRendering: 'auto', pointerEvents: 'none' }} />
      )}
      <canvas ref={playerCanvasRef} style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none', zIndex: 5 }}>
        <span style={{ color: '#c8c8e0', fontSize: 11, fontFamily: 'monospace', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{scaleLabel.blocks.toLocaleString()} blocks</span>
        <div style={{ width: scaleLabel.px, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(180,150,255,0.4), rgba(180,150,255,0.7), rgba(180,150,255,0.4))', boxShadow: '0 1px 6px rgba(0,0,0,0.5)', transition: 'width 0.12s ease' }} />
      </div>
    </div>
  );
}
