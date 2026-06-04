#!/usr/bin/env bash

setup_base() {
  export REPO_ROOT
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"

  export TEST_TMPDIR
  TEST_TMPDIR="$(mktemp -d)"

  export ORIGINAL_HOME="$HOME"
  export HOME="$TEST_TMPDIR/home"
  mkdir -p "$HOME/.omp/agent/security"

  export CACHE_DIR="$TEST_TMPDIR/cache"
  mkdir -p "$CACHE_DIR"
  export OMP_SECURITY_CACHE_DIR="$CACHE_DIR"

  export OMP_PLUGIN_ROOT="$REPO_ROOT"
}

teardown_base() {
  if [ -n "${TEST_TMPDIR:-}" ] && [ -d "$TEST_TMPDIR" ]; then
    rm -rf "$TEST_TMPDIR"
  fi
  if [ -n "${ORIGINAL_HOME:-}" ]; then
    export HOME="$ORIGINAL_HOME"
  fi
}
