#!/usr/bin/env node
/**
 * core-safety.ts — OMP pre-tool-call safety hook.
 *
 * OMP pre-tool-call protection:
 *  1. Secret-file blocking (configurable denylist)
 *  2. Credential leak detection before git commit
 *  3. Unsafe 1Password CLI command blocking
 *  4. Oversized Write payload blocking (800-line limit)
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

interface HookContext {
  ui?: {
    confirm(title: string, message: string): Promise<boolean>;
  };
}

interface BlockResult {
  block: true;
  reason: string;
}

interface HookAPI {
  on(
    event: "tool_call",
    handler: (
      event: ToolCallEvent,
      ctx?: HookContext
    ) => Promise<BlockResult | undefined> | BlockResult | undefined
  ): void;
}

interface BashConfig {
  disabledRuleIds: string[];
  approvalRuleIds?: string[];
  blockedRuleIds: string[];
}

interface PatternConfig {
  deny: string[];
  allow: string[];
  bash?: BashConfig;
}

type BashSeverity = "allow" | "approve" | "block";

interface BashRuleMatch {
  id: string;
  severity: BashSeverity;
  summary: string;
  consequence: string;
}

interface BashAnalysis {
  severity: BashSeverity;
  matches: BashRuleMatch[];
  normalizedCommand: string;
}

interface ShellToken {
  value: string;
  quoted: boolean;
  operator: boolean;
}

interface ShellLexResult {
  tokens: ShellToken[];
  errors: string[];
}

interface OpAnalysis {
  allowed: boolean;
  reason?: string;
}

const DEFAULT_DENY = [
  ".env", ".env.*",
  "*.pem", "*.key", "*.p12", "*.pfx", "*.crt",
  "id_rsa*", "id_ed25519*", "id_ecdsa*", "id_dsa*",
  "known_hosts",
  "*.keystore", "*.jks", "*.truststore",
  ".npmrc", ".netrc", ".htpasswd", ".pgpass",
  ".vault-token", "vault.yml", "vault.yaml",
  "secrets.yml", "secrets.yaml", "secrets.json",
  "*.secret", "*.secrets",
  "credentials.json", "service-account*.json",
  ".docker/config.json",
  "kubeconfig", "wp-config.php", "auth.json",
];

const DEFAULT_ALLOW = [
  ".env.example", ".env.dist", ".env.template",
  "*.pem.example", "*.key.example",
];

function tool(event: ToolCallEvent): string {
  return event.toolName.toLowerCase();
}

function inputString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function getCacheDir(): string {
  if (process.env.OMP_SECURITY_CACHE_DIR) {
    return process.env.OMP_SECURITY_CACHE_DIR;
  }
  const uid = process.getuid ? process.getuid() : "default";
  return `/tmp/omp-security-${uid}`;
}

function pluginRoot(): string {
  return process.env.OMP_PLUGIN_ROOT
    ?? process.cwd();
}

function stringsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function bashConfigFromUnknown(value: unknown): BashConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as { disabledRuleIds?: unknown; approvalRuleIds?: unknown; blockedRuleIds?: unknown };
  const approvalRuleIds = Array.isArray(obj.approvalRuleIds)
    ? stringsFromUnknown(obj.approvalRuleIds)
    : undefined;
  return {
    disabledRuleIds: stringsFromUnknown(obj.disabledRuleIds),
    approvalRuleIds,
    blockedRuleIds: stringsFromUnknown(obj.blockedRuleIds),
  };
}

function parsePatternConfig(value: unknown): PatternConfig | undefined {
  if (Array.isArray(value)) {
    return { deny: stringsFromUnknown(value), allow: [] };
  }
  if (value && typeof value === "object") {
    const obj = value as { deny?: unknown; allow?: unknown; bash?: unknown };
    return {
      deny: stringsFromUnknown(obj.deny),
      allow: stringsFromUnknown(obj.allow),
      bash: bashConfigFromUnknown(obj.bash),
    };
  }
  return undefined;
}

function loadPatternConfig(filePath: string): PatternConfig | undefined {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return parsePatternConfig(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function addPatterns(target: Set<string>, values: string[]): void {
  for (const value of values) target.add(value);
}

function loadJsonArray(filePath: string): string[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return stringsFromUnknown(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function mergeBashConfig(target: BashConfig, source: BashConfig | undefined): void {
  if (!source) return;
  target.disabledRuleIds.push(...source.disabledRuleIds);
  target.blockedRuleIds.push(...source.blockedRuleIds);
  if (source.approvalRuleIds) {
    target.approvalRuleIds = [
      ...(target.approvalRuleIds ?? []),
      ...source.approvalRuleIds,
    ];
  }
}

function loadPatterns(): PatternConfig {
  const deny = new Set<string>(DEFAULT_DENY);
  const allow = new Set<string>(DEFAULT_ALLOW);
  const bash: BashConfig = { disabledRuleIds: [], blockedRuleIds: [] };
  const defaultConfig = loadPatternConfig(
    path.join(pluginRoot(), "hooks", "config", "default-denylist.json")
  );
  if (defaultConfig) {
    addPatterns(deny, defaultConfig.deny);
    addPatterns(allow, defaultConfig.allow);
    mergeBashConfig(bash, defaultConfig.bash);
  }

  const globalConfig = loadPatternConfig(
    path.join(os.homedir(), ".omp", "agent", "security", "denylist.json")
  );
  if (globalConfig) {
    addPatterns(deny, globalConfig.deny);
    addPatterns(allow, globalConfig.allow);
    mergeBashConfig(bash, globalConfig.bash);
  }

  const projectConfig = loadPatternConfig(
    path.join(process.cwd(), ".omp", "security", "denylist.json")
  );
  if (projectConfig) {
    addPatterns(deny, projectConfig.deny);
    addPatterns(allow, projectConfig.allow);
    mergeBashConfig(bash, projectConfig.bash);
  }

  const cacheDir = getCacheDir();
  addPatterns(deny, loadJsonArray(path.join(cacheDir, "deny-patterns.json")));
  addPatterns(allow, loadJsonArray(path.join(cacheDir, "allow-patterns.json")));

  return { deny: [...deny], allow: [...allow], bash };
}

function loadOverrides(): { deny: Set<string>; allow: Set<string> } {
  const deny = new Set<string>();
  const allow = new Set<string>();
  addPatterns(deny, loadJsonArray(path.join(os.homedir(), ".omp", "agent", "security", "deny.json")));
  addPatterns(allow, loadJsonArray(path.join(os.homedir(), ".omp", "agent", "security", "allow.json")));
  return { deny, allow };
}

function matchesGlob(filename: string, pattern: string): boolean {
  let regex = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") regex += ".*";
    else if (c === "?") regex += ".";
    else if (".+^${}()|[]\\".includes(c)) regex += `\\${c}`;
    else regex += c;
  }
  return new RegExp(`^${regex}$`).test(filename);
}

function isPathDenied(
  filePath: string,
  denyPatterns: string[],
  allowPatterns: string[],
  overrides: { deny: Set<string>; allow: Set<string> }
): boolean {
  const basename = path.basename(filePath.replace(/\/+$/, ""));

  for (const allowed of overrides.allow) {
    if (matchesGlob(basename, allowed) || matchesGlob(filePath, allowed)) return false;
  }
  for (const allowed of allowPatterns) {
    if (matchesGlob(basename, allowed) || matchesGlob(filePath, allowed)) return false;
  }
  for (const denied of overrides.deny) {
    if (matchesGlob(basename, denied) || matchesGlob(filePath, denied)) return true;
  }
  for (const denied of denyPatterns) {
    if (matchesGlob(basename, denied) || matchesGlob(filePath, denied)) return true;
  }
  return false;
}

const SHELL_OPERATORS = new Set([";", "&&", "||", "|", "&", ">", ">>", "<", "<<"]);

function pushShellToken(tokens: ShellToken[], value: string, quoted: boolean): void {
  if (value) tokens.push({ value, quoted, operator: false });
}

function lexShell(command: string): ShellLexResult {
  const tokens: ShellToken[] = [];
  const errors: string[] = [];
  const input = command.replace(/\\\r?\n/g, " ");
  let current = "";
  let quotedToken = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1] ?? "";

    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === "\\" && i + 1 < input.length) current += input[++i];
      else current += c;
      continue;
    }

    if (c === "#") break;
    if (c === "$" && next === "(") errors.push("subshell-execution");
    if (c === "`") errors.push("subshell-execution");
    if ((c === "<" || c === ">") && next === "(") errors.push("subshell-execution");
    if (c === "'" || c === '"') {
      quote = c;
      quotedToken = true;
      continue;
    }
    if (c === "\\" && i + 1 < input.length) {
      current += input[++i];
      continue;
    }
    if (/\s/.test(c)) {
      pushShellToken(tokens, current, quotedToken);
      current = "";
      quotedToken = false;
      continue;
    }
    const two = c + next;
    if (SHELL_OPERATORS.has(two)) {
      pushShellToken(tokens, current, quotedToken);
      current = "";
      quotedToken = false;
      tokens.push({ value: two, quoted: false, operator: true });
      if (two === "<<") errors.push("heredoc-execution");
      i++;
      continue;
    }
    if (SHELL_OPERATORS.has(c)) {
      pushShellToken(tokens, current, quotedToken);
      current = "";
      quotedToken = false;
      tokens.push({ value: c, quoted: false, operator: true });
      continue;
    }
    current += c;
  }

  if (quote) errors.push("parse-error");
  pushShellToken(tokens, current, quotedToken);
  return { tokens, errors };
}

function shellTokenize(s: string): string[] {
  return lexShell(s).tokens.filter((token) => !token.operator).map((token) => token.value);
}

function commandName(token: string): string {
  return path.basename(token);
}

function isAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function extractBashFilePaths(command: string): string[] {
  const paths: string[] = [];
  const { tokens } = lexShell(command);
  const fileCommands = new Set([
    "cat", "head", "tail", "less", "more", "grep", "sed", "awk",
    "source", ".", "cp", "mv", "rm", "touch",
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.operator || !fileCommands.has(commandName(token.value))) continue;
    for (let j = i + 1; j < tokens.length && !tokens[j].operator; j++) {
      const candidate = tokens[j].value.replace(/^[<>]+/, "");
      if (candidate && !candidate.startsWith("-")) paths.push(candidate);
    }
  }

  return paths;
}
const BASH_RULES: Record<string, Omit<BashRuleMatch, "severity">> = {
  "recursive-delete": { id: "recursive-delete", summary: "Recursive rm operation", consequence: "May delete directories and their contents." },
  "force-delete": { id: "force-delete", summary: "Forced rm operation", consequence: "May remove files without prompts or recovery path." },
  "root-or-home-delete": { id: "root-or-home-delete", summary: "Broad rm target", consequence: "May remove the current tree, parent tree, home directory, or filesystem root." },
  "destructive-glob": { id: "destructive-glob", summary: "Unquoted destructive glob", consequence: "Shell expansion may affect more files than intended." },
  "shell-command-chain": { id: "shell-command-chain", summary: "Destructive command in shell chain", consequence: "Earlier commands or pipelines can change what is deleted or modified." },
  "subshell-execution": { id: "subshell-execution", summary: "Subshell or process substitution", consequence: "Nested shell execution cannot be safely classified." },
  "heredoc-execution": { id: "heredoc-execution", summary: "Heredoc shell input", consequence: "Multiline shell input cannot be safely classified." },
  "interpreter-eval": { id: "interpreter-eval", summary: "Interpreter eval execution", consequence: "Inline code can run destructive shell commands." },
  "source-script": { id: "source-script", summary: "Sourced script execution", consequence: "A sourced script can mutate the current shell and run arbitrary commands." },
  "git-clean": { id: "git-clean", summary: "Git clean removes untracked files", consequence: "Untracked files may be deleted permanently." },
  "git-reset-hard": { id: "git-reset-hard", summary: "Hard git reset", consequence: "Tracked changes may be discarded." },
  "git-broad-restore": { id: "git-broad-restore", summary: "Broad git restore", consequence: "Workspace changes may be discarded." },
  "find-delete": { id: "find-delete", summary: "Find delete action", consequence: "Matched files are deleted during traversal." },
  "find-exec": { id: "find-exec", summary: "Find executes rm", consequence: "Matched files are passed to rm." },
  "recursive-permission-change": { id: "recursive-permission-change", summary: "Recursive permission or ownership change", consequence: "Permissions or ownership can be changed across an entire tree." },
  "disk-destructive-command": { id: "disk-destructive-command", summary: "Disk/container/infrastructure destructive command", consequence: "Data, containers, or infrastructure resources may be destroyed." },
  "network-pipe-to-shell": { id: "network-pipe-to-shell", summary: "Network response piped to shell", consequence: "Remote content will execute as code." },
  "parse-error": { id: "parse-error", summary: "Shell parse ambiguity", consequence: "The hook cannot safely classify this command." },
};

function rule(id: string, config: BashConfig | undefined): BashRuleMatch | undefined {
  if (config?.disabledRuleIds.includes(id)) return undefined;
  if (config?.approvalRuleIds && !config.approvalRuleIds.includes(id)) return undefined;
  const base = BASH_RULES[id];
  if (!base) return undefined;
  return {
    ...base,
    severity: config?.blockedRuleIds.includes(id) ? "block" : "approve",
  };
}

function addRule(matches: BashRuleMatch[], seen: Set<string>, id: string, config: BashConfig | undefined): void {
  if (seen.has(id)) return;
  const match = rule(id, config);
  if (!match) return;
  seen.add(id);
  matches.push(match);
}

function hasRmFlag(args: ShellToken[], names: string[]): boolean {
  return args.some((arg) => {
    const value = arg.value;
    if (names.includes(value)) return true;
    if (!value.startsWith("-") || value.startsWith("--")) return false;
    return names.some((name) => name.length === 2 && value.slice(1).includes(name[1]));
  });
}

function hasUnquotedGlob(token: ShellToken): boolean {
  return !token.quoted && /[*?\[]/.test(token.value);
}

function isBroadTarget(value: string): boolean {
  return value === "/" || value === "~" || value === "$HOME" || value === "." || value === "..";
}

function segments(tokens: ShellToken[]): ShellToken[][] {
  const result: ShellToken[][] = [];
  let current: ShellToken[] = [];
  for (const token of tokens) {
    if (token.operator && [";", "&&", "||", "|", "&"].includes(token.value)) {
      if (current.length) result.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length) result.push(current);
  return result;
}

function firstCommandIndex(tokens: ShellToken[]): number {
  let i = 0;
  while (i < tokens.length && !tokens[i].operator && isAssignmentToken(tokens[i].value)) i++;
  if (["env", "command"].includes(commandName(tokens[i]?.value ?? ""))) i++;
  return i;
}

function analyzeSegment(tokens: ShellToken[], matches: BashRuleMatch[], seen: Set<string>, config: BashConfig | undefined, chained: boolean): void {
  const cmdIndex = firstCommandIndex(tokens);
  if (cmdIndex >= tokens.length) return;
  const cmd = commandName(tokens[cmdIndex].value);
  const args = tokens.slice(cmdIndex + 1).filter((token) => !token.operator);

  if (["bash", "sh", "zsh"].includes(cmd) && args.some((arg) => arg.value === "-c")) addRule(matches, seen, "interpreter-eval", config);
  if ((["python", "node", "ruby", "perl", "bun"].includes(cmd) && args.some((arg) => arg.value === "-c" || arg.value === "-e")) || (cmd === "php" && args.some((arg) => arg.value === "-r")) || (cmd === "deno" && args.some((arg) => arg.value === "eval"))) addRule(matches, seen, "interpreter-eval", config);
  if (cmd === "source" || cmd === ".") addRule(matches, seen, "source-script", config);

  if (cmd === "rm" || (cmd === "xargs" && args.some((arg) => commandName(arg.value) === "rm"))) {
    const rmArgs = cmd === "rm" ? args : args.slice(args.findIndex((arg) => commandName(arg.value) === "rm") + 1);
    const recursive = hasRmFlag(rmArgs, ["-r", "-R", "--recursive"]);
    const force = hasRmFlag(rmArgs, ["-f", "--force"]);
    if (recursive) addRule(matches, seen, "recursive-delete", config);
    if (force) addRule(matches, seen, "force-delete", config);
    if (rmArgs.some((arg) => !arg.value.startsWith("-") && isBroadTarget(arg.value))) addRule(matches, seen, "root-or-home-delete", config);
    if (rmArgs.some((arg) => !arg.value.startsWith("-") && hasUnquotedGlob(arg))) addRule(matches, seen, "destructive-glob", config);
    if (chained && (recursive || force || rmArgs.some(hasUnquotedGlob))) addRule(matches, seen, "shell-command-chain", config);
  }

  if (cmd === "git" && args[0]?.value === "clean" && args.some((arg) => /^-[A-Za-z]*f[A-Za-z]*d|^-[A-Za-z]*d[A-Za-z]*f/.test(arg.value))) addRule(matches, seen, "git-clean", config);
  if (cmd === "git" && args[0]?.value === "reset" && args.some((arg) => arg.value === "--hard")) addRule(matches, seen, "git-reset-hard", config);
  if (cmd === "git" && ((args[0]?.value === "checkout" && args[1]?.value === "--" && args[2]?.value === ".") || (args[0]?.value === "restore" && args.some((arg) => arg.value === ".")))) addRule(matches, seen, "git-broad-restore", config);
  if (cmd === "find" && args.some((arg) => arg.value === "-delete")) addRule(matches, seen, "find-delete", config);
  if (cmd === "find" && args.some((arg, index) => (arg.value === "-exec" || arg.value === "-execdir") && commandName(args[index + 1]?.value ?? "") === "rm")) addRule(matches, seen, "find-exec", config);
  if ((cmd === "chmod" || cmd === "chown") && hasRmFlag(args, ["-R", "--recursive"])) addRule(matches, seen, "recursive-permission-change", config);
  if (cmd === "dd" && args.some((arg) => arg.value.startsWith("of="))) addRule(matches, seen, "disk-destructive-command", config);
  if (cmd.startsWith("mkfs") || (cmd === "diskutil" && args[0]?.value?.startsWith("erase")) || (cmd === "docker" && ((args[0]?.value === "system" && args[1]?.value === "prune") || (args[0]?.value === "volume" && args[1]?.value === "rm") || (args[0]?.value === "rm" && args.some((arg) => arg.value === "-f")))) || (cmd === "kubectl" && args[0]?.value === "delete") || (cmd === "helm" && args[0]?.value === "uninstall") || (cmd === "terraform" && args[0]?.value === "destroy")) addRule(matches, seen, "disk-destructive-command", config);
}

function analyzeBashCommand(command: string, config?: BashConfig): BashAnalysis {
  const lexed = lexShell(command);
  const matches: BashRuleMatch[] = [];
  const seen = new Set<string>();
  for (const error of lexed.errors) addRule(matches, seen, error, config);

  const parts = segments(lexed.tokens);
  const chained = parts.length > 1 || lexed.tokens.some((token) => token.operator && token.value === "|");
  for (const part of parts) analyzeSegment(part, matches, seen, config, chained);

  for (let i = 0; i < parts.length - 1; i++) {
    const left = commandName(parts[i][firstCommandIndex(parts[i])]?.value ?? "");
    const right = commandName(parts[i + 1][firstCommandIndex(parts[i + 1])]?.value ?? "");
    if ((left === "curl" || left === "wget") && (right === "sh" || right === "bash")) addRule(matches, seen, "network-pipe-to-shell", config);
  }

  const severity: BashSeverity = matches.some((match) => match.severity === "block")
    ? "block"
    : matches.length ? "approve" : "allow";
  return {
    severity,
    matches,
    normalizedCommand: lexed.tokens.map((token) => token.value).join(" "),
  };
}

function checkSecretProtection(event: ToolCallEvent): BlockResult | undefined {
  const toolName = tool(event);
  const patterns = loadPatterns();
  const overrides = loadOverrides();
  const pathsToCheck: string[] = [];

  if (["read", "edit", "write"].includes(toolName)) {
    const filePath = inputString(event.input, ["file_path", "filePath", "path"]);
    if (filePath) pathsToCheck.push(filePath);
  } else if (toolName === "bash") {
    const command = inputString(event.input, ["command"]);
    if (command) pathsToCheck.push(...extractBashFilePaths(command));
  } else if (toolName === "search") {
    const searchPath = event.input.paths;
    if (typeof searchPath === "string") pathsToCheck.push(searchPath);
    else if (Array.isArray(searchPath)) pathsToCheck.push(...searchPath.filter((item): item is string => typeof item === "string"));
  } else if (toolName === "find") {
    const findPaths = event.input.paths;
    if (typeof findPaths === "string") pathsToCheck.push(findPaths);
    else if (Array.isArray(findPaths)) pathsToCheck.push(...findPaths.filter((item): item is string => typeof item === "string"));
  }

  for (const filePath of pathsToCheck) {
    if (isPathDenied(filePath, patterns.deny, patterns.allow, overrides)) {
      return {
        block: true,
        reason: `[Hook] BLOCKED: Access to secret file '${path.basename(filePath)}' is prohibited.`,
      };
    }
  }

  return undefined;
}

const CREDENTIAL_PATTERNS = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Private Key", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub Token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: "Slack Token", pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}(-[a-zA-Z0-9]{24})?/ },
  { name: "Generic Secret", pattern: /(password|passwd|pwd|secret|token|key)\s*[=:]\s*["'][a-zA-Z0-9_!@#$%^&*+=-]{8,}["']/i },
  { name: "URL with Password", pattern: /[a-z]+:\/\/[^:]+:[^@]+@[^\/]+/i },
  { name: "API Key", pattern: /api[_-]?key\s*[=:]\s*["'][a-zA-Z0-9_\-]{16,}["']/i },
  { name: "JWT Token", pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/ },
];

function isGitCommit(command: string): boolean {
  const segments = command.split(/\s*(?:&&|\|\||;)\s*/);
  for (const segment of segments) {
    const tokens = shellTokenize(segment);
    for (let i = 0; i < tokens.length - 1; i++) {
      if ((tokens[i] === "git" || tokens[i].endsWith("/git")) && tokens[i + 1] === "commit") {
        return true;
      }
    }
  }
  return false;
}

