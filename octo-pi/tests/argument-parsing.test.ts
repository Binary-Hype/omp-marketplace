import { describe, expect, it } from "bun:test";
import { mapBreadthToIntensity, parseCommandArgs, parseModelsFlag, parseResearchArgs } from "../src/arguments";

describe("parseCommandArgs", () => {
  it("parses topic only", () => {
    const result = parseCommandArgs("Should we use Redis?");
    expect(result.topic).toBe("Should we use Redis?");
    expect(result.modelsFlag).toBeUndefined();
  });

  it("parses --models flag and topic", () => {
    const result = parseCommandArgs(
      "--models openai/gpt-5,anthropic/claude-sonnet Should we use Redis?",
    );
    expect(result.topic).toBe("Should we use Redis?");
    expect(result.modelsFlag).toBe("openai/gpt-5,anthropic/claude-sonnet");
  });

  it("parses --models flag with no topic", () => {
    const result = parseCommandArgs("--models openai/gpt-5");
    expect(result.topic).toBeUndefined();
    expect(result.modelsFlag).toBe("openai/gpt-5");
  });

  it("parses --models flag and --max-rounds with topic", () => {
    const result = parseCommandArgs(
      "--models openai/gpt-5,anthropic/claude-sonnet --max-rounds 2 Should we use Redis?",
    );
    expect(result.topic).toBe("Should we use Redis?");
    expect(result.modelsFlag).toBe("openai/gpt-5,anthropic/claude-sonnet");
    expect(result.maxRounds).toBe(2);
  });

  it("returns undefined for empty args", () => {
    const result = parseCommandArgs("");
    expect(result.topic).toBeUndefined();
    expect(result.modelsFlag).toBeUndefined();
  });

  it("defaults max rounds to 3", () => {
    expect(parseCommandArgs("Topic").maxRounds).toBe(3);
  });

  it("rejects invalid max rounds", () => {
    expect(() => parseCommandArgs("--max-rounds nope Topic")).toThrow("--max-rounds");
  });

  it("rejects out-of-range max rounds", () => {
    expect(() => parseCommandArgs("--max-rounds 11 Topic")).toThrow("--max-rounds");
    expect(() => parseCommandArgs("--max-rounds 0 Topic")).toThrow("--max-rounds");
  });
});


describe("parseResearchArgs", () => {
  it("parses research topic and models", () => {
    const result = parseResearchArgs(
      "--models=openai/gpt-5,anthropic/claude-sonnet Effects of AI on radiology",
    );
    expect(result.topic).toBe("Effects of AI on radiology");
    expect(result.modelsFlag).toBe("openai/gpt-5,anthropic/claude-sonnet");
  });

  it("maps breadth to effective intensity", () => {
    expect(parseResearchArgs("--breadth=light Topic").effectiveIntensity).toBe("quick");
    expect(parseResearchArgs("--breadth standard Topic").effectiveIntensity).toBe("standard");
    expect(parseResearchArgs("--breadth=exhaustive Topic").effectiveIntensity).toBe("deep");
  });

  it("lets explicit intensity win over breadth", () => {
    const result = parseResearchArgs("--breadth=exhaustive --intensity=quick Topic");
    expect(result.breadth).toBe("exhaustive");
    expect(result.intensity).toBe("quick");
    expect(result.effectiveIntensity).toBe("quick");
  });

  it("supports space-form intensity", () => {
    const result = parseResearchArgs("--intensity deep Topic");
    expect(result.topic).toBe("Topic");
    expect(result.effectiveIntensity).toBe("deep");
  });

  it("returns undefined effective intensity when no intensity flags are present", () => {
    expect(parseResearchArgs("Topic").effectiveIntensity).toBeUndefined();
  });

  it("rejects invalid breadth and intensity", () => {
    expect(() => parseResearchArgs("--breadth=wide Topic")).toThrow("--breadth");
    expect(() => parseResearchArgs("--intensity=slow Topic")).toThrow("--intensity");
  });
});

describe("mapBreadthToIntensity", () => {
  it("maps every breadth value", () => {
    expect(mapBreadthToIntensity("light")).toBe("quick");
    expect(mapBreadthToIntensity("standard")).toBe("standard");
    expect(mapBreadthToIntensity("exhaustive")).toBe("deep");
  });
});
describe("parseModelsFlag", () => {
  it("splits comma-separated selectors", () => {
    expect(parseModelsFlag("a/b,c/d")).toEqual(["a/b", "c/d"]);
  });

  it("trims whitespace", () => {
    expect(parseModelsFlag(" a/b , c/d ")).toEqual(["a/b", "c/d"]);
  });

  it("filters empty strings", () => {
    expect(parseModelsFlag("a/b,,c/d")).toEqual(["a/b", "c/d"]);
  });

  it("deduplicates selectors while preserving first occurrence", () => {
    expect(parseModelsFlag("a/b,c/d,a/b,e/f,c/d")).toEqual(["a/b", "c/d", "e/f"]);
  });
});
