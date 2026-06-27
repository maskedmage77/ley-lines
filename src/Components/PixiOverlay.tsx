import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Graphics, Container, BlurFilter } from 'pixi.js';
import type { PolySegment, LeyIntersection } from '../Types';

interface Props {
  segments: PolySegment[];
  intersections: LeyIntersection[];
  playerX: number;
  playerZ: number;
  detectRadius: number;
  onMovePlayer: (x: number, z: number) => void;
  sidebarOpen: boolean;
  mapRef: React.RefObject<HTMLDivElement | null>;
  mapBounds: { ox: number; oz: number; bw: number; bh: number } | null;
}

export default function PixiOverlay({ segments, intersections, playerX, playerZ, detectRadius, onMovePlayer, sidebarOpen, mapRef, mapBounds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const playerRef = useRef<Graphics | null>(null);
  const [scaleLabel, setScaleLabel] = useState({ blocks: 500, px: 100 });
  const [ready, setReady] = useState(false);

  const viewRef = useRef({ cx: 0, cz: 0, scale: 12 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scz: 0 });
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const stow = useCallback((sx: number, sy: number, W: number, H: number) => {
    const { cx, cz, scale } = viewRef.current;
    return { wx: cx + (sx - W / 2) * scale, wz: cz + (sy - H / 2) * scale };
  }, []);

  // ── Init Pixi ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new Application();
    appRef.current = app;

    app.init({
      resizeTo: containerRef.current,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      containerRef.current!.appendChild(app.canvas);
      app.canvas.style.position = 'absolute';
      app.canvas.style.inset = '0';
      app.canvas.style.pointerEvents = 'none';

      const world = new Container();
      worldRef.current = world;
      app.stage.addChild(world);

      const player = new Graphics();
      playerRef.current = player;
      app.stage.addChild(player); // player is in screen space, not world

      setReady(true);
    });

    return () => { app.destroy(true); };
  }, []);

  // ── Draw lines & intersections (when data OR scale changes) ──
  const rebuildGraphics = useCallback(() => {
    if (!ready || !worldRef.current) return;
    const world = worldRef.current;
    const scale = viewRef.current.scale;
    world.removeChildren();

    // Screen-space line widths (constant visual size regardless of zoom)
    const majorWidth = Math.max(1.5, 3 / Math.sqrt(scale));
    const localWidth = Math.max(0.8, 1.8 / Math.sqrt(scale));
    const gridAlpha = Math.max(0.015, 0.04 / scale);

    // Grid
    const grid = new Graphics();
    const gs = 600;
    for (let gx = -15000; gx <= 15000; gx += gs) {
      grid.moveTo(gx, -15000); grid.lineTo(gx, 15000);
    }
    for (let gz = -15000; gz <= 15000; gz += gs) {
      grid.moveTo(-15000, gz); grid.lineTo(15000, gz);
    }
    grid.stroke({ width: Math.max(0.3, 0.5 / scale), color: 0xffffff, alpha: gridAlpha });
    world.addChild(grid);

    // Major lines
    const major = new Graphics();
    for (const s of segments.filter(s => s.color === 'major')) {
      major.moveTo(s.x1, s.z1); major.lineTo(s.x2, s.z2);
    }
    major.stroke({ width: majorWidth, color: 0xc8a0ff, alpha: 0.7 });
    major.filters = [new BlurFilter({ strength: Math.min(1, 1.5 / scale), quality: 2 })];
    world.addChild(major);

    // Local lines
    const local = new Graphics();
    for (const s of segments.filter(s => s.color === 'local')) {
      if (s.alpha < 0.02) continue;
      local.moveTo(s.x1, s.z1); local.lineTo(s.x2, s.z2);
      local.stroke({ width: localWidth, color: 0x64d2d8, alpha: 0.5 * s.alpha });
    }
    world.addChild(local);

    // Intersections
    const dotRadius = Math.max(3, 8 / Math.sqrt(scale));
    const dots = new Graphics();
    for (const int of intersections) {
      dots.circle(int.x, int.z, dotRadius);
      dots.fill({ color: 0xf0e8ff, alpha: 0.9 });
      dots.circle(int.x, int.z, dotRadius * 0.5);
      dots.fill({ color: 0xffffff, alpha: 1 });
    }
    dots.filters = [new BlurFilter({ strength: Math.min(0.5, 1 / scale), quality: 2 })];
    world.addChild(dots);
  }, [segments, intersections, ready]);

  // Rebuild when scale changes significantly (log scale thresholds)
  const lastScaleRef = useRef(0);
  useEffect(() => {
    const s = viewRef.current.scale;
    const threshold = lastScaleRef.current * 1.3;
    if (lastScaleRef.current === 0 || s > threshold || s < lastScaleRef.current / 1.3) {
      lastScaleRef.current = s;
      rebuildGraphics();
    }
  }, [segments, intersections, ready]);

  // ── Sync view transform ────────────────────────
  const syncView = useCallback(() => {
    if (!worldRef.current || !playerRef.current || !appRef.current) return;
    const { cx, cz, scale } = viewRef.current;

    // Rebuild if scale changed significantly
    const threshold = lastScaleRef.current * 1.3;
    if (lastScaleRef.current === 0 || scale > threshold || scale < lastScaleRef.current / 1.3) {
      lastScaleRef.current = scale;
      rebuildGraphics();
    }

    const app = appRef.current;
    const W = app.screen.width;
    const H = app.screen.height;

    // World
    worldRef.current.x = W / 2 - cx / scale;
    worldRef.current.y = H / 2 - cz / scale;
    worldRef.current.scale.set(1 / scale);

    // Map background
    if (mapRef.current && mapBounds) {
      const { ox, oz, bw, bh } = mapBounds;
      const sx = (ox - (cx - (W / 2) * scale)) / scale;
      const sy = (oz - (cz - (H / 2) * scale)) / scale;
      mapRef.current.style.backgroundSize = `${bw / scale}px ${bh / scale}px`;
      mapRef.current.style.backgroundPosition = `${sx}px ${sy}px`;
    }

    // Player: screen-space
    const pg = playerRef.current;
    pg.clear();
    const sx = W / 2 + (playerX - cx) / scale;
    const sy = H / 2 + (playerZ - cz) / scale;
    const rPx = detectRadius / scale;
    if (rPx > 1 && rPx < W * 2) {
      pg.circle(sx, sy, rPx);
      pg.stroke({ width: 2, color: 0xc8a0ff, alpha: 0.4 });
    }
    pg.circle(sx, sy, 8);
    pg.fill({ color: 0xe8d0ff });
    pg.circle(sx, sy, 2);
    pg.fill({ color: 0xffffff });
    pg.moveTo(sx - 14, sy); pg.lineTo(sx + 14, sy);
    pg.moveTo(sx, sy - 14); pg.lineTo(sx, sy + 14);
    pg.stroke({ width: 1.2, color: 0xe8d0ff });

    // Scale bar
    const cw = containerRef.current?.clientWidth ?? 800;
    const maxPx = Math.min(200, cw * 0.35);
    const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    let best = nice[0];
    for (const b of nice) { if (b / scale <= maxPx) best = b; else break; }
    setScaleLabel({ blocks: best, px: Math.round(best / scale) });
  }, [playerX, playerZ, detectRadius, mapBounds, rebuildGraphics]);

  // Redraw on player move
  useEffect(() => { if (ready) syncView(); }, [playerX, playerZ, ready, syncView]);

  // Sidebar resize
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => syncView(), 200);
    return () => clearTimeout(t);
  }, [sidebarOpen, ready]);

  // Resize
  useEffect(() => {
    if (!appRef.current) return;
    const ro = new ResizeObserver(() => {
      if (appRef.current && containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        appRef.current.renderer.resize(width, height);
      }
      syncView();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready, syncView]);

  // ── Mouse / Touch ──────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz };
  };

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      viewRef.current.cx = dragRef.current.scx - (e.clientX - dragRef.current.sx) * viewRef.current.scale;
      viewRef.current.cz = dragRef.current.scz - (e.clientY - dragRef.current.sy) * viewRef.current.scale;
      syncView();
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
  }, [syncView, stow, onMovePlayer]);

  // Touch
  useEffect(() => {
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), scale: viewRef.current.scale };
        dragRef.current.active = false;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { active: true, sx: t.clientX, sy: t.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz };
      }
    };
    const tm = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const ratio = newDist / Math.max(1, pinchRef.current.dist);
        viewRef.current.scale = Math.max(1, Math.min(300, pinchRef.current.scale / ratio));
        syncView();
      } else if (e.touches.length === 1 && dragRef.current.active) {
        e.preventDefault();
        const t = e.touches[0];
        viewRef.current.cx = dragRef.current.scx - (t.clientX - dragRef.current.sx) * viewRef.current.scale;
        viewRef.current.cz = dragRef.current.scz - (t.clientY - dragRef.current.sy) * viewRef.current.scale;
        syncView();
      }
    };
    const te = () => { pinchRef.current = null; };
    window.addEventListener('touchstart', ts, { passive: false });
    window.addEventListener('touchmove', tm, { passive: false });
    window.addEventListener('touchend', te);
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', te); };
  }, [syncView]);

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const before = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      viewRef.current.scale = Math.max(1, Math.min(300, viewRef.current.scale * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
      const after = stow(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      viewRef.current.cx += before.wx - after.wx;
      viewRef.current.cz += before.wz - after.wz;
      syncView();
    };
    el.addEventListener('wheel', wh, { passive: false });
    return () => el.removeEventListener('wheel', wh);
  }, [syncView, stow]);

  // Initial draw
  useEffect(() => { if (ready) syncView(); }, [ready]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={onPointerDown}
    >
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'monospace', fontSize: 14 }}>
          Loading Pixi...
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none', zIndex: 5 }}>
        <span style={{ color: '#c8c8e0', fontSize: 11, fontFamily: 'monospace', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{scaleLabel.blocks.toLocaleString()} blocks</span>
        <div style={{ width: scaleLabel.px, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(180,150,255,0.4), rgba(180,150,255,0.7), rgba(180,150,255,0.4))', boxShadow: '0 1px 6px rgba(0,0,0,0.5)', transition: 'width 0.12s ease' }} />
      </div>
    </div>
  );
}
