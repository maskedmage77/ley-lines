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

export default function LeyMapCanvas({ segments, intersections, playerX, playerZ, detectRadius, onMovePlayer, sidebarOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapBgRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ cx: 0, cz: 0, scale: 12 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scz: 0 });
  const imageLoaded = useRef(false);
  const imgNat = useRef({ w: 0, h: 0, ox: 0, oz: 0, bw: 0, bh: 0 });
  const [scaleLabel, setScaleLabel] = useState({ blocks: 500, px: 100 });
  const rafRef = useRef(0);

  const wtos = useCallback((wx: number, wz: number, W: number, H: number) => {
    const { cx, cz, scale } = viewRef.current;
    return { sx: W / 2 + (wx - cx) / scale, sy: H / 2 + (wz - cz) / scale };
  }, []);

  const stow = useCallback((sx: number, sy: number, W: number, H: number) => {
    const { cx, cz, scale } = viewRef.current;
    return { wx: cx + (sx - W / 2) * scale, wz: cz + (sy - H / 2) * scale };
  }, []);

  const updateBg = useCallback(() => {
    const el = mapBgRef.current;
    if (!el || !imageLoaded.current) return;
    const { ox, oz, bw, bh } = imgNat.current;
    const { cx, cz, scale } = viewRef.current;
    const W = el.clientWidth, H = el.clientHeight;
    const sx = (ox - (cx - (W / 2) * scale)) / scale;
    const sy = (oz - (cz - (H / 2) * scale)) / scale;
    el.style.backgroundSize = `${bw / scale}px ${bh / scale}px`;
    el.style.backgroundPosition = `${sx}px ${sy}px`;
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { scale } = viewRef.current;
    const wL = viewRef.current.cx - (W / 2) * scale;
    const wR = viewRef.current.cx + (W / 2) * scale;

    // Cell grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5;
    const gs = 600;
    const fgx = Math.floor(wL / gs) * gs;
    for (let gx = fgx; gx < wR; gx += gs) {
      const { sx } = wtos(gx, 0, W, H); ctx.beginPath(); ctx.moveTo(Math.round(sx), 0); ctx.lineTo(Math.round(sx), H); ctx.stroke();
    }

    // Major lines — batched
    ctx.beginPath();
    for (const s of segments.filter(s => s.color === 'major')) {
      const a = wtos(s.x1, s.z1, W, H), b = wtos(s.x2, s.z2, W, H);
      if (Math.max(a.sx, b.sx) < -50 || Math.min(a.sx, b.sx) > W + 50) continue;
      if (Math.abs(b.sx - a.sx) < 0.3 && Math.abs(b.sy - a.sy) < 0.3) continue;
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    }
    ctx.strokeStyle = 'rgba(200,160,255,0.45)'; ctx.lineWidth = 2; ctx.stroke();

    // Local lines — individual (per-segment alpha)
    const local = segments.filter(s => s.color === 'local' && s.alpha > 0.02);
    if (scale < 25) {
      for (const s of local) {
        const a = wtos(s.x1, s.z1, W, H), b = wtos(s.x2, s.z2, W, H);
        if (Math.max(a.sx, b.sx) < -50 || Math.min(a.sx, b.sx) > W + 50) continue;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = `rgba(100,220,230,${0.35 * s.alpha})`; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }

    // Intersections
    for (const int of intersections) {
      const { sx, sy } = wtos(int.x, int.z, W, H);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const gr = 8;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
      g.addColorStop(0, 'rgba(240,200,255,0.85)');
      g.addColorStop(0.4, 'rgba(160,120,220,0.3)');
      g.addColorStop(1, 'rgba(80,40,150,0)');
      ctx.beginPath(); ctx.arc(sx, sy, gr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fillStyle = '#f8f0ff'; ctx.fill();
    }

    // Player
    const ps = wtos(playerX, playerZ, W, H);
    const rPx = detectRadius / scale;
    if (rPx > 1 && rPx < W * 2) {
      ctx.beginPath(); ctx.arc(ps.sx, ps.sy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,160,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6,10]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.arc(ps.sx, ps.sy, 8, 0, Math.PI * 2); ctx.fillStyle = '#e8d0ff'; ctx.fill(); ctx.strokeStyle = '#c0a0ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(ps.sx, ps.sy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(ps.sx-14,ps.sy); ctx.lineTo(ps.sx+14,ps.sy); ctx.moveTo(ps.sx,ps.sy-14); ctx.lineTo(ps.sx,ps.sy+14); ctx.strokeStyle = '#e8d0ff'; ctx.lineWidth = 1; ctx.stroke();
  }, [segments, intersections, playerX, playerZ, detectRadius, wtos]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      updateBg();
      drawOverlay();
      const s = viewRef.current.scale;
      const cw = containerRef.current?.clientWidth ?? 800;
      const maxPx = Math.min(200, cw * 0.35);
      const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
      let best = nice[0];
      for (const b of nice) { if (b / s <= maxPx) best = b; else break; }
      setScaleLabel({ blocks: best, px: Math.round(best / s) });
    });
  }, [updateBg, drawOverlay]);

  // Load map
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageLoaded.current = true;
      fetch('/duskwood-bounds.json').then(r => r.json()).then((b: { ox: number; oz: number; bw: number; bh: number }) => {
        imgNat.current = { w: img.naturalWidth, h: img.naturalHeight, ox: b.ox, oz: b.oz, bw: b.bw, bh: b.bh };
        viewRef.current.cx = b.ox + b.bw / 2;
        viewRef.current.cz = b.oz + b.bh / 2;
        scheduleDraw();
      }).catch(() => scheduleDraw());
    };
    img.src = '/duskwood-map.png';
  }, []);

  useEffect(() => { scheduleDraw(); }, [segments, intersections, playerX, playerZ]);
  useEffect(() => { const t = setTimeout(() => scheduleDraw(), 150); return () => clearTimeout(t); }, [sidebarOpen]);

  // Resize
  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // Mouse
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz };
  };
  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const s = viewRef.current.scale;
      viewRef.current.cx = dragRef.current.scx - (e.clientX - dragRef.current.sx) * s;
      viewRef.current.cz = dragRef.current.scz - (e.clientY - dragRef.current.sy) * s;
      scheduleDraw();
    };
    const up = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy;
      dragRef.current.active = false;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        const { wx, wz } = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
        onMovePlayer(Math.round(wx), Math.round(wz));
      }
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [scheduleDraw, stow, onMovePlayer]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const before = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    viewRef.current.scale = Math.max(1, Math.min(300, viewRef.current.scale * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
    const after = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    viewRef.current.cx += before.wx - after.wx;
    viewRef.current.cz += before.wz - after.wz;
    scheduleDraw();
  }, [stow, scheduleDraw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div ref={containerRef} style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'hidden', cursor: 'crosshair', background: '#06060e' }} onMouseDown={onMouseDown}>
      <div ref={mapBgRef} style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/duskwood-map.png)', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none' }} />
      <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none', zIndex: 5 }}>
        <span style={{ color: '#c8c8e0', fontSize: 11, fontFamily: 'monospace', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{scaleLabel.blocks.toLocaleString()} blocks</span>
        <div style={{ width: scaleLabel.px, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(180,150,255,0.4), rgba(180,150,255,0.7), rgba(180,150,255,0.4))', boxShadow: '0 1px 6px rgba(0,0,0,0.5)', transition: 'width 0.12s ease' }} />
      </div>
    </div>
  );
}
