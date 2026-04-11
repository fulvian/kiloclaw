#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -x "/home/fulvio/.local/bin/kubectl" ]]; then
  export PATH="/home/fulvio/.local/bin:$PATH"
fi

echo "[wave6] local verification"
bun run --cwd "$ROOT/packages/opencode" test test/kiloclaw/

echo "[wave6] checking staging tooling"
if ! command -v kubectl >/dev/null 2>&1; then
  echo "[wave6] BLOCKER: kubectl not installed in this environment"
  echo "[wave6] install kubectl and configure a staging context, then rerun"
  exit 2
fi

CTX="$(kubectl config current-context 2>/dev/null || true)"
if [[ -z "$CTX" ]]; then
  echo "[wave6] BLOCKER: no active kubectl context"
  echo "[wave6] set staging context and rerun"
  exit 2
fi

echo "[wave6] active context: $CTX"
echo "[wave6] executing non-destructive staging checks"
kubectl get pods -l app=kiloclaw
kubectl get svc kiloclaw

echo "[wave6] canary rollout commands (manual approval required)"
echo "kubectl set image deployment/kiloclaw-canary kiloclaw=kiloclaw:7.2.0-canary"
echo "kubectl rollout status deployment/kiloclaw-canary"
echo "kubectl rollout undo deployment/kiloclaw-canary"

echo "[wave6] completed readiness preflight"
