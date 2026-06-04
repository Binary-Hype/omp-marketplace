import { describe, expect, it } from "bun:test";
import { extractAssistantText, formatModelLabel, truncateOutput } from "../src/text";

describe("extractAssistantText", () => {
  it("extracts text from assistant message", () => {
    const msg = {
      role: "assistant" as const,
      content: [
        { type: "thinking" as const, thinking: "..." },
        { type: "text" as const, text: "Hello" },
      ],
      api: "openai" as const,
      provider: "openai" as const,
      model: "gpt-4",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop" as const,
      timestamp: 0,
    };
    expect(extractAssistantText(msg)).toBe("Hello");
  });

  it("joins multiple text blocks with newline", () => {
    const msg = {
      role: "assistant" as const,
      content: [
        { type: "text" as const, text: "Line 1" },
        { type: "text" as const, text: "Line 2" },
      ],
      api: "openai" as const,
      provider: "openai" as const,
      model: "gpt-4",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop" as const,
      timestamp: 0,
    };
    expect(extractAssistantText(msg)).toBe("Line 1\nLine 2");
  });

  it("returns empty string for missing content", () => {
    const msg = {
      role: "assistant" as const,
      content: [],
      api: "openai" as const,
      provider: "openai" as const,
      model: "gpt-4",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop" as const,
      timestamp: 0,
    };
    expect(extractAssistantText(msg)).toBe("");
  });
});

describe("formatModelLabel", () => {
  it("replaces slashes with spaced slashes", () => {
    expect(formatModelLabel("openai/gpt-4")).toBe("openai / gpt-4");
  });
});

describe("truncateOutput", () => {
  it("returns text unchanged when under limit", () => {
    expect(truncateOutput("short", 10)).toBe("short");
  });

  it("truncates text over limit", () => {
    const text = "a".repeat(100);
    const result = truncateOutput(text, 50);
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(text.length);
  });
});
