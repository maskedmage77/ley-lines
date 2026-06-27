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

interface ViewState {
  cx: number;
  cz: number;
  scale: number;
}

const OFFCANVAS_SIZE = 4096; // world extent in blocks that the overlay image covers

export default function LeyMapCanvas({
  segments,
  intersections,
  playerX,
  playerZ,
  detectRadius,
  onMovePlayer,
  sidebarOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapBgRef = useRef<HTMLDivElement>(null);
  const linesBgRef = useRef<HTMLDivElement>(null);
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ViewState>({ cx: 0, cz: 0, scale: 12 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, scx: 0, scz: 0 });
  const imageLoaded = useRef(false);
  const imgNaturalSize = useRef({ w: 0, h: 0, ox: 0, oz: 0, bw: 0, bh: 0 });
  const [scaleLabel, setScaleLabel] = useState({ blocks: 500, px: 100 });
  const [linesReady, setLinesReady] = useState(false);
  const linesUrlRef = useRef<string | null>(null);

  // Generate the static overlay image once when lines/intersections change
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const size = OFFCANVAS_SIZE;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    const halfWorld = OFFCANVAS_SIZE / 2;
    const worldToCanvas = (wx: number, wz: number) => ({
      x: halfWorld + wx,
      y: halfWorld + wz,
    });

    // Ley lines
    const majorSegs = segments.filter((s) => s.color === 'major');
    ctx.beginPath();
    for (const seg of majorSegs) {
      const a = worldToCanvas(seg.x1, seg.z1);
      const b = worldToCanvas(seg.x2, seg.z2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = 'rgba(200, 160, 255, 0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Local lines
    const localSegs = segments.filter((s) => s.color === 'local');
    for (const seg of localSegs) {
      if (seg.alpha < 0.02) continue;
      const a = worldToCanvas(seg.x1, seg.z1);
      const b = worldToCanvas(seg.x2, seg.z2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(100, 220, 230, ${0.3 * seg.alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Intersections
    for (const int of intersections) {
      const { x, y } = worldToCanvas(int.x, int.z);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#e8d8ff';
      ctx.fill();
    }

    linesUrlRef.current = canvas.toDataURL('image/png');
    setLinesReady(true);
    updateAllBackgrounds();
    drawPlayer();
  }, [segments, intersections]);

  // Load map image
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
          updateAllBackgrounds();
          drawPlayer();
        })
        .catch(() => {
          updateAllBackgrounds();
          drawPlayer();
        });
    };
    img.src = '/duskwood-map.png';
  }, []);

  useEffect(() => {
    setTimeout(() => {
      updateAllBackgrounds();
      drawPlayer();
    }, 150);
  }, [sidebarOpen]);

  const screenToWorld = useCallback(
    (sx: number, sy: number, w: number, h: number) => {
      const { cx, cz, scale } = viewRef.current;
      return { wx: cx + (sx - w / 2) * scale, wz: cz + (sy - h / 2) * scale };
    },
    []
  );

  const updateBackground = useCallback((el: HTMLDivElement | null, _iw: number, _ih: number, ox: number, oz: number, bw: number, bh: number) => {
    if (!el) return;
    const { cx, cz, scale } = viewRef.current;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const worldLeft = cx - (cw / 2) * scale;
    const worldTop = cz - (ch / 2) * scale;
    const sx = (ox - worldLeft) / scale;
    const sy = (oz - worldTop) / scale;
    const dw = bw / scale;
    const dh = bh / scale;
    el.style.backgroundSize = `${dw}px ${dh}px`;
    el.style.backgroundPosition = `${sx}px ${sy}px`;
  }, []);

  const updateAllBackgrounds = useCallback(() => {
    // Map layer
    if (imageLoaded.current) {
      const { ox, oz, bw, bh, w, h } = imgNaturalSize.current;
      updateBackground(mapBgRef.current, w, h, ox, oz, bw, bh);
    }
    // Lines layer
    if (linesUrlRef.current) {
      const halfWorld = OFFCANVAS_SIZE / 2;
      updateBackground(linesBgRef.current, OFFCANVAS_SIZE, OFFCANVAS_SIZE, -halfWorld, -halfWorld, OFFCANVAS_SIZE, OFFCANVAS_SIZE);
    }
  }, [updateBackground]);

  const drawPlayer = useCallback(() => {
    const canvas = playerCanvasRef.current;
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
    const sx = W / 2 + (playerX - cx) / scale;
    const sy = H / 2 + (playerZ - cz) / scale;
    const rPx = detectRadius / scale;

    if (rPx > 1 && rPx < W * 2) {
      ctx.beginPath();
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d0ff';
    ctx.fill();
    ctx.strokeStyle = '#c0a0ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx - 14, sy);
    ctx.lineTo(sx + 14, sy);
    ctx.moveTo(sx, sy - 14);
    ctx.lineTo(sx, sy + 14);
    ctx.strokeStyle = '#e8d0ff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [playerX, playerZ, detectRadius]);

  const syncView = useCallback(() => {
    updateAllBackgrounds();
    drawPlayer();
    const s = viewRef.current.scale;
    const cw = containerRef.current?.clientWidth ?? 800;
    const maxPx = Math.min(200, cw * 0.35);
    const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    let best = nice[0];
    for (const b of nice) { if (b / s <= maxPx) best = b; else break; }
    setScaleLabel({ blocks: best, px: Math.round(best / s) });
  }, [updateAllBackgrounds, drawPlayer]);

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, scx: viewRef.current.cx, scz: viewRef.current.cz };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const scale = viewRef.current.scale;
      viewRef.current.cx = dragRef.current.scx - (e.clientX - dragRef.current.sx) * scale;
      viewRef.current.cz = dragRef.current.scz - (e.clientY - dragRef.current.sy) * scale;
      syncView();
    };
    const onUp = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.sx;
      const dy = e.clientY - dragRef.current.sy;
      dragRef.current.active = false;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const { wx, wz } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        onMovePlayer(Math.round(wx), Math.round(wz));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [syncView, screenToWorld, onMovePlayer]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const before = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    viewRef.current.scale = Math.max(1, Math.min(300, viewRef.current.scale * factor));
    const after = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    viewRef.current.cx += before.wx - after.wx;
    viewRef.current.cz += before.wz - after.wz;
    syncView();
  }, [screenToWorld, syncView]);

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
        flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'hidden',
        cursor: 'crosshair', background: '#06060e',
      }}
      onMouseDown={onMouseDown}
    >
      {/* Map background */}
      <div ref={mapBgRef} style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/duskwood-map.png)', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none' }} />
      {/* Ley lines overlay — pre-rendered, CSS-panned */}
      {linesReady && linesUrlRef.current && (
        <div ref={linesBgRef} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${linesUrlRef.current})`, backgroundRepeat: 'no-repeat', imageRendering: 'auto', pointerEvents: 'none' }} />
      )}
      {/* Player dot */}
      <canvas ref={playerCanvasRef} style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />
      {/* Scale bar */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none', zIndex: 5 }}>
        <span style={{ color: '#c8c8e0', fontSize: 11, fontFamily: 'monospace', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{scaleLabel.blocks.toLocaleString()} blocks</span>
        <div style={{ width: scaleLabel.px, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(180,150,255,0.4), rgba(180,150,255,0.7), rgba(180,150,255,0.4))', boxShadow: '0 1px 6px rgba(0,0,0,0.5)', transition: 'width 0.12s ease' }} />
      </div>
    </div>
  );
}
