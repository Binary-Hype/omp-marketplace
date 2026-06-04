import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import register from "../hooks/pre/core-safety";

type ToolCallEvent = { toolName: string; input: Record<string, unknown> };
type BlockResult = { block: true; reason: string } | undefined;

let handler: ((event: ToolCallEvent) => Promise<BlockResult> | BlockResult) | undefined;
let tempDir = "";
let originalHome: string | undefined;
let originalCache: string | undefined;
let originalRoot: string | undefined;
let originalCwd = "";

function invoke(event: ToolCallEvent): Promise<BlockResult> | BlockResult {
  handler = undefined;
  register({
    on(eventName, callback) {
      expect(eventName).toBe("tool_call");
      handler = callback;
    },
  });
  expect(handler).toBeDefined();
  return handler!(event);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "omp-core-safety-test-"));
  originalHome = process.env.HOME;
  originalCache = process.env.OMP_SECURITY_CACHE_DIR;
  originalRoot = process.env.OMP_PLUGIN_ROOT;
  originalCwd = process.cwd();

  const home = join(tempDir, "home");
  const project = join(tempDir, "project");
  mkdirSync(join(home, ".omp", "agent", "security"), { recursive: true });
  mkdirSync(join(project, ".omp", "security"), { recursive: true });
  mkdirSync(join(tempDir, "cache"), { recursive: true });

  process.env.HOME = home;
  process.env.OMP_SECURITY_CACHE_DIR = join(tempDir, "cache");
  process.env.OMP_PLUGIN_ROOT = join(import.meta.dir, "..");
  process.chdir(project);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalCache === undefined) delete process.env.OMP_SECURITY_CACHE_DIR;
  else process.env.OMP_SECURITY_CACHE_DIR = originalCache;
  if (originalRoot === undefined) delete process.env.OMP_PLUGIN_ROOT;
  else process.env.OMP_PLUGIN_ROOT = originalRoot;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("OMP core safety hook", () => {
  test("blocks large write payloads", async () => {
    const content = Array.from({ length: 801 }, (_, i) => `line ${i}`).join("\n");
    const result = await invoke({ toolName: "write", input: { path: "big.ts", content } });
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("max 800");
  });

  test("blocks unsafe op item get without safe fields", async () => {
    const result = await invoke({ toolName: "bash", input: { command: "op item get production-db" } });
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("Unsafe 1Password command");
  });

  test("allows op item get with safe fields", async () => {
    const result = await invoke({ toolName: "bash", input: { command: "op item get production-db --fields title,username" } });
    expect(result).toBeUndefined();
  });

  test("loads OMP global, project, and cache denylist paths", async () => {
    writeFileSync(join(process.env.HOME!, ".omp", "agent", "security", "denylist.json"), JSON.stringify({ deny: ["global.secret"], allow: [] }));
    writeFileSync(join(process.cwd(), ".omp", "security", "denylist.json"), JSON.stringify({ deny: ["project.secret"], allow: [] }));
    writeFileSync(join(process.env.OMP_SECURITY_CACHE_DIR!, "deny-patterns.json"), JSON.stringify(["cache.secret"]));

    for (const file of ["global.secret", "project.secret", "cache.secret"]) {
      const result = await invoke({ toolName: "read", input: { path: file } });
      expect(result?.block).toBe(true);
      expect(result?.reason).toContain(file);
    }
  });
});
