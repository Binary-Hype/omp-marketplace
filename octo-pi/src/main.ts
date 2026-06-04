import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { parseCommandArgs, parseModelsFlag, parseResearchArgs, type ResearchIntensity } from "./arguments.js";
import { buildModelItems, multiSelectModels } from "./model-selection.js";
import { orchestratorKickoffPrompt, researchOrchestratorPrompt } from "./prompts.js";
import { runMultiModelRound, runResearchRound } from "./subagents.js";

interface SessionMetadata {
  selectedModels: string[];
  maxRounds: number;
  lastRound: number;
  researchIntensity?: ResearchIntensity;
}

interface TopicAndModelsOptions {
  argsTopic: string | undefined;
  modelsFlag: string | undefined;
  topicPrompt: string;
  topicPlaceholder: string;
  usage: string;
  ctx: ExtensionCommandContext;
}

interface TopicAndModels {
  topic: string;
  selectedModels: string[];
}

const sessionMetadata = new Map<string, SessionMetadata>();

export default function (pi: ExtensionAPI) {
  const { z } = pi.zod;

  registerCommands(pi);
  registerMultiModelRoundTool();
  registerResearchRoundTool();
  registerNextStepTool();

  function registerMultiModelRoundTool() {
    pi.registerTool({
      name: "octopus_multi_model_round",
      label: "Octopus Multi-Model Round",
      description:
        "Dispatch a round prompt to selected participant models in parallel and collect their responses. Each participant receives the shared roundPrompt plus an optional individual prompt override. Use this to run a multi-model debate or brainstorm round.",
      parameters: z.object({
        mode: z.enum(["debate", "brainstorm"] as const),
        topic: z.string(),
        round: z.number().int().min(1),
        participants: z.array(
          z.object({
            model: z.string(),
            role: z.string(),
            prompt: z.string().optional(),
          }),
        ),
        roundPrompt: z.string(),
        priorSummary: z.string().optional(),
      }),
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        onUpdate?.({ content: [{ type: "text", text: "Dispatching to participant models..." }] });

        const sessionId = ctx.sessionManager.getSessionId();
        validateSelectedModels(sessionId, params.participants.map((p) => p.model));
        const stored = sessionMetadata.get(sessionId);
        if (stored) {
          if (params.round > stored.maxRounds) {
            throw new Error(
              `Round ${params.round} exceeds the configured limit of ${stored.maxRounds}. Continue with the orchestrator.`,
            );
          }
          stored.lastRound = Math.max(stored.lastRound, params.round);
        }

        const results = await runMultiModelRound(
          params.participants,
          params.roundPrompt,
          params.mode,
          ctx.modelRegistry,
          ctx.modelRegistry.authStorage,
          signal,
          { priorSummary: params.priorSummary },
        );

        return {
          content: [{ type: "text", text: formatRoundResults(results) }],
          details: { results },
        };
      },
    });
  }

  function registerResearchRoundTool() {
    pi.registerTool({
      name: "octopus_research_round",
      label: "Octopus Research Round",
      description:
        "Dispatch a sourced research prompt to selected participant models in parallel using only read-only research tools.",
      parameters: z.object({
        topic: z.string(),
        intensity: z.enum(["quick", "standard", "deep"] as const),
        participants: z.array(
          z.object({
            model: z.string(),
            role: z.string(),
            prompt: z.string().optional(),
          }),
        ),
        researchPrompt: z.string(),
      }),
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        onUpdate?.({ content: [{ type: "text", text: "Dispatching research to participant models..." }] });

        const sessionId = ctx.sessionManager.getSessionId();
        const stored = sessionMetadata.get(sessionId);
        if (stored?.researchIntensity && params.intensity !== stored.researchIntensity) {
          throw new Error(
            `Research intensity ${params.intensity} does not match the configured intensity ${stored.researchIntensity}.`,
          );
        }
        validateSelectedModels(sessionId, params.participants.map((p) => p.model));

        try {
          const results = await runResearchRound(
            params.participants,
            params.researchPrompt,
            params.intensity,
            ctx.modelRegistry,
            ctx.modelRegistry.authStorage,
            signal,
          );

          return {
            content: [{ type: "text", text: formatRoundResults(results) }],
            details: { results },
          };
        } finally {
          sessionMetadata.delete(sessionId);
        }
      },
    });
  }

  function registerNextStepTool() {
    pi.registerTool({
      name: "octopus_next_step",
      label: "Octopus Next Step",
      description:
        'After synthesizing a multi-model round, ask the user whether to run another round or continue with the orchestrator. Returns either the selected models for the next round or "continue_orchestrator".',
      parameters: z.object({
        mode: z.enum(["debate", "brainstorm"] as const),
        summary: z.string(),
        recommendedNextPrompt: z.string().optional(),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const sessionId = ctx.sessionManager.getSessionId();
        if (!ctx.hasUI) {
          sessionMetadata.delete(sessionId);
          return continueOrchestratorResult();
        }

        const prompt = params.recommendedNextPrompt
          ? `Run another multi-model round?\n\nRecommended next prompt:\n${params.recommendedNextPrompt}`
          : "Run another multi-model round?";
        const choice = await ctx.ui.select(prompt, [
          "Another round with multiple models",
          "Continue only with orchestrator",
        ]);

        if (choice !== "Another round with multiple models") {
          sessionMetadata.delete(sessionId);
          return continueOrchestratorResult();
        }

        const stored = sessionMetadata.get(sessionId);
        if (stored && stored.lastRound >= stored.maxRounds) {
          sessionMetadata.delete(sessionId);
          return continueOrchestratorResult();
        }

        const available = ctx.modelRegistry.getAvailable();
        const items = buildModelItems(available, ctx.model);
        const selected = await multiSelectModels(items, new Set(stored?.selectedModels ?? []), ctx);
        if (!selected || selected.length < 2) {
          sessionMetadata.delete(sessionId);
          return continueOrchestratorResult();
        }

        sessionMetadata.set(sessionId, {
          selectedModels: selected,
          maxRounds: stored?.maxRounds ?? 3,
          lastRound: stored?.lastRound ?? 0,
        });
        return {
          content: [
            { type: "text", text: `Selected models for next round: ${selected.join(", ")}` },
          ],
          details: { action: "another_round", selectedModels: selected },
        };
      },
    });
  }
}

