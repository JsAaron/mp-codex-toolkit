#!/bin/bash

# Auto-Fix Agent 主启动脚本
# 自动启动 Git 监控，检测到代码更新后自动运行 Auto-Fix

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "  Auto-Fix Agent"
echo "=========================================="
echo ""
echo "🚀 启动 Git 监控程序..."
echo "📋 功能："
echo "   - 每 10 秒检测一次代码更新"
echo "   - 发现更新后自动拉取代码"
echo "   - 拉取成功后自动运行 Auto-Fix 检测错误"
echo ""
echo "=========================================="
echo ""

cd "$SCRIPT_DIR/git-monitor"
./start-monitor.sh
