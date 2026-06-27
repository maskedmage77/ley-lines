import {
  Paper,
  Stack,
  Slider,
  Text,
  Button,
  Group,
  Badge,
  Divider,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import {
  Shuffle,
  Compass,
  Lightning,
  GitMerge,
  Eye,
  CaretRight,
  CaretLeft,
  Crosshair,
} from 'phosphor-react';
import type { LeyParams } from '../Types';

interface Props {
  params: LeyParams;
  onChange: (params: LeyParams) => void;
  majorSignal: number;
  localSignal: number;
  signal: number;
  nearestDist: number;
  inRange: number;
  totalIntersections: number;
  totalLines: number;
  playerX: number;
  playerZ: number;
  open: boolean;
  onToggle: () => void;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" fw={500}>{value}</Text>
    </Group>
  );
}

export default function ControlPanel({
  params,
  onChange,
  majorSignal,
  localSignal,
  signal,
  nearestDist,
  inRange,
  totalIntersections,
  totalLines,
  playerX,
  playerZ,
  open,
  onToggle,
}: Props) {
  const signalColor =
    signal > 80 ? 'violet' : signal > 40 ? 'grape' : signal > 0 ? 'gray' : 'dark';

  return (
    <div style={{ position: 'relative', flexShrink: 0, zIndex: 10 }}>
      {/* Toggle button — always visible */}
      <ActionIcon
        onClick={onToggle}
        variant="subtle"
        color="violet"
        size="lg"
        radius="xl"
        style={{
          position: 'fixed',
          top: 12,
          left: open ? 284 : 12,
          zIndex: 30,
          border: '2px solid #6a5acd',
          boxShadow: '0 0 12px rgba(120,80,200,0.5)',
          width: 44,
          height: 44,
          background: 'rgba(30,20,60,0.9)',
          transition: 'left 0.2s ease',
        }}
      >
        {open ? <CaretLeft size={20} /> : <CaretRight size={20} />}
      </ActionIcon>

      <div style={{ display: open ? 'block' : 'none' }}>
        <Paper
          w={280}
          style={{
            background: '#0c0c1a',
            borderRight: '1px solid #1e1e3a',
            overflowY: 'auto',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          radius={0}
        >
          <Stack gap="sm" p="sm" style={{ flex: 1 }}>
            <Group gap="sm">
              <Lightning size={20} weight="fill" color="#b8a0ff" />
              <Text fw={700} size="md" style={{ color: '#b8a0ff', letterSpacing: 0.5 }}>
                Ley Lines
              </Text>
            </Group>

            <Divider color="#1e1e3a" />

            {/* Crystal Signal */}
            <Paper p="sm" radius="md" style={{ background: '#101028' }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Crystal Signal
                  </Text>
                  <Badge size="lg" color={signalColor} variant="filled">
                    {signal} / 100
                  </Badge>
                </Group>
                <div style={{ height: 4, background: '#1a1a32', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(signal / 100) * 100}%`,
                      background: 'linear-gradient(90deg, #4a3a8a, #b8a0ff)',
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <Group justify="space-between">
                  <Group gap={4}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#b8a0ff' }} /><Text size="xs" c="dimmed">Major</Text></Group>
                  <Text size="xs" fw={500}>{majorSignal}</Text>
                </Group>
                <Group justify="space-between">
                  <Group gap={4}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#64d2d8' }} /><Text size="xs" c="dimmed">Local</Text></Group>
                  <Text size="xs" fw={500}>{localSignal}</Text>
                </Group>
                <StatRow
                  label="Nearest line"
                  value={nearestDist < Infinity ? `${Math.round(nearestDist).toLocaleString()} blk` : '—'}
                />
                <StatRow label="Crossings in range" value={String(inRange)} />
              </Stack>
            </Paper>

            {/* Stats */}
            <Paper p="sm" radius="md" style={{ background: '#101028' }}>
              <Stack gap="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>World</Text>
                <StatRow label="Intersections" value={totalIntersections.toLocaleString()} />
                <StatRow label="Curves" value={totalLines.toLocaleString()} />
              </Stack>
            </Paper>

            {/* Player */}
            <Paper p="sm" radius="md" style={{ background: '#101028' }}>
              <Group gap="sm">
                <Crosshair size={14} color="#b8a0ff" />
                <Text size="sm" ff="monospace">
                  {Math.round(playerX).toLocaleString()}, {Math.round(playerZ).toLocaleString()}
                </Text>
              </Group>
            </Paper>

            <Divider color="#1e1e3a" label="Params" labelPosition="center" />

            <Stack gap="sm">
              <Tooltip label="Distance between node clusters. Larger = sparser, longer journeys.">
                <Stack gap={2}>
                  <Group justify="space-between">
                    <Group gap={4}>
                      <Compass size={12} color="#8888bb" />
                      <Text size="xs" c="dimmed">Cell Size</Text>
                    </Group>
                    <Text size="xs" fw={600}>{params.cellSize}</Text>
                  </Group>
                  <Slider
                    value={params.cellSize}
                    onChange={(v) => onChange({ ...params, cellSize: v })}
                    min={200} max={1200} step={50}
                    color="violet" size="md"
                  />
                </Stack>
              </Tooltip>

              <Tooltip label="Neighbors per node. More = denser web, more intersections.">
                <Stack gap={2}>
                  <Group justify="space-between">
                    <Group gap={4}>
                      <GitMerge size={12} color="#8888bb" />
                      <Text size="xs" c="dimmed">K Neighbors</Text>
                    </Group>
                    <Text size="xs" fw={600}>{params.kNeighbors}</Text>
                  </Group>
                  <Slider
                    value={params.kNeighbors}
                    onChange={(v) => onChange({ ...params, kNeighbors: v })}
                    min={2} max={5} step={1}
                    color="violet" size="md"
                  />
                </Stack>
              </Tooltip>

              <Tooltip label="Crystal detection range. Upgrade as you explore.">
                <Stack gap={2}>
                  <Group justify="space-between">
                    <Group gap={4}>
                      <Eye size={12} color="#8888bb" />
                      <Text size="xs" c="dimmed">Radius</Text>
                    </Group>
                    <Text size="xs" fw={600}>{params.detectRadius}</Text>
                  </Group>
                  <Slider
                    value={params.detectRadius}
                    onChange={(v) => onChange({ ...params, detectRadius: v })}
                    min={100} max={3000} step={50}
                    color="violet" size="md"
                  />
                </Stack>
              </Tooltip>
            </Stack>

            <Divider color="#1e1e3a" />

            <Button
              onClick={() => onChange({ ...params, seed: Math.floor(Math.random() * 2147483647) })}
              leftSection={<Shuffle size={14} />}
              variant="light" color="violet" fullWidth size="md"
            >
              Seed {params.seed}
            </Button>

            <Text size="xs" c="#555588" ta="center" style={{ lineHeight: 1.5 }}>
              Drag · Scroll · Click
            </Text>
          </Stack>
        </Paper>
      </div>
    </div>
  );
}
