# Git 监控程序使用说明

## 功能特性

✅ **自动检测代码更新**：每 10 秒检测一次远程仓库更新  
✅ **自动拉取代码**：发现更新后自动执行 `git pull`  
✅ **自动运行测试**：拉取成功后自动启动 `auto-fix.js` 进行错误检测  
✅ **本地保护**：检测到未提交修改时跳过拉取并告警  
✅ **错误重试**：网络失败时自动重试 3 次  
✅ **详细日志**：记录所有操作和 auto-fix 输出

---

## 启动方式

### 方式一：前台运行（默认，推荐）
直接显示实时日志，按 `Ctrl+C` 停止：

```bash
./start-monitor.sh
```

### 方式二：后台运行
在后台运行，需要查看日志文件：

```bash
./start-monitor.sh background
# 或
./start-monitor.sh bg
```

## 停止监控

### 前台模式
按 `Ctrl+C` 即可停止

### 后台模式
```bash
./stop-monitor.sh
```

## 查看日志

### 实时查看
```bash
tail -f git-monitor.log
```

### 查看最近日志
```bash
tail -20 git-monitor.log
```

## 配置修改

编辑 `git-monitor-config.json`：

```json
{
  "interval": 10000,          // 检测间隔（毫秒）10秒
  "retryTimes": 3,            // 失败重试次数
  "retryDelay": 5000,         // 重试间隔（毫秒）
  "repositories": [
    {
      "name": "gaofenwx",
      "path": "仓库路径",
      "branch": "chenwen-codex",
      "enabled": true
    }
  ],
  "autoFix": {
    "enabled": true,          // 是否启用 auto-fix
    "scriptPath": "auto-fix.js 路径",
    "runOnPullSuccess": true  // 拉取成功后是否自动运行
  }
}
```

## 工作流程

1. **检测更新**：每 10 秒检测远程仓库是否有新提交
2. **拉取代码**：发现更新后自动执行 `git pull`
3. **启动测试**：拉取成功后等待 2 秒，自动启动 `auto-fix.js`
4. **错误检测**：`auto-fix.js` 会自动运行小程序并捕获错误
5. **保存日志**：所有错误和日志保存到 `error-logs` 目录

## 日志说明

- `git-monitor.log` - 监控日志（检测、拉取记录）
- `monitor-output.log` - 程序输出日志（仅后台模式）
- `error-logs/` - auto-fix 生成的错误日志和截图

## 常见问题

### Q: 如何修改检测间隔？
A: 编辑 `git-monitor-config.json`，修改 `interval` 值（单位：毫秒）

### Q: 如何监控多个仓库？
A: 在 `repositories` 数组中添加多个仓库配置

### Q: 本地有未提交修改会怎样？
A: 监控程序会跳过拉取并告警，不会影响本地修改

### Q: 如何禁用 auto-fix 自动运行？
A: 编辑配置文件，设置 `autoFix.runOnPullSuccess: false`

### Q: auto-fix 运行时可以手动停止吗？
A: 可以，停止监控程序时会自动停止 auto-fix 进程

### Q: 如何查看 auto-fix 的输出？
A: 前台模式下会直接显示 `[AutoFix]` 前缀的日志
