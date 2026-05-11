# 问题排查指南

## 当前问题

`automator.launch()` 一直报错：`Failed to launch wechat web devTools, please make sure http port is open`

## 可能的原因

1. **微信开发者工具已经打开了项目** - automator.launch会尝试重新启动，导致冲突
2. **端口被占用** - 59092端口虽然可以连接，但可能不是automator需要的端口
3. **自动化测试已手动开启** - 与automator.launch的自动启动冲突

## 解决方案

### 方案1: 完全关闭微信开发者工具后重试

1. **完全退出微信开发者工具**（不是关闭项目，是退出应用）
2. 运行测试脚本，让automator.launch自动启动

```bash
node test-launch-method.js
```

### 方案2: 使用CLI手动启动自动化模式

1. 关闭微信开发者工具中手动开启的自动化测试
2. 使用CLI命令启动：

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" auto \
  --project "/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx" \
  --auto-port 9420
```

3. 修改config.js中的端口为9420
4. 使用connect方式连接

### 方案3: 检查微信开发者工具版本

某些版本的微信开发者工具可能不支持automator，或者有bug。

检查版本：
```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" --version
```

建议使用稳定版本（1.05.x 或更高）

## 下一步测试

请尝试：
1. **完全退出**微信开发者工具
2. 运行 `node test-launch-method.js`
3. 观察是否能自动启动并连接
