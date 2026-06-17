import type { ScenarioKey } from './scenarioFilters';

const SCENARIO_GRADIENT_LAYOUTS = [
  { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
  { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
  { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { start: { x: 0.15, y: 1 }, end: { x: 0.85, y: 0 } },
  { start: { x: 0, y: 0.25 }, end: { x: 1, y: 0.75 } },
  { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
] as const;

export function scenarioGradientLayout(scenario: ScenarioKey) {
  let hash = 0;
  for (let i = 0; i < scenario.length; i++) {
    hash = (hash * 31 + scenario.charCodeAt(i)) | 0;
  }
  return SCENARIO_GRADIENT_LAYOUTS[Math.abs(hash) % SCENARIO_GRADIENT_LAYOUTS.length];
}
