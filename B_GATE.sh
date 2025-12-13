#!/bin/bash
# B 变更集 - 黑名单门禁验证脚本 (Bash wrapper)
#
# 用法:
#   bash B_GATE.sh

set -euo pipefail

echo "[B_GATE] Running Node gate..."
node ./scripts/b_gate.mjs
