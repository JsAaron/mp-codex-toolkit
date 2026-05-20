# Auto-Fix Agent

自动化代码监控和错误检测工具

## 目录结构

```
auto-fix-agent/
├── git-monitor/          # Git 监控模块
│   ├── git-monitor.js           # 监控主程序
│   ├── git-monitor-config.json  # 监控配置
│   ├── start-monitor.sh         # 启动脚本
│   ├── stop-monitor.sh          # 停止脚本
│   └── README.md                # 使用说明
│
├── auto-fix/             # 错误检测模块
│   ├── auto-fix.js              # 错误检测主程序
│   ├── config.js                # 配置文件
│   ├── monitor.js               # 监控工具
│   ├── test-capture.js          # 测试工具
│   └── test-console-event.js    # 控制台事件测试
│
├── error-logs/           # 错误日志目录（自动生成）
├── start.sh              # 主启动脚本
└── README.md             # 本文件
```

## 快速开始

### 方式一：使用主启动脚本

```bash
./start.sh
```

然后选择：
- `1` - 启动 Git 监控（自动检测代码更新并运行测试）
- `2` - 仅启动 Auto-Fix（手动运行错误检测）

### 方式二：直接启动 Git 监控

```bash
cd git-monitor
./start-monitor.sh
```

### 方式三：直接启动 Auto-Fix

```bash
cd auto-fix
node auto-fix.js
```

## 功能说明

### Git 监控模块
- 自动检测远程仓库代码更新
- 自动拉取最新代码
- 拉取成功后自动启动 auto-fix 进行错误检测

### Auto-Fix 模块
- 自动运行小程序
- 捕获运行时错误
- 生成错误日志和截图
- 保存到 error-logs 目录

## 配置

### Git 监控配置
编辑 `git-monitor/git-monitor-config.json`

### Auto-Fix 配置
编辑 `auto-fix/config.js`