function scanCredentials(diffText: string): { found: boolean; findings: string[] } {
  const findings: string[] = [];
  for (const line of diffText.split("\n")) {
    if (!line.startsWith("+")) continue;
    const content = line.slice(1);
    for (const { name, pattern } of CREDENTIAL_PATTERNS) {
      if (pattern.test(content)) {
        findings.push(`Possible ${name} in staged changes`);
        break;
      }
    }
  }
  return { found: findings.length > 0, findings };
}

function checkCredentialGate(event: ToolCallEvent): BlockResult | undefined {
  if (tool(event) !== "bash") return undefined;
  const command = inputString(event.input, ["command"]);
  if (!command || !isGitCommit(command)) return undefined;

  try {
    const diff = execSync("git diff --cached", {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const result = scanCredentials(diff);
    if (result.found) {
      return {
        block: true,
        reason: `[Hook] BLOCKED: Staged changes contain possible credentials.\n${result.findings.join("\n")}`,
      };
    }
  } catch {
    // git diff --cached may fail in non-repo contexts; allow.
  }

  return undefined;
}

const SAFE_FIELDS = new Set([
  "title", "name", "url", "website", "username", "user", "email",
  "tags", "category", "vault", "id", "uuid",
  "createdat", "updatedat", "favorite", "trashed", "version",
]);

const SAFE_SUBCOMMANDS_NO_ARGS = new Set([
  "whoami", "signin", "signout", "help", "update", "completion", "plugin",
]);

const LIST_GET_SUBCOMMANDS = new Set([
  "vault", "user", "account", "group",
]);

const ALWAYS_BLOCKED_SUBCOMMANDS: Record<string, string> = {
  document: "1Password documents commonly contain private keys, certificates, or recovery codes.",
  inject: "Substitutes secret references into template files, writing secrets to disk or context.",
  run: "Injects 1Password secrets into subprocess environment variables.",
  connect: "Manages Connect server tokens (sensitive).",
  "events-api": "Manages Events API tokens (sensitive).",
  "service-account": "Manages service account tokens (sensitive).",
};

const GLOBAL_FLAGS_WITH_VALUE = new Set([
  "--account", "--cache", "--config", "--session", "--format", "--encoding",
]);

function splitSegments(command: string): string[] {
  return command
    .replace(/\$\(([^)]*)\)/g, " ; $1 ; ")
    .replace(/`([^`]*)`/g, " ; $1 ; ")
    .split(/;|\|\||&&|\||&/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isSafeField(fieldSpec: string): boolean {
  let name = fieldSpec.trim();
  const eqIdx = name.indexOf("=");
  if (eqIdx !== -1 && /^(label|type)$/i.test(name.slice(0, eqIdx))) {
    name = name.slice(eqIdx + 1);
  }
  if (name.includes(".")) name = name.split(".").pop() ?? name;
  name = name.toLowerCase().replace(/[_\s-]/g, "");
  return SAFE_FIELDS.has(name);
}

function getFieldsArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--fields" || args[i] === "-f") && args[i + 1]) return args[i + 1];
    if (args[i].startsWith("--fields=")) return args[i].slice("--fields=".length);
  }
  return undefined;
}

function stripGlobalFlags(args: string[]): { helpOrVersion: boolean; rest: string[] } {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    const flag = args[i];
    if (flag === "--help" || flag === "-h" || flag === "--version" || flag === "-v") {
      return { helpOrVersion: true, rest: [] };
    }
    if (flag.includes("=")) {
      i++;
      continue;
    }
    if (GLOBAL_FLAGS_WITH_VALUE.has(flag) && args[i + 1] && !args[i + 1].startsWith("-")) {
      i += 2;
    } else {
      i++;
    }
  }
  return { helpOrVersion: false, rest: args.slice(i) };
}

function analyzeItemGet(args: string[]): OpAnalysis {
  const fieldsArg = getFieldsArg(args);
  if (!fieldsArg) {
    return {
      allowed: false,
      reason: "op item get returns every field (including concealed passwords) by default. Pass --fields with known-safe fields only.",
    };
  }

  const fields = fieldsArg.replace(/^["']|["']$/g, "").split(",").map((field) => field.trim()).filter(Boolean);
  if (!fields.length) {
    return { allowed: false, reason: "op item get: empty --fields list." };
  }

  for (const field of fields) {
    if (!isSafeField(field)) {
      return {
        allowed: false,
        reason: `op item get: field "${field}" is not in the known-safe list.`,
      };
    }
  }

  if (args.includes("--reveal")) {
    return { allowed: false, reason: "op item get: --reveal is blocked because it unmasks concealed fields." };
  }

  return { allowed: true };
}

function analyzeOpArgs(args: string[]): OpAnalysis {
  const { helpOrVersion, rest } = stripGlobalFlags(args);
  if (helpOrVersion) return { allowed: true };

  const sub = rest[0];
  const subArgs = rest.slice(1);
  if (!sub) return { allowed: true };

  if (SAFE_SUBCOMMANDS_NO_ARGS.has(sub)) return { allowed: true };

  if (LIST_GET_SUBCOMMANDS.has(sub)) {
    const action = subArgs[0];
    if (!action || action === "list" || action === "get") return { allowed: true };
    return { allowed: false, reason: `op ${sub} ${action}: only 'list' and 'get' are permitted for this subcommand.` };
  }

  if (sub === "item") {
    const action = subArgs[0];
    if (action === "list" || action === "template") return { allowed: true };
    if (action === "get") return analyzeItemGet(subArgs.slice(1));
    return { allowed: false, reason: `op item ${action || "(missing action)"}: blocked. Only list and get with safe --fields are permitted.` };
  }

  if (sub === "read") {
    const ref = subArgs.find((arg) => arg.startsWith("op://"));
    if (!ref) return { allowed: false, reason: "op read: no op:// reference found — blocked as a safety measure." };
    const parts = ref.replace(/^op:\/\//, "").split("/").filter(Boolean);
    if (parts.length < 3) return { allowed: false, reason: `op read: malformed reference "${ref}".` };
    const field = parts[parts.length - 1];
    if (isSafeField(field)) return { allowed: true };
    return { allowed: false, reason: `op read: field "${field}" is not in the known-safe list.` };
  }

  if (ALWAYS_BLOCKED_SUBCOMMANDS[sub]) {
    return { allowed: false, reason: `op ${sub}: blocked. ${ALWAYS_BLOCKED_SUBCOMMANDS[sub]}` };
  }

  return { allowed: false, reason: `op ${sub}: unrecognized subcommand, blocked as a safety measure.` };
}

function commandMentionsOp(command: string): boolean {
  return /(^|[\s;|&`(])op(\s|$)/.test(command);
}

