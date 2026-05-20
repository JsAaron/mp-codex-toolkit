# 微信小程序 CLI 无 GUI 开发完整指南

## 一、核心问题解答

### 1. 微信小程序 CLI 的安装与部署

#### 1.1 CLI 工具位置
微信开发者工具自带 CLI 工具，无需单独安装。路径为：
```bash
# macOS
/Applications/wechatwebdevtools.app/Contents/MacOS/cli

# Windows
C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat
```

#### 1.2 CLI 工具配置
CLI 工具已经集成在开发者工具中，只需确保：
1. 已安装微信开发者工具
2. 开启了**命令行调用**功能（开发者工具 → 设置 → 安全设置 → 服务端口）

#### 1.3 验证 CLI 是否可用
```bash
# macOS
/Applications/wechatwebdevtools.app/Contents/MacOS/cli -h

# 如果显示帮助信息，说明 CLI 可用
```

### 2. CLI 能否完全脱离 GUI 工作？

**答案：部分可以，但有限制**

#### 2.1 可以无 GUI 完成的操作
- ✅ **编译小程序** (`build-npm`)
- ✅ **上传代码** (`upload`)
- ✅ **生成预览二维码** (`preview`)
- ✅ **自动化测试** (`auto` + `miniprogram-automator`)

#### 2.2 必须有 GUI 的操作
- ❌ **首次登录**：需要扫码登录
- ❌ **项目初始化**：需要在 GUI 中创建项目
- ❌ **调试器交互**：需要 GUI 查看调试信息

#### 2.3 实际工作模式
```
开发者工具（后台运行，无需打开窗口）
    ↓
CLI 命令行调用
    ↓
完成编译/上传/预览等操作
```

**关键点**：开发者工具进程需要运行，但**不需要显示窗口**。

---

## 二、基于现有代码的实现分析

### 2.1 `auto-fix.js` - 自动化测试与错误捕获

#### 核心功能
通过 CLI 启动开发者工具的**自动化模式**，实现：
- 自动捕获小程序运行时错误
- 自动截图
- 自动记录日志

#### 关键代码
```javascript
// 1. 启动自动化模式（无需 GUI）
cliProcess = spawn(config.cliPath, [
  'auto',                           // 自动化模式
  '--project', config.projectPath,  // 项目路径
  '--auto-port', '9420'             // 自动化端口
])

// 2. 连接到自动化工具
miniProgram = await automator.connect({ 
  wsEndpoint: 'ws://localhost:9420' 
})

// 3. 自动截图（无需 GUI）
const screenshot = await miniProgram.screenshot()
await fs.writeFile('screenshot.png', Buffer.from(screenshot, 'base64'))
```

#### 工作流程
```
node auto-fix.js
    ↓
启动 CLI auto 模式（后台运行开发者工具）
    ↓
通过 WebSocket 连接到自动化接口
    ↓
监听错误、自动截图、记录日志
    ↓
完全无需打开 GUI 窗口
```

### 2.2 `deploy.js` - 自动编译/上传/预览

#### 核心功能
通过 CLI 实现小程序的完整发布流程：
- 编译小程序
- 上传代码到微信后台
- 生成预览二维码

#### 关键代码
```javascript
// 1. 编译小程序
await execCli([
  'build-npm',
  '--project', config.projectPath
])

// 2. 上传小程序
await execCli([
  'upload',
  '--project', config.projectPath,
  '-v', '1.0.0',              // 版本号
  '-d', '修复bug'             // 版本描述
])

// 3. 生成预览二维码
await execCli([
  'preview',
  '--project', config.projectPath,
  '--qr-format', 'terminal',  // 终端显示
  '--qr-output', './qr.png'   // 保存为图片
])
```

#### 工作流程
```
node deploy.js deploy 1.0.1 "新版本"
    ↓
编译小程序（CLI 调用）
    ↓
上传到微信后台（CLI 调用）
    ↓
生成预览二维码（CLI 调用）
    ↓
完全无需打开 GUI 窗口
```

---

## 三、CLI 与 Agent 结合的可能性

### 3.1 后台功能（已实现）
通过 `auto-fix.js` 实现：
- ✅ 自动化测试
- ✅ 错误监控
- ✅ 自动截图
- ✅ 日志收集

### 3.2 前台功能（可实现）
通过 `deploy.js` + Agent 可以实现：

#### 场景 1：AI 辅助修复 Bug
```
1. auto-fix.js 捕获错误 + 截图
2. Agent 分析错误信息和截图
3. Agent 生成修复代码
4. 自动应用修复
5. deploy.js 重新编译预览
6. 验证修复是否成功
```

#### 场景 2：AI 辅助开发新功能
```
1. 用户描述需求
2. Agent 生成代码
3. deploy.js 编译预览
4. auto-fix.js 自动测试
5. 发现问题 → Agent 修复 → 重新编译
6. 测试通过 → deploy.js 上传发布
```

#### 场景 3：持续集成/持续部署（CI/CD）
```
1. 代码提交到 Git
2. CI 服务器拉取代码
3. deploy.js 自动编译
4. auto-fix.js 自动化测试
5. 测试通过 → deploy.js 自动上传
6. 生成预览二维码 → 通知测试人员
```

### 3.3 实现关键点

#### ✅ 已经可以做到
1. **无 GUI 编译**：`deploy.js build`
2. **无 GUI 上传**：`deploy.js upload`
3. **无 GUI 预览**：`deploy.js preview`
4. **无 GUI 截图**：`auto-fix.js` 中的 `miniProgram.screenshot()`
5. **无 GUI 自动化测试**：`auto-fix.js` 的完整流程

