# octo-pi

A Bun/TypeScript extension for Oh My Pi that adds multi-model debate, brainstorm, and sourced research workflows.

## What it does

`octo-pi` lets the orchestrator ask multiple selected models to answer the same prompt from different roles, then synthesize the result. It provides three commands:

- `/debate` — run a structured multi-model debate with opposing or complementary viewpoints.
- `/brainstorm` — run a structured multi-model ideation round with varied perspectives.
- `/research` — run multi-model sourced research with read-only lookup tools and an attributed final report.

The extension also registers the tools used by the orchestrator during those workflows:

- `octopus_multi_model_round` — dispatches a prompt to participant models in parallel.
- `octopus_research_round` — dispatches sourced research prompts with read-only `web_search` and `read` access.
- `octopus_next_step` — asks whether to run another round or continue with the orchestrator's final answer.

## Usage

Run a debate:

```text
/debate Should we use Redis for session storage?
```

Run a brainstorm:

```text
/brainstorm How can we reduce support ticket volume?
```

Run sourced research:

```text
/research --breadth=standard How is AI changing radiology workflows?
```

Select models explicitly with `--models`:

```text
/debate --models openai/gpt-5,anthropic/claude-sonnet Should we use Redis?
/research --models openai/gpt-5,anthropic/claude-sonnet --intensity=deep How is AI changing radiology workflows?
```

If no `--models` flag is provided and the UI is available, the extension opens an interactive multi-select model picker. At least two models are required.

Research supports `--breadth=light|standard|exhaustive` and `--intensity=quick|standard|deep`. If `--intensity` is omitted, breadth maps to intensity as light → quick, standard → standard, and exhaustive → deep. Without either flag, UI mode prompts for intensity and non-UI mode defaults to standard.

## Development

Install dependencies with Bun:

```sh
bun install
```

Run tests:

```sh
bun test
```

Run TypeScript checks:

```sh
bun run typecheck
```

## Project structure

```text
src/
  arguments.ts        Command argument, --models, and research flag parsing
  main.ts             Extension registration, commands, and tools
  model-selection.ts  Interactive model multi-select UI
  prompts.ts          Orchestrator kickoff prompt contracts
  subagents.ts        Participant model session and research execution
  text.ts             Text extraction and formatting helpers

tests/
  argument-parsing.test.ts
  model-selection.test.ts
  prompt-contract.test.ts
  subagents.test.ts
  text.test.ts
```

## Requirements

- Bun
- Oh My Pi coding agent packages compatible with `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-tui` `^15.8.0`

## Extension entrypoint

`package.json` exposes the extension through:

```json
{
  "omp": {
    "extensions": ["./src/main.ts"]
  }
}
```