function registerCommands(pi: ExtensionAPI) {
  pi.registerCommand("debate", {
    description: "Run a multi-model debate",
    handler: async (args, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      await handleCommand("debate", args, ctx, pi);
    },
  });

  pi.registerCommand("brainstorm", {
    description: "Run a multi-model brainstorm",
    handler: async (args, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      await handleCommand("brainstorm", args, ctx, pi);
    },
  });

  pi.registerCommand("research", {
    description: "Run multi-model sourced research",
    handler: async (args, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      await handleResearchCommand(args, ctx, pi);
    },
  });
}

async function handleCommand(
  mode: "debate" | "brainstorm",
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
) {
  const { topic, modelsFlag, maxRounds } = parseCommandArgs(args);
  const resolved = await resolveTopicAndModels({
    argsTopic: topic,
    modelsFlag,
    topicPrompt: `${mode === "debate" ? "Debate" : "Brainstorm"} topic:`,
    topicPlaceholder: "Enter topic",
    usage: `Usage: /${mode} [--models provider/model,provider/model] <topic>`,
    ctx,
  });
  if (!resolved) return;

  const sessionId = ctx.sessionManager.getSessionId();
  sessionMetadata.set(sessionId, { selectedModels: resolved.selectedModels, maxRounds, lastRound: 0 });

  const prompt = orchestratorKickoffPrompt({
    mode,
    topic: resolved.topic,
    selectedModels: resolved.selectedModels,
    maxRounds,
  });
  pi.sendUserMessage(prompt);
}

async function handleResearchCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
) {
  const { topic, modelsFlag, effectiveIntensity } = parseResearchArgs(args);
  const usage = "Usage: /research [--models provider/model,provider/model] [--breadth=light|standard|exhaustive] [--intensity=quick|standard|deep] <topic>";
  const resolved = await resolveTopicAndModels({
    argsTopic: topic,
    modelsFlag,
    topicPrompt: "Research topic:",
    topicPlaceholder: "Enter topic",
    usage,
    ctx,
  });
  if (!resolved) return;

  let intensity = effectiveIntensity;
  if (!intensity) {
    if (ctx.hasUI) {
      const choice = await ctx.ui.select("Research intensity:", ["Quick", "Standard", "Deep"]);
      intensity =
        choice === "Quick" ? "quick" : choice === "Deep" ? "deep" : "standard";
    } else {
      intensity = "standard";
    }
  }

  const sessionId = ctx.sessionManager.getSessionId();
  sessionMetadata.set(sessionId, {
    selectedModels: resolved.selectedModels,
    maxRounds: 1,
    lastRound: 0,
    researchIntensity: intensity,
  });

  const prompt = researchOrchestratorPrompt({
    topic: resolved.topic,
    selectedModels: resolved.selectedModels,
    intensity,
  });
  pi.sendUserMessage(prompt);
}

async function resolveTopicAndModels(options: TopicAndModelsOptions): Promise<TopicAndModels | null> {
  let actualTopic = options.argsTopic;
  if (!actualTopic) {
    if (options.ctx.hasUI) {
      actualTopic = await options.ctx.ui.input(options.topicPrompt, options.topicPlaceholder);
    }
    if (!actualTopic) {
      options.ctx.ui.notify(options.usage, "warning");
      return null;
    }
  }

  const available = options.ctx.modelRegistry.getAvailable();
  if (available.length < 2) {
    options.ctx.ui.notify("Need at least 2 available models.", "error");
    return null;
  }

  let selected: string[] | null;
  if (options.modelsFlag) {
    selected = parseModelsFlag(options.modelsFlag);
  } else if (options.ctx.hasUI) {
    const items = buildModelItems(available, options.ctx.model);
    selected = await multiSelectModels(items, new Set(), options.ctx);
  } else {
    options.ctx.ui.notify(options.usage, "warning");
    return null;
  }

  if (!selected || selected.length < 2) {
    options.ctx.ui.notify("Need at least 2 participant models.", "warning");
    return null;
  }

  return { topic: actualTopic, selectedModels: selected };
}

function validateSelectedModels(sessionId: string, selectors: string[]): void {
  const stored = sessionMetadata.get(sessionId);
  if (!stored) return;

  for (const selector of selectors) {
    if (!stored.selectedModels.includes(selector)) {
      throw new Error(
        `Model ${selector} was not selected for this session. Available: ${stored.selectedModels.join(", ")}`,
      );
    }
  }
}

function formatRoundResults(results: { model: string; role: string; text: string; error?: string }[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`### ${result.model} — ${result.role}`);
    if (result.error) {
      lines.push(`Error: ${result.error}`);
    } else {
      lines.push(result.text);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function continueOrchestratorResult() {
  return {
    content: [{ type: "text" as const, text: "continue_orchestrator" }],
    details: { action: "continue_orchestrator" },
  };
}
