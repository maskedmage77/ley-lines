import { useState, useMemo, useCallback } from 'react';
import type { LeyParams } from '../Types';

// ── Seeded PRNG ──────────────────────────────────
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Types ────────────────────────────────────────
interface GlobalCurve {
  slope: number;
  intercept: number;
  amplitude: number;
  frequency: number;
  phase: number;
}

export interface PolySegment {
  x1: number; z1: number; x2: number; z2: number;
  alpha: number;  // opacity for tapering (1.0 = full, 0.0 = transparent)
  color: 'major' | 'local';
}

export interface LeyIntersection {
  x: number;
  z: number;
}

// ── Evaluate global curve ────────────────────────
function curveZ(c: GlobalCurve, x: number): number {
  return c.slope * x + c.intercept + c.amplitude * Math.sin(c.frequency * x + c.phase);
}

// ── Major ley lines (global, continent-scale) ────
function generateMajorCurves(seed: number): GlobalCurve[] {
  const rng = mulberry32(seed + 7777);
  const curves: GlobalCurve[] = [];
  const worldExtent = 120000;
  const families = 8;
  const linesPerFamily = 4;
  const baseRotation = rng() * Math.PI * 2;

  for (let f = 0; f < families; f++) {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const familyAngle = baseRotation + goldenAngle * f;
    const wrappedAngle = ((familyAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // Avoid near-vertical angles
    const adjustedAngle =
      wrappedAngle > Math.PI * 0.4 && wrappedAngle < Math.PI * 0.6
        ? wrappedAngle + 0.3
        : wrappedAngle > Math.PI * 1.4 && wrappedAngle < Math.PI * 1.6
          ? wrappedAngle + 0.3
          : wrappedAngle;

    const familySeed = mulberry32(seed + f * 1000033 + 7777);

    for (let l = 0; l < linesPerFamily; l++) {
      const angle = adjustedAngle + (familySeed() - 0.5) * 0.12;
      curves.push({
        slope: Math.tan(angle),
        intercept:
          (l / (linesPerFamily - 1) - 0.5) * worldExtent * 1.6 +
          (familySeed() - 0.5) * 15000,
        amplitude: 300 + familySeed() * 500,
        frequency: (0.8 + familySeed() * 2.2) / worldExtent,
        phase: familySeed() * Math.PI * 2,
      });
    }
  }
  return curves;
}

// ── Local ley lines (short, random, infinite, viewport-based) ──
interface LocalLine {
  ax: number; az: number; // start
  bx: number; bz: number; // end
  cpx: number; cpz: number; // bezier control point
  length: number; // for taper calculation
}

function generateLocalLines(
  seed: number,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number
): LocalLine[] {
  // Use a coarse grid to place local lines deterministically
  const cellSize = 6000;
  const cxMin = Math.floor(xMin / cellSize) - 1;
  const cxMax = Math.ceil(xMax / cellSize) + 1;
  const czMin = Math.floor(zMin / cellSize) - 1;
  const czMax = Math.ceil(zMax / cellSize) + 1;

  const lines: LocalLine[] = [];

  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cz = czMin; cz <= czMax; cz++) {
      const cellRng = mulberry32(seed + cx * 15485863 + cz * 32452843 + 99999);
      const count = cellRng() < 0.3 ? 0 : cellRng() < 0.7 ? 1 : cellRng() < 0.9 ? 2 : 3;

      for (let i = 0; i < count; i++) {
        // Random start within cell
        const ax = cx * cellSize + cellRng() * cellSize;
        const az = cz * cellSize + cellRng() * cellSize;

        // Random length: 750–15000 blocks
        const len = 750 + cellRng() * 14250;

        // Random direction
        const angle = cellRng() * Math.PI * 2;
        const bx = ax + Math.cos(angle) * len;
        const bz = az + Math.sin(angle) * len;

        // Control point for gentle bezier curve
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const nx = Math.cos(angle + Math.PI / 2);
        const nz = Math.sin(angle + Math.PI / 2);
        const curveMag = len * (cellRng() * 0.3 - 0.15);
        const cpx = mx + nx * curveMag;
        const cpz = mz + nz * curveMag;

        lines.push({ ax, az, bx, bz, cpx, cpz, length: len });
      }
    }
  }
  return lines;
}

