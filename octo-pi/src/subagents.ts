import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";
import type {
  AuthStorage,
  ModelRegistry,
  SessionEntry,
  SessionMessageEntry,
} from "@oh-my-pi/pi-coding-agent";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { extractAssistantText, truncateOutput } from "./text.js";

export interface Participant {
  model: string;
  role: string;
  prompt?: string;
}

export interface RoundResult {
  model: string;
  role: string;
  text: string;
  error?: string;
}

export interface RoundOptions {
  priorSummary?: string;
  maxChars?: number;
}

export interface ResearchRoundOptions {
  maxChars?: number;
}

interface ParticipantSessionOptions {
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  signal: AbortSignal | undefined;
  maxChars: number;
  createPrompt: (participant: Participant) => string;
  toolNames: string[];
  autoApprove: boolean;
}

const DEFAULT_MAX_CHARS = 4000;
const SECRET_REPLACEMENT = "[REDACTED]";

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === "message";
}

export async function runMultiModelRound(
  participants: Participant[],
  roundPrompt: string,
  mode: "debate" | "brainstorm",
  modelRegistry: ModelRegistry,
  authStorage: AuthStorage,
  signal: AbortSignal | undefined,
  options: RoundOptions = {},
): Promise<RoundResult[]> {
  const uniqueParticipants = validateParticipants(participants, signal);
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  return Promise.all(
    uniqueParticipants.map((participant) =>
      runParticipantSession(participant, {
        modelRegistry,
        authStorage,
        signal,
        maxChars,
        toolNames: [],
        autoApprove: false,
        createPrompt: (p) => buildParticipantPrompt(p, roundPrompt, mode, options.priorSummary),
      }),
    ),
  );
}

export async function runResearchRound(
  participants: Participant[],
  researchPrompt: string,
  intensity: "quick" | "standard" | "deep",
  modelRegistry: ModelRegistry,
  authStorage: AuthStorage,
  signal: AbortSignal | undefined,
  options: ResearchRoundOptions = {},
): Promise<RoundResult[]> {
  const uniqueParticipants = validateParticipants(participants, signal);
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  return Promise.all(
    uniqueParticipants.map((participant) =>
      runParticipantSession(participant, {
        modelRegistry,
        authStorage,
        signal,
        maxChars,
        toolNames: ["web_search", "read"],
        autoApprove: true,
        createPrompt: (p) => buildResearchParticipantPrompt(p, researchPrompt, intensity),
      }),
    ),
  );
}

export function buildResearchParticipantPrompt(
  participant: Participant,
  researchPrompt: string,
  intensity: "quick" | "standard" | "deep",
): string {
  const userPrompt = participant.prompt ?? researchPrompt;
  return `You are an isolated participant in a multi-model sourced research session. You may use only read-only research tools: web_search and read. Do not write files, edit files, execute shell commands, run tasks, mutate state, or ask clarifying questions.

Role: ${participant.role}
Research intensity: ${intensity}

Research brief:
${userPrompt}

Requirements:
- Cite source URLs for factual claims.
- Mark any conclusion that is not directly source-backed as [Inference].
- Label model judgment as provider opinion when appropriate.
- Report disagreements between sources, uncertainty, stale evidence, and gaps where sources were insufficient.
- Prefer primary sources and official documentation when available.
- Return concise markdown with sections: Findings, Sources, Disagreements & Gaps.`;
}

export function buildParticipantPrompt(
  participant: Participant,
  roundPrompt: string,
  mode: "debate" | "brainstorm",
  priorSummary?: string,
): string {
  const userPrompt = participant.prompt ?? roundPrompt;
  const prior = priorSummary ? `\n\nPrior round synthesis:\n${priorSummary}` : "";
  return `You are an isolated participant in a multi-model ${mode} session. You have no tools, no file access, no skills, no external lookups, and no external capabilities. Answer the prompt below directly and concisely. Do not ask clarifying questions. Do not mention that you are an AI.\n\nRole: ${participant.role}${prior}\n\nPrompt:\n${userPrompt}`;
}

export function deduplicateParticipants(participants: Participant[]): Participant[] {
  const seen = new Set<string>();
  const deduped: Participant[] = [];
  for (const participant of participants) {
    if (seen.has(participant.model)) continue;
    seen.add(participant.model);
    deduped.push(participant);
  }
  return deduped;
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\b([A-Za-z0-9_]*key|token|secret|password|credential)(=|:)\s*([^\s"'`,;]+)/gi, `$1$2 ${SECRET_REPLACEMENT}`)
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{24,})\b/g, SECRET_REPLACEMENT);
}

export function validateModelSelector(selector: string): void {
  if (!/^[^\s/]+\/[^\s/]+$/.test(selector)) {
    throw new Error(`Invalid model selector: ${selector}`);
  }
}

function validateParticipants(participants: Participant[], signal: AbortSignal | undefined): Participant[] {
  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  const uniqueParticipants = deduplicateParticipants(participants);
  for (const participant of uniqueParticipants) {
    validateModelSelector(participant.model);
  }
  return uniqueParticipants;
}

async function runParticipantSession(
  participant: Participant,
  options: ParticipantSessionOptions,
): Promise<RoundResult> {
  const result: RoundResult = { model: participant.model, role: participant.role, text: "" };
  try {
    const model = options.modelRegistry.find(...parseSelector(participant.model));
    if (!model) {
      throw new Error(`Model not found: ${participant.model}`);
    }

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      modelRegistry: options.modelRegistry,
      authStorage: options.authStorage,
      disableExtensionDiscovery: true,
      enableMCP: false,
      enableLsp: false,
      toolNames: options.toolNames,
      skills: [],
      rules: [],
      contextFiles: [],
      promptTemplates: [],
      slashCommands: [],
      hasUI: false,
      autoApprove: options.autoApprove,
    });

    try {
      await session.setModel(model);
      await session.prompt(options.createPrompt(participant), { expandPromptTemplates: false });

      if (options.signal?.aborted) {
        throw new Error("Aborted");
      }

      const lastAssistant = findLastAssistantMessage(session.sessionManager.getEntries());
      if (lastAssistant) {
        if (lastAssistant.stopReason === "error" && lastAssistant.errorMessage) {
          throw new Error(lastAssistant.errorMessage);
        }
        result.text = truncateOutput(extractAssistantText(lastAssistant), options.maxChars);
      }
    } finally {
      await session.dispose();
    }
  } catch (err) {
    result.error = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
  }
  return result;
}

function findLastAssistantMessage(entries: SessionEntry[]): AssistantMessage | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (isMessageEntry(entry) && entry.message.role === "assistant") {
      return entry.message as AssistantMessage;
    }
  }
  return undefined;
}

function parseSelector(selector: string): [string, string] {
  validateModelSelector(selector);
  const slashIdx = selector.indexOf("/");
  return [selector.slice(0, slashIdx), selector.slice(slashIdx + 1)];
}