#### ⚠️ 需要注意的限制
1. **首次登录**：需要在 GUI 中扫码登录一次，之后 CLI 会复用登录态
2. **开发者工具进程**：必须保持运行（但可以后台运行，不显示窗口）
3. **网络环境**：上传需要连接微信服务器

---

## 四、实际测试验证

### 4.1 测试 CLI 编译功能
```bash
cd /Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/auto-fix-agent

# 测试编译
node deploy.js build

# 预期输出：
# 📦 开始编译小程序...
# ✅ 编译完成
```

### 4.2 测试 CLI 预览功能
```bash
# 测试生成预览二维码
node deploy.js preview:both

# 预期输出：
# 👀 生成预览二维码（终端+图片）...
# ✅ 二维码图片已保存: /path/to/preview-qr-xxx.png
# [终端显示二维码]
# ✅ 终端二维码已显示
```

### 4.3 测试自动化截图功能
```bash
# 测试自动化测试和截图
node auto-fix.js

# 预期输出：
# 启动监听器...
# 🔄 启动开发者工具自动化模式...
# ✅ 已连接到开发者工具
# [当发生错误时]
# ❌ 捕获到错误: exception
# 📁 日志目录已创建: /path/to/error-logs/2026-05-18/14-18-31
# ✅ 已保存到: error-logs/2026-05-18/14-18-31/
#     ├── screenshot.png  ← 自动截图
#     └── error.json      ← 错误信息
```

---

## 五、完整的无 GUI 开发工作流

### 5.1 初始化（仅需一次）
```bash
# 1. 确保开发者工具已安装
# 2. 在开发者工具中登录一次（扫码）
# 3. 开启命令行调用功能
```

### 5.2 日常开发流程
```bash
# 1. 编写代码
vim pages/home/home.js

# 2. 启动自动化测试（后台监控）
node auto-fix.js &

# 3. 编译预览
node deploy.js preview:both

# 4. 扫码测试
# 5. 如果有错误，auto-fix.js 会自动捕获并截图

# 6. 修复 bug 后重新预览
node deploy.js preview:both

# 7. 测试通过后上传
node deploy.js upload 1.0.1 "修复登录问题"
```

### 5.3 CI/CD 自动化流程
```bash
#!/bin/bash
# ci-deploy.sh

# 1. 拉取最新代码
git pull

# 2. 安装依赖
npm install

# 3. 编译小程序
node deploy.js build

# 4. 自动化测试
timeout 60 node auto-fix.js

# 5. 检查是否有错误
if [ -d "error-logs" ]; then
  echo "❌ 测试发现错误，停止部署"
  exit 1
fi

# 6. 上传到微信后台
node deploy.js upload $VERSION "$DESC"

# 7. 生成预览二维码
node deploy.js preview image ./qr.png

# 8. 发送通知（钉钉/企业微信）
curl -X POST https://webhook.example.com \
  -d "新版本 $VERSION 已上传，请扫码测试"
```

---

## 六、总结

### 6.1 核心结论
1. **微信小程序 CLI 已内置在开发者工具中**，无需单独安装
2. **可以实现 90% 的无 GUI 开发**，包括编译、上传、预览、截图、自动化测试
3. **唯一需要 GUI 的场景**：首次登录扫码
4. **CLI + Agent 的结合**：可以实现前后台功能的完全自动化

### 6.2 现有代码的价值
- `auto-fix.js`：实现了**无 GUI 的自动化测试和错误捕获**
- `deploy.js`：实现了**无 GUI 的编译、上传、预览**
- 两者结合：可以构建**完整的 AI 辅助开发流程**

### 6.3 与 Agent 结合的潜力
```
传统开发流程：
开发 → 手动编译 → 手动测试 → 手动修复 → 手动上传

AI + CLI 自动化流程：
开发 → CLI 自动编译 → CLI 自动测试 → Agent 自动修复 → CLI 自动上传
```

**关键优势**：
- ✅ 完全无需打开 GUI
- ✅ 可以集成到 CI/CD
- ✅ Agent 可以自动分析错误并生成修复代码
- ✅ 可以实现 24/7 自动化监控和修复

---

## 七、参考资料

### 7.1 官方文档
- [微信小程序 CLI 文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html)
- [miniprogram-automator 文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/)

### 7.2 现有代码
- `auto-fix.js`：自动化测试和错误捕获
- `deploy.js`：自动编译、上传、预览
- `config.js`：配置文件

### 7.3 关键配置
```javascript
// config.js
{
  projectPath: '/path/to/your/miniprogram',
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  automatorPort: 9420
}
```

---

## 八、常见问题

### Q1: CLI 提示 "command not found"
**A**: 检查 CLI 路径是否正确，macOS 路径为 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`

### Q2: 自动化模式连接失败
**A**: 确保开发者工具的"服务端口"已开启（设置 → 安全设置 → 服务端口）

### Q3: 上传失败提示未登录
**A**: 需要先在 GUI 中登录一次，CLI 会复用登录态

### Q4: 截图功能不工作
**A**: 确保使用了 `auto` 模式启动开发者工具，而不是普通的 `open` 模式

### Q5: 能否完全不安装开发者工具？
**A**: 不能，CLI 依赖开发者工具的核心功能，但可以后台运行不显示窗口

---

**文档版本**: v1.0  
**更新时间**: 2026-05-18  
**适用范围**: macOS 系统，微信开发者工具 Stable 版本