// ── Sample local lines into viewport segments ────
function sampleLocalSegments(
  lines: LocalLine[],
  xMin: number,
  xMax: number,
  maxSegLen: number
): PolySegment[] {
  const segments: PolySegment[] = [];

  for (const line of lines) {
    // Sample the bezier curve
    const totalLen = line.length;
    const steps = Math.ceil(totalLen / maxSegLen);

    let prevX = line.ax;
    let prevZ = line.az;
    let prevT = 0;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = u * u * line.ax + 2 * u * t * line.cpx + t * t * line.bx;
      const z = u * u * line.az + 2 * u * t * line.cpz + t * t * line.bz;

      // Only include if segment overlaps viewport
      const segMinX = Math.min(prevX, x);
      const segMaxX = Math.max(prevX, x);
      if (segMaxX >= xMin && segMinX <= xMax) {
        // Taper alpha: 0 → 1 over first 15% of line, 1 → 0 over last 15%
        const taperStart = Math.min(1, prevT / 0.15);
        const taperEnd = Math.min(1, (1 - t) / 0.15);
        const alpha = Math.min(taperStart, taperEnd);

        segments.push({ x1: prevX, z1: prevZ, x2: x, z2: z, alpha, color: 'local' });
      }

      prevX = x;
      prevZ = z;
      prevT = t;
    }
  }

  return segments;
}

// ── Sample major curves into segments ────────────
function sampleMajorSegments(
  curves: GlobalCurve[],
  xMin: number,
  xMax: number,
  maxSegLen: number
): PolySegment[] {
  const segments: PolySegment[] = [];
  const steps = Math.ceil((xMax - xMin) / maxSegLen);

  for (const c of curves) {
    let prevX = xMin;
    let prevZ = curveZ(c, xMin);
    for (let i = 1; i <= steps; i++) {
      const x = xMin + ((xMax - xMin) * i) / steps;
      const z = curveZ(c, x);
      segments.push({ x1: prevX, z1: prevZ, x2: x, z2: z, alpha: 1, color: 'major' });
      prevX = x;
      prevZ = z;
    }
  }
  return segments;
}

// ── Find major × major intersections ─────────────
function findIntersections(
  curves: GlobalCurve[],
  xMin: number,
  xMax: number,
  threshold: number
): LeyIntersection[] {
  const result: LeyIntersection[] = [];

  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const a = curves[i];
      const b = curves[j];
      const diff = (x: number) => curveZ(a, x) - curveZ(b, x);

      const scanN = 1200;
      const scanDx = (xMax - xMin) / scanN;
      let prevX = xMin;
      let prevD = diff(prevX);

      for (let k = 1; k <= scanN; k++) {
        const x = xMin + scanDx * k;
        const d = diff(x);

        if (prevD * d <= 0 && Math.abs(prevD) + Math.abs(d) > 1e-10) {
          let rx = (prevX + x) / 2;
          for (let iter = 0; iter < 30; iter++) {
            const f = diff(rx);
            const h = Math.max(0.05, Math.abs(rx) * 1e-7);
            const df = (diff(rx + h) - diff(rx - h)) / (2 * h);
            if (Math.abs(df) < 1e-14) break;
            rx -= f / df;
            if (Math.abs(f / df) < 0.001) break;
          }
          if (Math.abs(diff(rx)) < threshold) {
            result.push({ x: rx, z: curveZ(a, rx) });
          }
        }
        prevX = x;
        prevD = d;
      }
    }
  }
  return result;
}

