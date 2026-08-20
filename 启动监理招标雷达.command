#!/bin/bash

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="/Users/octopusgump/.cache/codex-runtimes/codex-primary-runtime/dependencies"
LOCAL_URL="http://localhost:3000"

export PATH="$RUNTIME_DIR/bin/fallback:$RUNTIME_DIR/node/bin:/usr/local/bin:/usr/bin:/bin"

cd "$PROJECT_DIR" || exit 1

if [ ! -x "$RUNTIME_DIR/node/bin/node" ]; then
  echo "无法找到网站运行环境，请回到 Codex 让我帮你修复。"
  echo
  read -r -p "按回车键关闭窗口…"
  exit 1
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "项目依赖尚未安装，请回到 Codex 让我帮你安装。"
  echo
  read -r -p "按回车键关闭窗口…"
  exit 1
fi

if curl -fsS "$LOCAL_URL" >/dev/null 2>&1; then
  echo "网站已经在运行，正在打开浏览器…"
  open "$LOCAL_URL"
  exit 0
fi

echo "正在启动监理招标信息雷达…"
echo "启动成功后会自动打开浏览器。"
echo "请保持此窗口开启；关闭窗口即可停止网站。"
echo

(
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    if curl -fsS "$LOCAL_URL" >/dev/null 2>&1; then
      open "$LOCAL_URL"
      exit 0
    fi
    attempt=$((attempt + 1))
    sleep 0.5
  done
) &

exec "$RUNTIME_DIR/node/bin/node" "$PROJECT_DIR/node_modules/vinext/dist/cli.js" dev