function analyzeOpCommand(command: string): OpAnalysis {
  for (const segment of splitSegments(command)) {
    const tokens = shellTokenize(segment);
    let i = 0;
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
    if (i >= tokens.length) continue;
    const commandToken = tokens[i];
    if (commandToken !== "op" && !commandToken.endsWith("/op")) continue;
    const result = analyzeOpArgs(tokens.slice(i + 1));
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

function check1Password(event: ToolCallEvent): BlockResult | undefined {
  if (tool(event) !== "bash") return undefined;
  const command = inputString(event.input, ["command"]);
  if (!command || !commandMentionsOp(command)) return undefined;

  const result = analyzeOpCommand(command);
  if (!result.allowed) {
    return {
      block: true,
      reason: `[Hook] BLOCKED: Unsafe 1Password command. ${result.reason ?? "Blocked as a safety measure."}`,
    };
  }

  return undefined;
}

function checkLargeFile(event: ToolCallEvent): BlockResult | undefined {
  if (tool(event) !== "write") return undefined;
  const content = inputString(event.input, ["content", "text"]);
  if (!content) return undefined;
  const lines = content.split("\n").length;
  if (lines > 800) {
    return {
      block: true,
      reason: `[Hook] BLOCKED: File has ${lines} lines (max 800). Split into smaller modules.`,
    };
  }
  return undefined;
}

function formatBashApproval(command: string, analysis: BashAnalysis): string {
  const rules = analysis.matches.map((match) => `- ${match.id}: ${match.summary}\n  Consequence: ${match.consequence}`).join("\n");
  return [
    "Exact command:",
    command,
    "",
    "Matched rules:",
    rules,
    "",
    "Undo status: Not guaranteed recoverable",
    "Source: bash tool call",
  ].join("\n");
}

async function checkDangerousBash(event: ToolCallEvent, ctx?: HookContext): Promise<BlockResult | undefined> {
  if (tool(event) !== "bash") return undefined;
  const command = inputString(event.input, ["command"]);
  if (!command) return undefined;

  const config = loadPatterns().bash;
  const analysis = analyzeBashCommand(command, config);
  if (analysis.severity === "allow") return undefined;

  const details = formatBashApproval(command, analysis);
  if (analysis.severity === "block") {
    return {
      block: true,
      reason: `[Hook] BLOCKED: Dangerous bash command matched blocked rule(s): ${analysis.matches.map((match) => match.id).join(", ")}.\n${details}`,
    };
  }

  if (ctx?.ui?.confirm === undefined) {
    return {
      block: true,
      reason: `[Hook] APPROVAL REQUIRED: Dangerous bash command requires user approval.\n${details}`,
    };
  }

  const approved = await ctx.ui.confirm("Dangerous bash command requires approval", details);
  if (!approved) {
    return {
      block: true,
      reason: "[Hook] BLOCKED: User denied dangerous bash command.",
    };
  }

  return undefined;
}

export default function register(api: HookAPI): void {
  api.on("tool_call", async (event, ctx) => {
    const checks = [
      checkSecretProtection,
      checkCredentialGate,
      check1Password,
      checkLargeFile,
    ];

    for (const check of checks) {
      const result = check(event);
      if (result) return result;
    }

    return checkDangerousBash(event, ctx);
  });
}
