#!/usr/bin/env bats

load helpers

setup() {
  setup_base
}

teardown() {
  teardown_base
}

@test "package.json declares the OMP core safety extension" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.version !== "1.0.0") throw new Error(`unexpected package version: ${pkg.version}`);
    if (pkg.repository !== "https://github.com/Binary-Hype/omp-marketplace") throw new Error("unexpected repository");
    if (!Array.isArray(pkg.omp?.extensions) || pkg.omp.extensions.length !== 1) throw new Error(`unexpected omp.extensions: ${JSON.stringify(pkg.omp?.extensions)}`);
    if (pkg.omp.extensions[0] !== "./hooks/pre/core-safety.ts") throw new Error(`unexpected extension: ${pkg.omp.extensions[0]}`);
    if (!fs.existsSync(path.join(root, pkg.omp.extensions[0]))) throw new Error("missing extension file");
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "OMP plugin manifest is product-specific" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const manifest = JSON.parse(fs.readFileSync(path.join(process.argv[1], "plugin.json"), "utf8"));
    if (manifest.name !== "coding-assistant") throw new Error(`unexpected name: ${manifest.name}`);
    if (manifest.version !== "1.0.0") throw new Error(`unexpected version: ${manifest.version}`);
    if (manifest.repository !== "https://github.com/Binary-Hype/omp-marketplace") throw new Error("unexpected repository");
    if (/agent/i.test(manifest.description)) throw new Error("manifest must not advertise bundled agents");
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "root catalog points to the OMP plugin" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const repoRoot = path.dirname(process.argv[1]);
    const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, ".claude-plugin/marketplace.json"), "utf8"));
    if (marketplace.name !== "binary-hype-omp") throw new Error(`unexpected catalog name: ${marketplace.name}`);
    const plugin = marketplace.plugins.find((entry) => entry.name === "coding-assistant");
    if (!plugin) throw new Error("missing coding-assistant marketplace entry");
    if (plugin.source !== "./coding-assistant") throw new Error(`unexpected source: ${plugin.source}`);
    if (plugin.version !== "1.0.0") throw new Error(`unexpected version: ${plugin.version}`);
    if (plugin.repository !== "https://github.com/Binary-Hype/omp-marketplace") throw new Error("unexpected repository");
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}

@test "release metadata versions agree" {
  run node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    const repoRoot = path.dirname(root);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
    const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, ".claude-plugin/marketplace.json"), "utf8"));
    const plugin = marketplace.plugins.find((entry) => entry.name === "coding-assistant");
    const versions = [pkg.version, manifest.version, plugin?.version];
    if (versions.some((version) => version !== "1.0.0")) throw new Error(`version mismatch: ${versions.join(", ")}`);
  ' "$REPO_ROOT"

  [ "$status" -eq 0 ]
}
