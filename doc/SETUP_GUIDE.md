# 微信开发者工具配置指南

## 必须完成的配置

### 1. 开启服务端口（最重要！）

**路径**: 微信开发者工具 → 设置 → 安全设置 → 服务端口

- [x] 勾选"开启服务端口"
- 默认端口: 9420
- 这是automator能够连接的关键

### 2. 开启命令行调用

**路径**: 微信开发者工具 → 设置 → 通用设置

- [x] 勾选"允许命令行调用"

### 3. 确认CLI路径

macOS默认路径:
```
/Applications/wechatwebdevtools.app/Contents/MacOS/cli
```

验证CLI是否可用:
```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli --version
```

## 配置验证

完成上述配置后，运行验证脚本:

```bash
cd scripts/auto-fix-agent
node test-dom-capture.js
```

## 常见问题

### Q1: "Failed to launch wechat web devTools, please make sure http port is open"

**原因**: 未开启服务端口

**解决**:
1. 打开微信开发者工具
2. 设置 → 安全设置 → 开启"服务端口"
3. 重启微信开发者工具

### Q2: CLI命令无响应

**原因**: 未开启命令行调用权限

**解决**:
1. 设置 → 通用设置 → 开启"允许命令行调用"
2. 重启终端

### Q3: 端口被占用

**检查端口**:
```bash
lsof -i :9420
```

**解决**: 关闭占用端口的进程或在微信开发者工具中修改端口号

## 测试步骤

### 第一步: 测试CLI编译功能
```bash
node test-capture-only.js
```
预期结果: 能看到编译检查的输出

### 第二步: 测试automator功能
```bash
node test-dom-capture.js
```
预期结果: 
- 小程序启动成功
- 捕获到页面数据
- 捕获到DOM结构
- 生成页面截图

### 第三步: 查看测试结果
```bash
ls -lh test-results/
```

应该包含:
- page-data.json (页面数据)
- dom-tree.json (DOM结构)
- page-screenshot.png (页面截图)
- console-logs.json (控制台日志)
