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
    const expected = ["coding-assistant", "octo-pi"];
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
      ["coding-assistant", { source: "./coding-assistant", version: "1.0.0" }],
      ["octo-pi", { source: "./octo-pi", version: "1.0.2" }],
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

@test "package OMP extension entrypoints exist for each plugin" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const expectedExtensions = new Map([
      ["coding-assistant", ["./hooks/pre/core-safety.ts"]],
      ["octo-pi", ["./src/main.ts"]],
    ]);
    const catalog = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));

    for (const entry of catalog.plugins) {
      const pluginRoot = path.join(root, entry.source);
      const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"));
      const expected = expectedExtensions.get(entry.name);
      if (!expected) throw new Error(`unexpected plugin entry: ${entry.name}`);
      if (JSON.stringify(pkg.omp?.extensions) !== JSON.stringify(expected)) throw new Error(`${entry.name}: unexpected omp.extensions ${JSON.stringify(pkg.omp?.extensions)}`);
      for (const extension of pkg.omp.extensions) {
        if (!extension.startsWith("./")) throw new Error(`${entry.name}: extension must be relative: ${extension}`);
        if (!fs.existsSync(path.join(pluginRoot, extension))) throw new Error(`${entry.name}: missing extension ${extension}`);
      }
    }
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}
