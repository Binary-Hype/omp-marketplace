export function orchestratorKickoffPrompt(opts: {
  mode: "debate" | "brainstorm";
  topic: string;
  selectedModels: string[];
  maxRounds: number;
}): string {
  const { mode, topic, selectedModels, maxRounds } = opts;
  const rolePalette =
    mode === "debate"
      ? `Possible debate roles (assign one per model):
- Proponent / steelman: argue strongly FOR the best version of the idea.
- Skeptic / red-team: find flaws, risks, and hidden assumptions.
- Pragmatic implementer: focus on feasibility, effort, and trade-offs.
- Strategic/ecosystem analyst: evaluate fit with broader architecture and trends.
- Security/operations reviewer: assess safety, compliance, and operational risks.`
      : `Possible brainstorm roles (assign one per model):
- Technical feasibility analyst: evaluate what can be built and how.
- Lateral thinker / ecosystem analyst: draw analogies from other domains.
- Pattern spotter / paradox hunter: surface non-obvious patterns and contradictions.
- Skeptical constraint finder: identify hard limits and hidden costs.
- User/product angle: focus on user value, experience, and market fit.`;

  const synthesisContract =
    mode === "debate"
      ? `After you receive the tool result:
1. Summarize top points from EACH participant model, attributed by model.
2. List areas of AGREEMENT.
3. List areas of DISAGREEMENT.
4. State the STRONGEST answer or conclusion and why.
5. Recommend a path forward.`
      : `After you receive the tool result:
1. Summarize top ideas from EACH participant model, attributed by model.
2. List areas of CONVERGENCE (ideas multiple models surfaced).
3. List areas of DIVERGENCE (unique perspectives).
4. State the STRONGEST ideas and why they are compelling.
5. Suggest the next exploration or step.`;

  return `You are the orchestrator for a multi-model ${mode} session.

Topic: "${topic}"

Selected participant models:
${selectedModels.map((m) => `- ${m}`).join("\n")}

Your job:
- Do NOT answer the topic directly yet.
- Create a single, focused round prompt that all participants will answer.
- Assign a distinct role/view to each selected model so they approach the topic from different angles.

${rolePalette}

Now call the tool \`octopus_multi_model_round\` with:
- mode: "${mode}"
- topic: "${topic}"
- round: 1
- participants: array of { model, role, prompt? } for each selected model
- roundPrompt: the shared prompt you crafted
- priorSummary: omit for round 1; for rounds greater than 1, include a concise synthesis of earlier rounds

${synthesisContract}

Then call \`octopus_next_step\` with your synthesis summary and, when useful, a recommendedNextPrompt.

The configured round limit is ${maxRounds}. If \`octopus_next_step\` returns selected models and the next round number is ${maxRounds} or lower, run another round with \`octopus_multi_model_round\` using the next round number and a concise priorSummary. If the next round would exceed ${maxRounds}, answer the user's question directly using your synthesis instead.
If \`octopus_next_step\` returns "continue_orchestrator", answer the user's question directly using your synthesis.`;
}

export function researchOrchestratorPrompt(opts: {
  topic: string;
  selectedModels: string[];
  intensity: "quick" | "standard" | "deep";
}): string {
  const { topic, selectedModels, intensity } = opts;
  return `You are the orchestrator for a multi-model sourced research session.

Topic: "${topic}"
Research intensity: ${intensity}

Selected participant models:
${selectedModels.map((m) => `- ${m}`).join("\n")}

Your job:
- Do NOT answer the topic directly before tool fan-out.
- Call the tool \`octopus_research_round\` exactly once.
- Assign a distinct research role to each selected model so they investigate different facets of the topic.
- Require source-backed findings. Every factual claim in the final answer must be attributable to a source, explicitly marked as [Inference], or identified as provider opinion.
- Require participants to report disagreements, uncertainty, and evidence gaps.

Now call \`octopus_research_round\` with:
- topic: "${topic}"
- intensity: "${intensity}"
- participants: array of { model, role, prompt? } for each selected model
- researchPrompt: the shared research brief you crafted

After you receive the tool result, produce the final report. The first line must be exactly:
🐙 Octopus Research

Use exactly these section headings, in this order:
## Executive Summary
## Key Themes
## Key Takeaways
## Sources & Attribution
## Methodology

In Sources & Attribution, list the source URLs and which participant/model cited them. In Methodology, name the selected models, their roles, the intensity, and any important gaps or limitations.`;
}
