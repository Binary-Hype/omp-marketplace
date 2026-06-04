import { describe, expect, it } from "bun:test";
import { orchestratorKickoffPrompt, researchOrchestratorPrompt } from "../src/prompts";

describe("orchestratorKickoffPrompt", () => {
  it("contains mode and topic", () => {
    const prompt = orchestratorKickoffPrompt({ mode: "debate", topic: "Should we use Redis?", selectedModels: ["openai/gpt-4", "anthropic/claude-sonnet"], maxRounds: 3 });
    expect(prompt).toContain("debate");
    expect(prompt).toContain("Should we use Redis?");
    expect(prompt).toContain("openai/gpt-4");
    expect(prompt).toContain("anthropic/claude-sonnet");
  });

  it("contains role palette for debate", () => {
    const prompt = orchestratorKickoffPrompt({ mode: "debate", topic: "X", selectedModels: ["a/b"], maxRounds: 3 });
    expect(prompt).toContain("Proponent / steelman");
    expect(prompt).toContain("Skeptic / red-team");
  });

  it("contains role palette for brainstorm", () => {
    const prompt = orchestratorKickoffPrompt({ mode: "brainstorm", topic: "X", selectedModels: ["a/b"], maxRounds: 3 });
    expect(prompt).toContain("Technical feasibility analyst");
    expect(prompt).toContain("Lateral thinker");
  });

  it("instructs to call octopus_multi_model_round", () => {
    const prompt = orchestratorKickoffPrompt({ mode: "debate", topic: "X", selectedModels: ["a/b"], maxRounds: 3 });
    expect(prompt).toContain("octopus_multi_model_round");
    expect(prompt).toContain("octopus_next_step");
  });

  it("contains synthesis instructions for debate", () => {
    const prompt = orchestratorKickoffPrompt({ mode: "debate", topic: "X", selectedModels: ["a/b"], maxRounds: 3 });
    expect(prompt).toContain("AGREEMENT");
    expect(prompt).toContain("DISAGREEMENT");
  });

  it("contains synthesis instructions for brainstorm", () => {
    const prompt = orchestratorKickoffPrompt({ mode: "brainstorm", topic: "X", selectedModels: ["a/b"], maxRounds: 3 });
    expect(prompt).toContain("CONVERGENCE");
    expect(prompt).toContain("DIVERGENCE");
  });

  it("instructs later rounds to include prior summary and respect round limit", () => {
    const prompt = orchestratorKickoffPrompt({
      mode: "debate",
      topic: "X",
      selectedModels: ["a/b"],
      maxRounds: 2,
    });
    expect(prompt).toContain("priorSummary");
    expect(prompt).toContain("configured round limit is 2");
  });
});

describe("researchOrchestratorPrompt", () => {
  it("contains research tool contract and mandatory sections", () => {
    const prompt = researchOrchestratorPrompt({
      topic: "AI in radiology",
      selectedModels: ["openai/gpt-5", "anthropic/claude-sonnet"],
      intensity: "deep",
    });

    expect(prompt).toContain("AI in radiology");
    expect(prompt).toContain("openai/gpt-5");
    expect(prompt).toContain("anthropic/claude-sonnet");
    expect(prompt).toContain("deep");
    expect(prompt).toContain("octopus_research_round");
    expect(prompt).toContain("exactly once");
    expect(prompt).toContain("🐙 Octopus Research");
    expect(prompt).toContain("## Executive Summary");
    expect(prompt).toContain("## Key Themes");
    expect(prompt).toContain("## Key Takeaways");
    expect(prompt).toContain("## Sources & Attribution");
    expect(prompt).toContain("## Methodology");
  });

  it("requires source attribution and gap reporting", () => {
    const prompt = researchOrchestratorPrompt({
      topic: "X",
      selectedModels: ["a/b", "c/d"],
      intensity: "standard",
    });

    expect(prompt).toContain("source-backed findings");
    expect(prompt).toContain("[Inference]");
    expect(prompt).toContain("provider opinion");
    expect(prompt).toContain("evidence gaps");
  });
});
