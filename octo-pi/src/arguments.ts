export interface ParsedCommandArgs {
  topic: string | undefined;
  modelsFlag: string | undefined;
  maxRounds: number;
}

export type ResearchIntensity = "quick" | "standard" | "deep";
export type ResearchBreadth = "light" | "standard" | "exhaustive";

export interface ParsedResearchArgs {
  topic: string | undefined;
  modelsFlag: string | undefined;
  breadth: ResearchBreadth | undefined;
  intensity: ResearchIntensity | undefined;
  effectiveIntensity: ResearchIntensity | undefined;
}

const DEFAULT_MAX_ROUNDS = 3;
const MIN_MAX_ROUNDS = 1;
const MAX_MAX_ROUNDS = 10;

export function parseCommandArgs(args: string): ParsedCommandArgs {
  let remaining = args.trim();
  let modelsFlag: string | undefined;
  let maxRounds = DEFAULT_MAX_ROUNDS;

  const modelsMatch = remaining.match(/--models\s+(\S+)/);
  if (modelsMatch) {
    modelsFlag = modelsMatch[1];
    remaining = remaining.replace(modelsMatch[0], "").trim();
  }

  const maxRoundsMatch = remaining.match(/--max-rounds\s+(\S+)/);
  if (maxRoundsMatch) {
    maxRounds = parseMaxRounds(maxRoundsMatch[1]);
    remaining = remaining.replace(maxRoundsMatch[0], "").trim();
  }

  const topic = remaining || undefined;
  return { topic, modelsFlag, maxRounds };
}

export function parseResearchArgs(args: string): ParsedResearchArgs {
  let remaining = args.trim();
  let modelsFlag: string | undefined;
  let breadth: ResearchBreadth | undefined;
  let intensity: ResearchIntensity | undefined;

  const modelsMatch = remaining.match(/--models(?:=|\s+)(\S+)/);
  if (modelsMatch) {
    modelsFlag = modelsMatch[1];
    remaining = remaining.replace(modelsMatch[0], "").trim();
  }

  const breadthMatch = remaining.match(/--breadth(?:=|\s+)(\S+)/);
  if (breadthMatch) {
    breadth = parseBreadth(breadthMatch[1]);
    remaining = remaining.replace(breadthMatch[0], "").trim();
  }

  const intensityMatch = remaining.match(/--intensity(?:=|\s+)(\S+)/);
  if (intensityMatch) {
    intensity = parseIntensity(intensityMatch[1]);
    remaining = remaining.replace(intensityMatch[0], "").trim();
  }

  const effectiveIntensity = intensity ?? (breadth ? mapBreadthToIntensity(breadth) : undefined);
  return { topic: remaining || undefined, modelsFlag, breadth, intensity, effectiveIntensity };
}

export function mapBreadthToIntensity(breadth: ResearchBreadth): ResearchIntensity {
  switch (breadth) {
    case "light":
      return "quick";
    case "standard":
      return "standard";
    case "exhaustive":
      return "deep";
  }
}

export function parseModelsFlag(flag: string): string[] {
  const seen = new Set<string>();
  const selectors: string[] = [];
  for (const selector of flag.split(",")) {
    const trimmed = selector.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    selectors.push(trimmed);
  }
  return selectors;
}

function parseMaxRounds(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error("--max-rounds must be an integer from 1 to 10");
  }
  const value = Number(raw);
  if (value < MIN_MAX_ROUNDS || value > MAX_MAX_ROUNDS) {
    throw new Error("--max-rounds must be an integer from 1 to 10");
  }
  return value;
}

function parseBreadth(raw: string): ResearchBreadth {
  if (raw === "light" || raw === "standard" || raw === "exhaustive") {
    return raw;
  }
  throw new Error("--breadth must be one of: light, standard, exhaustive");
}

function parseIntensity(raw: string): ResearchIntensity {
  if (raw === "quick" || raw === "standard" || raw === "deep") {
    return raw;
  }
  throw new Error("--intensity must be one of: quick, standard, deep");
}
