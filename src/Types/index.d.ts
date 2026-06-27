export interface PolySegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  alpha: number;
  color: 'major' | 'local';
}

export interface LeyIntersection {
  x: number;
  z: number;
}

export interface LeyParams {
  cellSize: number;
  kNeighbors: number;
  detectRadius: number;
  seed: number;
}
