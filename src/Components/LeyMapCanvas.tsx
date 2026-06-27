import { useEffect, useRef, useCallback, useState } from 'react';
import type { PolySegment, LeyIntersection } from '../Types';

interface Props {
  segments: PolySegment[];
  intersections: LeyIntersection[];
  playerX: number;
  playerZ: number;
  detectRadius: number;
  cellSize: number;
  onMovePlayer: (x: number, z: number) => void;
  sidebarOpen: boolean;
}

interface ViewState {
  cx: number;
  cz: number;
  scale: number;
}

export default function LeyMapCanvas({
  segments,
  intersections,
  playerX,
  playerZ,
  detectRadius,
  cellSize,
  onMovePlayer,
  sidebarOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapBgRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ cx: 0, cz: 0, scale: 12 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scz: 0 });
  const imageLoaded = useRef(false);
  const imgNaturalSize = useRef({ w: 0, h: 0, ox: 0, oz: 0, bw: 0, bh: 0 });
  const overlayRaf = useRef(0);
  const dragging = useRef(false);
  const [scaleLabel, setScaleLabel] = useState({ blocks: 500, px: 100 });

  // Load image + map bounds
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageLoaded.current = true;
      fetch('/duskwood-bounds.json')
        .then((r) => r.json())
        .then((b: { ox: number; oz: number; bw: number; bh: number }) => {
          imgNaturalSize.current = {
            w: img.naturalWidth,
            h: img.naturalHeight,
            ox: b.ox,
            oz: b.oz,
            bw: b.bw,
            bh: b.bh,
          };
          viewRef.current.cx = b.ox + b.bw / 2;
          viewRef.current.cz = b.oz + b.bh / 2;
          updateBackground();
          drawOverlay();
        })
        .catch(() => {
          updateBackground();
          drawOverlay();
        });
    };
    img.src = '/duskwood-map.png';
  }, []);

  // Recenter on sidebar toggle
  useEffect(() => {
    setTimeout(() => {
      updateBackground();
      drawOverlay();
    }, 150);
  }, [sidebarOpen]);

  const worldToScreen = useCallback(
    (wx: number, wz: number, w: number, h: number) => {
      const { cx, cz, scale } = viewRef.current;
      return {
        sx: w / 2 + (wx - cx) / scale,
        sy: h / 2 + (wz - cz) / scale,
      };
    },
    []
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number, w: number, h: number) => {
      const { cx, cz, scale } = viewRef.current;
      return {
        wx: cx + (sx - w / 2) * scale,
        wz: cz + (sy - h / 2) * scale,
      };
    },
    []
  );

  const updateBackground = useCallback(() => {
    const el = mapBgRef.current;
    if (!el || !imageLoaded.current) return;
    const { ox, oz, bw, bh } = imgNaturalSize.current;
    const { cx, cz, scale } = viewRef.current;

    const containerW = el.clientWidth;
    const containerH = el.clientHeight;

    // Map world coords to CSS background-position
    // The image covers world area from (ox, oz) to (ox+bw, oz+bh)
    // We need to position it so that world point (cx, cz) is at screen center
    const worldLeft = cx - (containerW / 2) * scale;
    const worldTop = cz - (containerH / 2) * scale;

    // Where does the image start in world space, relative to viewport left?
    const imgScreenX = (ox - worldLeft) / scale;
    const imgScreenY = (oz - worldTop) / scale;

    // Scale the image: world bw blocks → screen pixels
    const imgDisplayW = bw / scale;
    const imgDisplayH = bh / scale;

    el.style.backgroundSize = `${imgDisplayW}px ${imgDisplayH}px`;
    el.style.backgroundPosition = `${imgScreenX}px ${imgScreenY}px`;
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (W === 0 || H === 0) return;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, W, H);

    const { cx, cz, scale } = viewRef.current;
    const worldLeft = cx - (W / 2) * scale;
    const worldRight = cx + (W / 2) * scale;
    const worldTop = cz - (H / 2) * scale;
    const worldBottom = cz + (H / 2) * scale;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const firstGX = Math.floor(worldLeft / cellSize) * cellSize;
    const firstGZ = Math.floor(worldTop / cellSize) * cellSize;
    for (let gx = firstGX; gx < worldRight; gx += cellSize) {
      const sx = Math.round(W / 2 + (gx - cx) / scale);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.stroke();
    }
    for (let gz = firstGZ; gz < worldBottom; gz += cellSize) {
      const sy = Math.round(H / 2 + (gz - cz) / scale);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
    }

    // Pre-split segments by type
    const majorSegs = segments.filter((s) => s.color === 'major');
    const localSegs = scale < 20
      ? segments.filter((s) => s.color === 'local' && s.alpha > 0.02)
      : []; // skip local lines when zoomed out

    // Major ley lines — purple, batched
    ctx.beginPath();
    for (const seg of majorSegs) {
      const a = worldToScreen(seg.x1, seg.z1, W, H);
      const b = worldToScreen(seg.x2, seg.z2, W, H);
      if (Math.max(a.sx, b.sx) < -50 || Math.min(a.sx, b.sx) > W + 50) continue;
      // Skip sub-pixel segments
      if (Math.abs(b.sx - a.sx) < 0.5 && Math.abs(b.sy - a.sy) < 0.5) continue;
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
    ctx.strokeStyle = 'rgba(180, 140, 255, 0.10)';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    for (const seg of majorSegs) {
      const a = worldToScreen(seg.x1, seg.z1, W, H);
      const b = worldToScreen(seg.x2, seg.z2, W, H);
      if (Math.max(a.sx, b.sx) < -50 || Math.min(a.sx, b.sx) > W + 50) continue;
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
    ctx.strokeStyle = 'rgba(210, 170, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Local ley lines — cyan, unbatched due to per-segment alpha
    for (const seg of localSegs) {
      const a = worldToScreen(seg.x1, seg.z1, W, H);
      const b = worldToScreen(seg.x2, seg.z2, W, H);
      if (Math.max(a.sx, b.sx) < -50 || Math.min(a.sx, b.sx) > W + 50) continue;
      if (Math.abs(b.sx - a.sx) < 0.5 && Math.abs(b.sy - a.sy) < 0.5) continue;

      const aGlow = 0.06 * seg.alpha;
      const aCore = 0.25 * seg.alpha;
      if (aCore < 0.01) continue;

      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.strokeStyle = `rgba(80, 200, 210, ${aGlow})`;
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.strokeStyle = `rgba(100, 220, 230, ${aCore})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Intersections — each dot at exact crossing of two curves
    for (const int of intersections) {
      const { sx, sy } = worldToScreen(int.x, int.z, W, H);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

      const glowR = 12;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      g.addColorStop(0, 'rgba(240, 200, 255, 0.9)');
      g.addColorStop(0.3, 'rgba(180, 140, 250, 0.5)');
      g.addColorStop(1, 'rgba(80, 40, 150, 0)');
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f8f0ff';
      ctx.fill();
      ctx.strokeStyle = '#d0c0ff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Player
    const ps = worldToScreen(playerX, playerZ, W, H);
    const rPx = detectRadius / scale;
    if (rPx > 1 && rPx < W * 2) {
      ctx.beginPath();
      ctx.arc(ps.sx, ps.sy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(ps.sx, ps.sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d0ff';
    ctx.fill();
    ctx.strokeStyle = '#c0a0ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ps.sx, ps.sy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ps.sx - 14, ps.sy);
    ctx.lineTo(ps.sx + 14, ps.sy);
    ctx.moveTo(ps.sx, ps.sy - 14);
    ctx.lineTo(ps.sx, ps.sy + 14);
    ctx.strokeStyle = '#e8d0ff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [segments, intersections, playerX, playerZ, detectRadius, cellSize, worldToScreen]);

  // Lightweight draw: only player + detection ring during drag
  const drawPlayerOnly = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (W === 0 || H === 0) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { scale } = viewRef.current;
    const ps = worldToScreen(playerX, playerZ, W, H);
    const rPx = detectRadius / scale;

    if (rPx > 1 && rPx < W * 2) {
      ctx.beginPath();
      ctx.arc(ps.sx, ps.sy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(ps.sx, ps.sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d0ff';
    ctx.fill();
    ctx.strokeStyle = '#c0a0ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ps.sx, ps.sy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ps.sx - 14, ps.sy);
    ctx.lineTo(ps.sx + 14, ps.sy);
    ctx.moveTo(ps.sx, ps.sy - 14);
    ctx.lineTo(ps.sx, ps.sy + 14);
    ctx.strokeStyle = '#e8d0ff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [playerX, playerZ, detectRadius, worldToScreen]);

  // Schedule a batched redraw — at most once per frame
  const scheduleDraw = useCallback(() => {
    if (overlayRaf.current) return;
    overlayRaf.current = requestAnimationFrame(() => {
      overlayRaf.current = 0;
      updateBackground();
      if (dragging.current) {
        drawPlayerOnly();
      } else {
        drawOverlay();
      }
      // Update scale bar
      const s = viewRef.current.scale;
      const containerW = containerRef.current?.clientWidth ?? 800;
      const maxPx = Math.min(200, containerW * 0.35);
      const niceBlocks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
      let best = niceBlocks[0];
      for (const b of niceBlocks) {
        if (b / s <= maxPx) best = b;
        else break;
      }
      setScaleLabel({ blocks: best, px: Math.round(best / s) });
    });
  }, [updateBackground, drawOverlay, drawPlayerOnly]);

  // ResizeObserver
  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // Mouse
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      scx: viewRef.current.cx,
      scz: viewRef.current.cz,
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      dragging.current = true;
      const scale = viewRef.current.scale;
      viewRef.current.cx =
        dragRef.current.scx - (e.clientX - dragRef.current.sx) * scale;
      viewRef.current.cz =
        dragRef.current.scz - (e.clientY - dragRef.current.sy) * scale;
      scheduleDraw();
    };
    const onUp = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;
      dragging.current = false;

      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const { wx, wz } = screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height
        );
        onMovePlayer(Math.round(wx), Math.round(wz));
      }
      // Force full redraw after drag ends
      updateBackground();
      drawOverlay();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scheduleDraw, screenToWorld, onMovePlayer]);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = screenToWorld(mx, my, rect.width, rect.height);
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      viewRef.current.scale = Math.max(
        1,
        Math.min(300, viewRef.current.scale * factor)
      );
      const after = screenToWorld(mx, my, rect.width, rect.height);
      viewRef.current.cx += before.wx - after.wx;
      viewRef.current.cz += before.wz - after.wz;
      scheduleDraw();
    },
    [screenToWorld, scheduleDraw]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'crosshair',
        background: '#06060e',
      }}
      onMouseDown={onMouseDown}
    >
      {/* Map background via CSS — GPU accelerated, no canvas drawImage */}
      <div
        ref={mapBgRef}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/duskwood-map.png)',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
      {/* Overlay canvas — transparent, only ley lines + player */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {/* Scale bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <span
          style={{
            color: '#c8c8e0',
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: 500,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          {scaleLabel.blocks.toLocaleString()} blocks
        </span>
        <div
          style={{
            width: scaleLabel.px,
            height: 6,
            borderRadius: 3,
            background:
              'linear-gradient(90deg, rgba(180,150,255,0.4), rgba(180,150,255,0.7), rgba(180,150,255,0.4))',
            boxShadow: '0 1px 6px rgba(0,0,0,0.5)',
            transition: 'width 0.12s ease',
          }}
        />
      </div>
    </div>
  );
}
