#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL="sonnet"
TARGET="backend"
CONFIRM_OPUS="false"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/claude-launch.sh [--model sonnet|opus] [--target backend|frontend|root] [--confirm-opus]

Examples:
  ./scripts/claude-launch.sh
  ./scripts/claude-launch.sh --target frontend
  ./scripts/claude-launch.sh --model opus --target backend --confirm-opus

Notes:
  - Default model is sonnet.
  - Opus requires --confirm-opus to avoid accidental expensive sessions.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --confirm-opus)
      CONFIRM_OPUS="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found in PATH. Install it first, then retry." >&2
  exit 127
fi

case "$TARGET" in
  backend)
    TARGET_DIR="${ROOT_DIR}/archibald-web-app/backend"
    ;;
  frontend)
    TARGET_DIR="${ROOT_DIR}/archibald-web-app/frontend"
    ;;
  root)
    TARGET_DIR="${ROOT_DIR}"
    ;;
  *)
    echo "Invalid target: ${TARGET}. Use backend|frontend|root." >&2
    exit 1
    ;;
esac

case "$MODEL" in
  sonnet)
    MODEL_ID="claude-sonnet-4-6"
    ;;
  opus)
    MODEL_ID="claude-opus-4-6"
    if [[ "$CONFIRM_OPUS" != "true" ]]; then
      echo "Refusing to launch Opus without --confirm-opus." >&2
      echo "Example: ./scripts/claude-launch.sh --model opus --target backend --confirm-opus" >&2
      exit 1
    fi
    ;;
  *)
    echo "Invalid model: ${MODEL}. Use sonnet|opus." >&2
    exit 1
    ;;
esac

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Target directory not found: $TARGET_DIR" >&2
  exit 1
fi

echo "Setting Claude model: ${MODEL_ID}"
claude config set model "${MODEL_ID}"

echo "Launching Claude in: ${TARGET_DIR}"
echo "Model: ${MODEL_ID}"
cd "${TARGET_DIR}"
exec claude

