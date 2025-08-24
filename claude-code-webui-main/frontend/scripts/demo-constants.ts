/**
 * Shared constants for demo recording
 */

export const DEMO_SCENARIOS = [
  "basic",
  "codeGeneration",
  "debugging",
  "fileOperations",
] as const;

export type DemoScenario = (typeof DEMO_SCENARIOS)[number];

export type Theme = "light" | "dark" | "both";

export interface RecordingOptions {
  scenario: DemoScenario;
  theme: Theme;
}

// Create scenario object for backwards compatibility
export const DEMO_SCENARIOS_MAP = Object.fromEntries(
  DEMO_SCENARIOS.map((scenario) => [scenario, scenario]),
) as Record<DemoScenario, DemoScenario>;