// ── Distance & signal ────────────────────────────
function distanceToCurve(c: GlobalCurve, px: number, pz: number): number {
  const scanWindow = 2000;
  const steps = 200;
  const stepDx = (2 * scanWindow) / steps;
  let minDist = Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = px - scanWindow + stepDx * i;
    const z = curveZ(c, x);
    const d = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function distanceToLocalLine(line: LocalLine, px: number, pz: number): number {
  // Sample the bezier at regular intervals to find closest point
  const steps = 80;
  let minDist = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * line.ax + 2 * u * t * line.cpx + t * t * line.bx;
    const z = u * u * line.az + 2 * u * t * line.cpz + t * t * line.bz;
    const d = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ── Hook ─────────────────────────────────────────
export function useLeyLines(params: LeyParams) {
  const [playerX, setPlayerX] = useState(0);
  const [playerZ, setPlayerZ] = useState(0);

  // Major curves — fixed set from seed
  const majorCurves = useMemo(() => generateMajorCurves(params.seed), [params.seed]);

  // Compute data for the current viewport (we use a large fixed window for the demo;
  // in a real mod this would be per-chunk based on player position)
  const worldExtent = 600000;

  const { segments, intersections } = useMemo(() => {
    const xMin = -worldExtent;
    const xMax = worldExtent;
    const maxSegLen = params.cellSize * 0.4;

    // Major lines
    const majorSegs = sampleMajorSegments(majorCurves, xMin, xMax, maxSegLen);

    // Local lines — viewport-based, infinite
    const localLines = generateLocalLines(params.seed, xMin, xMax, xMin, xMax);
    const localSegs = sampleLocalSegments(localLines, xMin, xMax, maxSegLen * 0.5);

    // Intersections (major × major only for now)
    const ints = findIntersections(majorCurves, xMin, xMax, Math.max(5, params.cellSize * 0.08));

    return {
      segments: [...majorSegs, ...localSegs],
      intersections: ints,
      localLines, // store for signal calc
    };
  }, [majorCurves, params.seed, params.cellSize, worldExtent]);

  // Signal: major lines up to 15 each, local lines up to 7 each, local taper
  const { signal, nearestDist, inRange } = useMemo(() => {
    let totalSignal = 0;
    let nearestLine = Infinity;

    // Major curves
    for (const c of majorCurves) {
      const dist = distanceToCurve(c, playerX, playerZ);
      if (dist < nearestLine) nearestLine = dist;
      if (dist < params.detectRadius) {
        totalSignal += Math.floor(15 * (1 - dist / params.detectRadius));
      }
    }

    // Local lines — regenerate local set for signal calc near player
    const nearbyLocalLines = generateLocalLines(
      params.seed,
      playerX - params.detectRadius,
      playerX + params.detectRadius,
      playerZ - params.detectRadius,
      playerZ + params.detectRadius
    );

    for (const line of nearbyLocalLines) {
      const dist = distanceToLocalLine(line, playerX, playerZ);
      if (dist < nearestLine) nearestLine = dist;
      if (dist < params.detectRadius) {
        // Half strength: up to 7
        let contribution = Math.floor(7 * (1 - dist / params.detectRadius));

        // Taper at line ends: find t along the line closest to player
        const bestT = findClosestT(line, playerX, playerZ);
        const taperStart = Math.min(1, bestT / 0.15);
        const taperEnd = Math.min(1, (1 - bestT) / 0.15);
        contribution = Math.floor(contribution * Math.min(taperStart, taperEnd));

        totalSignal += contribution;
      }
    }

    // Count intersections in range
    let inRange = 0;
    for (const int of intersections) {
      const dx = playerX - int.x;
      const dz = playerZ - int.z;
      if (Math.sqrt(dx * dx + dz * dz) < params.detectRadius) inRange++;
    }

    return {
      signal: Math.min(100, totalSignal),
      nearestDist: nearestLine,
      inRange,
    };
  }, [playerX, playerZ, majorCurves, params.seed, params.detectRadius, intersections]);

  return {
    segments,
    intersections,
    playerX,
    playerZ,
    signal,
    nearestDist,
    inRange,
    globalCurveCount: majorCurves.length,
    movePlayer: useCallback(
      (x: number, z: number) => {
        setPlayerX(x);
        setPlayerZ(z);
      },
      []
    ),
  } as const;
}

// Find the t parameter (0-1) on the bezier line closest to (px, pz)
function findClosestT(line: LocalLine, px: number, pz: number): number {
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const u = 1 - t;
    const x = u * u * line.ax + 2 * u * t * line.cpx + t * t * line.bx;
    const z = u * u * line.az + 2 * u * t * line.cpz + t * t * line.bz;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  return bestT;
}
