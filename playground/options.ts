import { DEFAULT_OPTIONS as CORE_DEFAULT_OPTIONS, type MagneticOptions } from '../effects/magnetic-cards/src/magneticCards.ts';

export type DemoOptions = MagneticOptions;
export const DEFAULT_OPTIONS: DemoOptions = CORE_DEFAULT_OPTIONS;

export const OPTION_RANGES = {
  radius: [80, 420],
  travel: [0, 48],
  responseMs: [70, 500],
  tiltDeg: [0, 24],
  depthPx: [0, 80],
  perspectivePx: [350, 1400],
  glow: [0, 1],
} as const satisfies Record<Exclude<keyof DemoOptions, 'reducedMotion'>, readonly [number, number]>;

export const QUIET_OPTIONS: DemoOptions = {
  ...DEFAULT_OPTIONS,
  radius: 170,
  travel: 10,
  responseMs: 230,
  tiltDeg: 6,
  depthPx: 16,
  perspectivePx: 1000,
  glow: 0.25,
};

export const DEEP_OPTIONS: DemoOptions = {
  ...DEFAULT_OPTIONS,
  radius: 250,
  travel: 28,
  responseMs: 125,
  tiltDeg: 20,
  depthPx: 64,
  perspectivePx: 480,
  glow: 0.85,
};

export function isDemoOptions(value: unknown): value is DemoOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const keys = [...Object.keys(OPTION_RANGES), 'reducedMotion'];
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input))) return false;
  if (typeof input.reducedMotion !== 'boolean') return false;
  return Object.entries(OPTION_RANGES).every(([key, [min, max]]) => {
    const number = input[key];
    return typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max;
  });
}
