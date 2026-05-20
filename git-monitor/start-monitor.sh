#!/bin/bash

# Git Monitor 启动脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查参数
MODE=${1:-"foreground"}

if [ -f monitor.pid ]; then
    PID=$(cat monitor.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Git 监控程序已在运行 (PID: $PID)"
        echo "如需停止，请运行: ./stop-monitor.sh"
        exit 1
    fi
fi

if [ "$MODE" = "background" ] || [ "$MODE" = "bg" ]; then
    # 后台运行模式
    echo "🚀 启动 Git 监控程序（后台模式）..."
    nohup node git-monitor.js > monitor-output.log 2>&1 &
    echo $! > monitor.pid
    
    echo "✅ Git 监控程序已启动 (PID: $(cat monitor.pid))"
    echo "📋 日志文件: git-monitor.log"
    echo "📋 输出日志: monitor-output.log"
    echo ""
    echo "查看日志: tail -f git-monitor.log"
    echo "停止监控: ./stop-monitor.sh"
else
    # 前台运行模式（默认）
    echo "🚀 启动 Git 监控程序（前台模式）..."
    echo "📋 实时日志输出中... (Ctrl+C 停止)"
    echo "=========================================="
    echo ""
    
    # 捕获 Ctrl+C 信号
    trap 'echo ""; echo "👋 监控程序已停止"; exit 0' INT
    
    # 前台运行，直接显示日志
    node git-monitor.js
fi
