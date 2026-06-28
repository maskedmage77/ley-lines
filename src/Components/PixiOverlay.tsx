import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Graphics, Container, BlurFilter } from 'pixi.js';
import type { PolySegment, LeyIntersection } from '../Types';

interface Props {
  segments: PolySegment[];
  intersections: LeyIntersection[];
  playerX: number; playerZ: number;
  detectRadius: number;
  onMovePlayer: (x: number, z: number) => void;
  sidebarOpen: boolean;
  mapRef: React.RefObject<HTMLDivElement | null>;
  mapBounds: { ox: number; oz: number; bw: number; bh: number } | null;
}

export default function PixiOverlay(p: Props) {
  const { segments, intersections, playerX, playerZ, detectRadius, onMovePlayer, sidebarOpen, mapRef, mapBounds } = p;
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const playerGfx = useRef<Graphics | null>(null);
  const initRef = useRef(false);
  const [scaleLabel, setScaleLabel] = useState({ blocks: 500, px: 100 });
  const [ready, setReady] = useState(false);
  const viewRef = useRef({ cx: 0, cz: 0, scale: 12 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scz: 0 });
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const stow = useCallback((sx: number, sy: number, W: number, H: number) => {
    const { cx, cz, scale } = viewRef.current;
    return { wx: cx + (sx - W / 2) * scale, wz: cz + (sy - H / 2) * scale };
  }, []);

  const buildWorld = useCallback((world: Container) => {
    world.removeChildren();
    const g = new Graphics();
    const gs = 600;
    for (let x = -15000; x <= 15000; x += gs) { g.moveTo(x, -15000); g.lineTo(x, 15000); }
    for (let z = -15000; z <= 15000; z += gs) { g.moveTo(-15000, z); g.lineTo(15000, z); }
    g.stroke({ width: 0.5, color: 0xffffff, alpha: 0.04 }); world.addChild(g);
    const maj = new Graphics();
    for (const s of segments.filter(s => s.color === 'major')) { maj.moveTo(s.x1, s.z1); maj.lineTo(s.x2, s.z2); }
    maj.stroke({ width: 4, color: 0xc8a0ff, alpha: 0.7 }); maj.filters = [new BlurFilter({ strength: 0.3, quality: 2 })]; world.addChild(maj);
    const loc = new Graphics();
    for (const s of segments.filter(s => s.color === 'local')) { if (s.alpha < 0.02) continue; loc.moveTo(s.x1, s.z1); loc.lineTo(s.x2, s.z2); loc.stroke({ width: 2, color: 0x64d2d8, alpha: 0.6 * s.alpha }); }
    world.addChild(loc);
    const d = new Graphics();
    for (const i of intersections) { d.circle(i.x, i.z, 12); d.fill({ color: 0xf0e8ff, alpha: 0.9 }); d.circle(i.x, i.z, 6); d.fill({ color: 0xffffff, alpha: 1 }); }
    d.filters = [new BlurFilter({ strength: 0.25, quality: 2 })]; world.addChild(d);
  }, [segments, intersections]);

  const syncView = useCallback(() => {
    const a = appRef.current; const w = worldRef.current; const pg = playerGfx.current;
    if (!a?.renderer || !w || !pg) return;
    const { cx, cz, scale } = viewRef.current;
    const W = a.renderer.width, H = a.renderer.height;
    w.x = W / 2 - cx / scale; w.y = H / 2 - cz / scale; w.scale.set(1 / scale);
    if (mapRef.current && mapBounds) {
      const { ox, oz, bw, bh } = mapBounds;
      const sx = (ox - (cx - (W / 2) * scale)) / scale;
      const sy = (oz - (cz - (H / 2) * scale)) / scale;
      mapRef.current.style.backgroundSize = `${bw / scale}px ${bh / scale}px`;
      mapRef.current.style.backgroundPosition = `${sx}px ${sy}px`;
    }
    pg.clear();
    const sx = W / 2 + (playerX - cx) / scale, sy = H / 2 + (playerZ - cz) / scale;
    const rPx = detectRadius / scale;
    if (rPx > 1 && rPx < W * 2) { pg.circle(sx, sy, rPx); pg.stroke({ width: 2, color: 0xc8a0ff, alpha: 0.4 }); }
    pg.circle(sx, sy, 8); pg.fill({ color: 0xe8d0ff });
    pg.circle(sx, sy, 2); pg.fill({ color: 0xffffff });
    pg.moveTo(sx - 14, sy); pg.lineTo(sx + 14, sy); pg.moveTo(sx, sy - 14); pg.lineTo(sx, sy + 14);
    pg.stroke({ width: 1.2, color: 0xe8d0ff });
    const cw = containerRef.current?.clientWidth ?? 800;
    const maxPx = Math.min(200, cw * 0.35);
    const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    let best = nice[0]; for (const b of nice) { if (b / scale <= maxPx) best = b; else break; }
    setScaleLabel({ blocks: best, px: Math.round(best / scale) });
  }, [playerX, playerZ, detectRadius, mapBounds]);

  // ── Init (once, guarded against React strict mode double-mount) ──
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    const app = new Application();
    appRef.current = app;

    app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    }).then(() => {
      if (cancelled) { app.destroy(false); return; }
      el.appendChild(app.canvas);
      Object.assign(app.canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      const world = new Container(); worldRef.current = world; app.stage.addChild(world);
      const pg = new Graphics(); playerGfx.current = pg; app.stage.addChild(pg);
      buildWorld(world);
      syncView();
      setReady(true);
    }).catch(err => console.error('Pixi init failed:', err));

    return () => {
      cancelled = true;
      try { app.destroy(false); } catch { /* init may not have completed */ }
    };
  }, []);

  // Rebuild on data change
  useEffect(() => { if (ready && worldRef.current) { buildWorld(worldRef.current); syncView(); } }, [ready, buildWorld]);

  // Sidebar toggle → retrigger resizeTo
  useEffect(() => {
    const a = appRef.current as any;
    if (ready && a?.resizeTo !== undefined) a.resizeTo = containerRef.current;
  }, [sidebarOpen, ready]);

  // Mouse
  const onPointerDown = (e: React.PointerEvent) => { dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz }; };
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (!dragRef.current.active) return; viewRef.current.cx = dragRef.current.scx - (e.clientX - dragRef.current.sx) * viewRef.current.scale; viewRef.current.cz = dragRef.current.scz - (e.clientY - dragRef.current.sy) * viewRef.current.scale; syncView(); };
    const up = (e: MouseEvent) => { if (!dragRef.current.active) return; const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy; dragRef.current.active = false; if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && containerRef.current) { const r = containerRef.current.getBoundingClientRect(); const { wx, wz } = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height); onMovePlayer(Math.round(wx), Math.round(wz)); } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [syncView, stow, onMovePlayer]);

  // Touch
  useEffect(() => {
    const ts = (e: TouchEvent) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), scale: viewRef.current.scale }; dragRef.current.active = false; } else if (e.touches.length === 1) { const t = e.touches[0]; dragRef.current = { active: true, sx: t.clientX, sy: t.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz }; } };
    const tm = (e: TouchEvent) => { if (e.touches.length === 2 && pinchRef.current) { e.preventDefault(); const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; const nd = Math.sqrt(dx * dx + dy * dy); const r = nd / Math.max(1, pinchRef.current.dist); viewRef.current.scale = Math.max(1, Math.min(300, pinchRef.current.scale / r)); syncView(); } else if (e.touches.length === 1 && dragRef.current.active) { e.preventDefault(); const t = e.touches[0]; viewRef.current.cx = dragRef.current.scx - (t.clientX - dragRef.current.sx) * viewRef.current.scale; viewRef.current.cz = dragRef.current.scz - (t.clientY - dragRef.current.sy) * viewRef.current.scale; syncView(); } };
    const te = () => { pinchRef.current = null; };
    window.addEventListener('touchstart', ts, { passive: false }); window.addEventListener('touchmove', tm, { passive: false }); window.addEventListener('touchend', te);
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', te); };
  }, [syncView]);

  // Wheel
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const wh = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); const before = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height); viewRef.current.scale = Math.max(1, Math.min(300, viewRef.current.scale * (e.deltaY > 0 ? 1.2 : 1 / 1.2))); const after = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height); viewRef.current.cx += before.wx - after.wx; viewRef.current.cz += before.wz - after.wz; syncView(); };
    el.addEventListener('wheel', wh, { passive: false }); return () => el.removeEventListener('wheel', wh);
  }, [syncView, stow]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'crosshair', touchAction: 'none' }} onPointerDown={onPointerDown}>
      {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'monospace', fontSize: 14 }}>Loading...</div>}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none', zIndex: 5 }}>
        <span style={{ color: '#c8c8e0', fontSize: 11, fontFamily: 'monospace', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{scaleLabel.blocks.toLocaleString()} blocks</span>
        <div style={{ width: scaleLabel.px, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(180,150,255,0.4), rgba(180,150,255,0.7), rgba(180,150,255,0.4))', boxShadow: '0 1px 6px rgba(0,0,0,0.5)', transition: 'width 0.12s ease' }} />
      </div>
    </div>
  );
}
