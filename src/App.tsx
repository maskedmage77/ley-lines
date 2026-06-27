import { useState } from 'react';
import { createTheme, MantineProvider } from '@mantine/core';
import LeyMapCanvas from './Components/LeyMapCanvas';
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

  const {
    segments,
    intersections,
    playerX,
    playerZ,
    signal,
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
        <LeyMapCanvas
          segments={segments}
          intersections={intersections}
          detectRadius={params.detectRadius}
          onMovePlayer={movePlayer}
          sidebarOpen={sidebarOpen}
        />
      </div>
    </MantineProvider>
  );
}
