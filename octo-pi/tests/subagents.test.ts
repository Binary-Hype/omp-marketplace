import { describe, expect, it } from "bun:test";
import {
  buildParticipantPrompt,
  buildResearchParticipantPrompt,
  deduplicateParticipants,
  sanitizeErrorMessage,
  validateModelSelector,
} from "../src/subagents";

describe("buildParticipantPrompt", () => {
  it("includes role, prompt, isolation instructions, and prior summary", () => {
    const prompt = buildParticipantPrompt(
      { model: "openai/gpt-4", role: "Skeptic", prompt: "Find risks" },
      "Shared prompt",
      "debate",
      "Round 1 found deployment risk.",
    );

    expect(prompt).toContain("Role: Skeptic");
    expect(prompt).toContain("Find risks");
    expect(prompt).toContain("Prior round synthesis");
    expect(prompt).toContain("Round 1 found deployment risk.");
    expect(prompt).toContain("no tools");
    expect(prompt).toContain("no file access");
    expect(prompt).toContain("no skills");
    expect(prompt).toContain("no external lookups");
    expect(prompt).toContain("Do not ask clarifying questions");
  });

  it("uses the shared prompt when no participant prompt is provided", () => {
    const prompt = buildParticipantPrompt(
      { model: "openai/gpt-4", role: "Implementer" },
      "Shared prompt",
      "brainstorm",
    );

    expect(prompt).toContain("Role: Implementer");
    expect(prompt).toContain("Shared prompt");
  });
});

describe("buildResearchParticipantPrompt", () => {
  it("requires citations, attribution, and read-only behavior", () => {
    const prompt = buildResearchParticipantPrompt(
      { model: "openai/gpt-4", role: "Primary source reviewer", prompt: "Research X" },
      "Shared research",
      "deep",
    );

    expect(prompt).toContain("Role: Primary source reviewer");
    expect(prompt).toContain("Research X");
    expect(prompt).toContain("Research intensity: deep");
    expect(prompt).toContain("web_search and read");
    expect(prompt).toContain("Do not write files");
    expect(prompt).toContain("execute shell commands");
    expect(prompt).toContain("Cite source URLs");
    expect(prompt).toContain("[Inference]");
    expect(prompt).toContain("provider opinion");
    expect(prompt).toContain("Disagreements & Gaps");
  });

  it("uses the shared research prompt when no participant prompt is provided", () => {
    const prompt = buildResearchParticipantPrompt(
      { model: "openai/gpt-4", role: "Gap finder" },
      "Shared research",
      "quick",
    );

    expect(prompt).toContain("Role: Gap finder");
    expect(prompt).toContain("Shared research");
  });
});

describe("sanitizeErrorMessage", () => {
  it("redacts key-like secrets", () => {
    const result = sanitizeErrorMessage(
      "Provider failed: api_key=sk-1234567890abcdef token: abcdefghijklmnopqrstuvwxyz",
    );

    expect(result).toContain("api_key= [REDACTED]");
    expect(result).toContain("token: [REDACTED]");
    expect(result).not.toContain("sk-1234567890abcdef");
    expect(result).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});

describe("deduplicateParticipants", () => {
  it("preserves the first occurrence for each model selector", () => {
    const result = deduplicateParticipants([
      { model: "a/b", role: "First", prompt: "one" },
      { model: "c/d", role: "Second" },
      { model: "a/b", role: "Duplicate", prompt: "two" },
    ]);

    expect(result).toEqual([
      { model: "a/b", role: "First", prompt: "one" },
      { model: "c/d", role: "Second" },
    ]);
  });
});

describe("validateModelSelector", () => {
  it("accepts provider/model selectors", () => {
    expect(() => validateModelSelector("openai/gpt-4")).not.toThrow();
  });

  it("rejects malformed selectors", () => {
    expect(() => validateModelSelector("openai")).toThrow("Invalid model selector");
    expect(() => validateModelSelector("openai/")).toThrow("Invalid model selector");
    expect(() => validateModelSelector("/gpt-4")).toThrow("Invalid model selector");
    expect(() => validateModelSelector("openai/gpt 4")).toThrow("Invalid model selector");
  });
});
