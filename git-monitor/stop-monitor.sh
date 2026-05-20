#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f monitor.pid ]; then
    echo "⚠️  未找到 PID 文件，监控程序可能未运行"
    exit 1
fi

PID=$(cat monitor.pid)

if ps -p $PID > /dev/null 2>&1; then
    echo "🛑 停止 Git 监控程序 (PID: $PID)..."
    kill $PID
    rm monitor.pid
    echo "✅ 监控程序已停止"
else
    echo "⚠️  进程不存在 (PID: $PID)"
    rm monitor.pid
fi
