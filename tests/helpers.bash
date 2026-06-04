#!/usr/bin/env bash

setup_base() {
  export REPO_ROOT
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
}

teardown_base() {
  :
}
