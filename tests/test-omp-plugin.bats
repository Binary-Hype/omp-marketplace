#!/usr/bin/env bats

load helpers

setup() {
  setup_base
}

teardown() {
  teardown_base
}

@test "marketplace catalog declares the expected plugin inventory" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const catalog = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));
    const expected = ["coding-assistant"];
    if (catalog.name !== "binary-hype-omp") throw new Error(`unexpected catalog name: ${catalog.name}`);
    if (!Array.isArray(catalog.plugins)) throw new Error("catalog.plugins must be an array");
    const actual = catalog.plugins.map((entry) => entry.name);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`unexpected plugin inventory: ${actual.join(", ")}`);
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "catalog entries match plugin package and manifest metadata" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const repository = "https://github.com/Binary-Hype/omp-marketplace";
    const expected = new Map([
      ["coding-assistant", { source: "./coding-assistant", version: "1.2.1" }],
    ]);
    const catalog = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));

    for (const entry of catalog.plugins) {
      const spec = expected.get(entry.name);
      if (!spec) throw new Error(`unexpected plugin entry: ${entry.name}`);
      if (entry.source !== spec.source) throw new Error(`${entry.name}: unexpected source ${entry.source}`);
      if (entry.version !== spec.version) throw new Error(`${entry.name}: unexpected catalog version ${entry.version}`);
      if (entry.category !== "developer-tools") throw new Error(`${entry.name}: unexpected category ${entry.category}`);
      if (entry.repository !== repository || entry.homepage !== repository) throw new Error(`${entry.name}: unexpected catalog repository/homepage`);
      if (entry.license !== "GPL-3.0") throw new Error(`${entry.name}: unexpected catalog license ${entry.license}`);

      const pluginRoot = path.join(root, entry.source);
      if (!fs.existsSync(pluginRoot)) throw new Error(`${entry.name}: missing plugin source path`);
      const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"));
      const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json"), "utf8"));
      for (const document of [pkg, manifest]) {
        if (document.name !== entry.name) throw new Error(`${entry.name}: metadata name mismatch: ${document.name}`);
        if (document.version !== spec.version) throw new Error(`${entry.name}: version mismatch: ${document.version}`);
        if (document.repository !== repository || document.homepage !== repository) throw new Error(`${entry.name}: repository/homepage mismatch`);
        if (document.license !== "GPL-3.0") throw new Error(`${entry.name}: license mismatch: ${document.license}`);
        if (!Array.isArray(document.keywords) || document.keywords.length === 0) throw new Error(`${entry.name}: missing keywords`);
      }
      if (pkg.omp?.name !== entry.name) throw new Error(`${entry.name}: package omp.name mismatch`);
      if (typeof pkg.omp?.description !== "string" || pkg.omp.description.length === 0) throw new Error(`${entry.name}: missing omp.description`);
    }
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "plugin exposes only marketplace-loaded skills" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const catalog = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));
    const entry = catalog.plugins.find((plugin) => plugin.name === "coding-assistant");
    if (!entry) throw new Error("missing coding-assistant catalog entry");

    const pluginRoot = path.join(root, entry.source);
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"));
    if (pkg.omp?.extensions !== undefined) throw new Error("coding-assistant: omp.extensions must be absent");

    for (const removedPath of ["hooks", "tests", "tsconfig.json", "bun.lock"]) {
      if (fs.existsSync(path.join(pluginRoot, removedPath))) throw new Error(`coding-assistant: removed artifact still exists: ${removedPath}`);
    }

    const expectedSkills = [
      "api-design",
      "commit-message",
      "database-reviewer",
      "dependency-auditor",
      "grill-me",
      "humanizer",
      "merge-conflict-resolver",
      "promote-prs",
      "quality-check",
      "test-generator",
    ];
    const skillsRoot = path.join(pluginRoot, "skills");
    const actualSkills = fs.readdirSync(skillsRoot)
      .filter((entryName) => fs.statSync(path.join(skillsRoot, entryName)).isDirectory())
      .sort();
    if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) throw new Error(`coding-assistant: unexpected skills ${actualSkills.join(", ")}`);

    for (const skill of expectedSkills) {
      const skillFile = path.join(skillsRoot, skill, "SKILL.md");
      if (!fs.existsSync(skillFile)) throw new Error(`coding-assistant: missing ${skill}/SKILL.md`);
    }
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "README advertises only marketplace-loaded skills" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

    if (!readme.includes("OMP-specific marketplace for Binary Hype OMP skills.")) throw new Error("README missing skills-only opening sentence");
    if (!readme.includes("Marketplace-loaded skills are invoked with singular `/skill:<name>` syntax:")) throw new Error("README missing marketplace-loaded skills heading");

    for (const forbidden of ["core-safety", "safety hook", "Safety configuration", "denylist", "OMP_SECURITY_CACHE_DIR", "hooks/pre"]) {
      if (readme.includes(forbidden)) throw new Error(`README still advertises removed safety extension text: ${forbidden}`);
    }
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "skill docs use OMP skill invocation syntax" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const expectedSkills = [
      "api-design",
      "commit-message",
      "database-reviewer",
      "dependency-auditor",
      "grill-me",
      "humanizer",
      "merge-conflict-resolver",
      "promote-prs",
      "quality-check",
      "test-generator",
    ];
    const skillsRoot = path.join(root, "coding-assistant/skills");
    const markdownFiles = [];

    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".md")) {
          markdownFiles.push(full);
        }
      }
    }

    walk(skillsRoot);

    const legacyInvocation = new RegExp(`/(${expectedSkills.join("|")})(?=$|[^A-Za-z0-9_-])`);
    for (const file of markdownFiles) {
      const text = fs.readFileSync(file, "utf8");
      const relative = path.relative(root, file);
      if (text.includes("/skills:")) throw new Error(`${relative} contains /skills:`);
      if (legacyInvocation.test(text)) throw new Error(`${relative} contains legacy direct invocation`);
    }

    const commitSkill = fs.readFileSync(path.join(skillsRoot, "commit-message/SKILL.md"), "utf8");
    const contract = "When `/skill:commit-message` injects this skill body, treat the injection itself as a direct user request: create a commit message for the repository'\''s already-staged changes.";
    if (!commitSkill.includes(contract)) throw new Error("commit-message invocation contract missing");
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}
