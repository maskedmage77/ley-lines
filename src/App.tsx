import { useState, useEffect, useRef } from 'react';
import { createTheme, MantineProvider } from '@mantine/core';
import PixelOverlay from './Components/PixiOverlay';
import ControlPanel from './Components/ControlPanel';
import { useLeyLines } from './Hooks/useLeyLines';
import type { LeyParams } from './Types';

const theme = createTheme({
  fontFamily: 'Jost, system-ui, sans-serif',
  primaryColor: 'violet',
  colors: {
    gray: [
      '#f8f8f8', '#f3f3f3', '#e9e9e9', '#cecece',
      '#adadad', '#868686', '#494949', '#343434',
      '#212121', '#111111',
    ],
  },
});

export default function App() {
  const [params, setParams] = useState<LeyParams>({
    cellSize: 600,
    kNeighbors: 3,
    detectRadius: 1000,
    seed: 42,
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [mapBounds, setMapBounds] = useState<{ ox: number; oz: number; bw: number; bh: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/duskwood-bounds.json').then(r => r.json()).then(setMapBounds);
  }, []);

  const {
    segments,
    intersections,
    playerX,
    playerZ,
    signal,
    majorSignal,
    localSignal,
    nearestDist,
    inRange,
    globalCurveCount,
    movePlayer,
  } = useLeyLines(params);

  return (
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <ControlPanel
          params={params}
          onChange={setParams}
          majorSignal={majorSignal}
          localSignal={localSignal}
          signal={signal}
          nearestDist={nearestDist}
          inRange={inRange}
          totalIntersections={intersections.length}
          totalLines={globalCurveCount}
          playerX={playerX}
          playerZ={playerZ}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
        />
        <div style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'hidden', background: '#020208' }}>
          {mapBounds && (
            <div
              ref={mapRef}
              style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'url(/duskwood-map.png)',
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                filter: 'brightness(0.7)',
              }}
            />
          )}
          <PixelOverlay
            segments={segments}
            intersections={intersections}
            playerX={playerX}
            playerZ={playerZ}
            detectRadius={params.detectRadius}
            onMovePlayer={movePlayer}
            sidebarOpen={sidebarOpen}
            mapRef={mapRef}
            mapBounds={mapBounds}
          />
        </div>
      </div>
    </MantineProvider>
  );
}
