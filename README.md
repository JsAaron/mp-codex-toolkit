# MP Codex Toolkit

微信小程序开发工具集，提供 Git 监控、错误监控、日志管理和自动部署功能。

## 工作流程

1. **Git 监控启动** → 定时检测远程仓库更新
2. **发现更新** → 自动执行 `git pull`
3. **拉取成功** → 触发小程序监控
4. **小程序监控** → 启动微信开发者工具自动化
5. **错误捕获** → 记录错误信息、截图、页面堆栈日志
6. **日志上传** → 自动上传到远程服务器（可选）
7. **自动修复** → 服务器根据上传的错误信息，通过配置Agent任务执行自动修复（服务器实现）

## 功能特性

### 1. Git 监控 (`git-monitor`)
- 自动监控 Git 仓库变化
- 定时检测远程更新并自动拉取
- 拉取成功后自动触发小程序监控
- 支持多仓库监控
- 失败自动重试机制

### 2. 小程序监控 (`mp-monitor`)
- 实时监控微信小程序运行时错误
- 支持多种错误类型捕获：
  - `console.error` / `console.warn` - 控制台错误和警告
  - `scripterror` - 脚本错误
  - `pageerror` - 页面错误
  - `exception` - 异常事件
  - `systemError` - 系统错误
- 自动生成错误日志和页面日志
- 错误截图自动保存
- 堆栈信息解析和定位

### 3. 日志管理
- 错误日志自动分类存储
- 页面日志周期性记录
- 可配置的日志清理策略

### 4. Debug 上传 (`debugUpload`)
- 自动上传错误日志到远程服务器
- 支持 SSH/rsync 协议传输
- 可配置上传触发时机（错误发生时自动上传）
- 支持密钥认证，安全可靠
- 断点续传，避免重复上传
- 上传失败自动记录，便于排查

### 5. 自动部署 (`mp-deploy`)
- 一键打包发布小程序
- 版本号管理
- 构建描述自定义


## 目录结构

```
mp-codex-toolkit/
├── config.js                  # 统一配置文件（模板）
├── config.local.js            # 本地配置文件（个人配置，不提交）
├── config.loader.js           # 配置加载器
├── git-monitor/               # Git 监控模块
│   └── git-monitor.js         # Git 监控主程序
├── mp-monitor/                # 小程序监控模块
│   ├── mp-monitor.js          # 小程序监控主程序
│   └── upload-to-server.js    # 日志上传工具
├── mp-deploy/                 # 小程序部署模块
│   └── deploy.js              # 部署脚本
├── debug/                     # 日志输出目录
│   ├── git-monitor.log        # Git 监控日志
│   ├── mp-monitor/            # 小程序监控日志
│   │   ├── page-error/        # 错误日志（含截图）
│   │   └── page-logs/         # 页面日志
└── start.sh                   # 启动脚本
```


## 安装

### 1. 克隆项目

```bash
git clone <repository-url> mp-codex-toolkit
cd mp-codex-toolkit
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置微信开发者工具

确保已安装微信开发者工具，进入微信开发者工具安装位置，并且能够找到对应的执行文件：

- macOS: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Windows: `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`

### 4. 配置私有设置

**重要：配置文件采用覆盖机制**

创建 `config.local.js` 文件，只配置需要覆盖的部分：

```bash
# 单独创建本地配置文件
touch config.local.js
```

**配置机制说明：**
- `config.js` - 默认配置（提交到 Git，所有人共享）
- `config.local.js` - 私有配置（不提交，只覆盖需要修改的部分）
- `config.loader.js` - 配置加载器（自动合并两个配置文件）

**完整配置示例（包含所有可覆盖项）：**

```javascript
// config.local.js
module.exports = {
  // Git 监控配置
  gitMonitor: {
    repositories: [
      {
        name: 'gaofenwx',
        path: '/你的项目路径/gaofenwx',
        branch: 'chenwen-codex',
        type: 'miniapp',
        enabled: true
      }
    ]
  },

  // 小程序监控配置
  mpMonitor: {
    startup: {
      path: '/你的项目路径/gaofenwx',
      // 微信开发者工具的路径，windows如下(可能的路径)：
      cliPath: 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'
    }
  },

  // Debug 上传配置
  debugUpload: {
    enabled: false, // 本地开发时可以关闭上传
    // 如果需要上传，配置以下信息：
    host: '你的服务器IP',
    user: '你的用户名',
    remotePath: '/你的远程路径',
    identityFile: '/你的本地SSH密钥路径'
  },

  // 小程序部署配置(单独使用，非必须配置)
  mpDeploy: {
    projectPath: '/你的项目路径/gaofenwx'
  }
}
```

## 使用方法

### 启动 Git 监控

```bash
# 使用启动脚本
./start.sh

# 或直接运行
cd git-monitor
node git-monitor.js
```

### 单独运行小程序监控

```bash
cd mp-monitor
node mp-monitor.js
```

### 单独部署小程序

```bash
cd mp-deploy
node deploy.js
```

## 日志说明

### 错误日志结构

```
debug/mp-monitor/page-error/
└── HH-MM-SS_console.error/
    ├── error.json          # 错误详情
    └── screenshot.png      # 错误截图
```

**error.json 内容：**

```json
{
  "type": "console.error",
  "message": "错误信息",
  "page": "pages/home/home",
  "time": "2026-05-21T08:30:00.000Z",
  "pageLogFile": "../debug/mp-monitor/page-logs/xxx.log",
  "stackLocations": [
    {
      "function": "handleClick",
      "file": "home.js",
      "line": 123,
      "column": 45
    }
  ]
}
```

### 页面日志结构

```
debug/mp-monitor/page-logs/
└── [ERROR]_page-1_pages-home-home_HH-MM-SS.log
```

日志文件前缀说明：
- `[ENTER]` - 进入页面时生成
- `[LEAVE]` - 离开页面时生成
- `[ERROR]` - 发生错误时生成
- `[NORMAL]` - 正常页面切换时生成


## 高级配置

### 禁用特定错误类型

```javascript
errorCapture: {
  console: {
    error: true,
    warn: false      // 不捕获警告
  },
  scripterror: true,
  pageerror: false,  // 不捕获页面错误
  exception: true,
  systemError: true
}
```

### 禁用页面日志生成

```javascript
logs: {
  clear: true,
  dir: '../debug/mp-monitor',
  generatePageLogs: false  // 不生成页面日志，只生成错误日志
}
```

### 禁用日志上传

```javascript
debugUpload: {
  enabled: false  // 关闭自动上传
}
```

## 依赖项

- `miniprogram-automator` - 微信小程序自动化工具
- `fs-extra` - 文件系统增强
- `axios` - HTTP 客户端（可选）
- `tail` - 日志监听（可选）

---

## 配置参数详解

本章节详细说明 `config.js` 中所有配置项的含义、类型和使用方法。

### 1. gitMonitor - Git 监控配置

用于监控 Git 仓库的远程更新，自动拉取代码并触发后续操作。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `interval` | Number | `10000` | 检测间隔时间（毫秒），建议不低于 5000ms |
| `fetchTimeout` | Number | `120000` | fetch 超时时间（毫秒），网络慢或后端仓库较大时可调大；仓库配置中可单独覆盖 |
| `preferSshForGithub` | Boolean | `true` | 检测到 GitHub HTTPS remote 时自动切换为 SSH remote，减少后台监控的 HTTPS 连接和凭据问题 |
| `repositories` | Array | `[]` | 监控的仓库列表，支持多仓库 |
| `repositories[].name` | String | - | 仓库名称，用于日志标识，建议使用项目名 |
| `repositories[].path` | String | - | 仓库本地路径（绝对路径），必须是有效的 Git 仓库 |
| `repositories[].branch` | String | - | 监控的分支名称，如 `main`、`chenwen-codex` |
| `repositories[].enabled` | Boolean | `true` | 是否启用该仓库的监控，`false` 则跳过 |
| `repositories[].type` | String | - | 仓库类型，必填。`miniapp` 表示小程序仓库，拉取成功后会触发小程序监控；`backend` 表示后端仓库，仅拉取代码，不触发小程序监控 |
| `logFile` | String | - | Git 监控日志文件路径，建议使用绝对路径 |
| `retryTimes` | Number | `3` | 拉取失败时的重试次数，0 表示不重试 |
| `retryDelay` | Number | `5000` | 重试间隔时间（毫秒） |

仓库类型需要明确配置：

- `type: 'miniapp'`：小程序仓库。拉取成功后会启动 `mp-monitor`。
- `type: 'backend'`：后端仓库。只执行 Git 监控和代码拉取，不启动 `mp-monitor`。

`afterPull` 是旧配置方式，新配置不需要再写。后端仓库配置了 `type: 'backend'` 后，不需要额外写 `afterPull: 'none'`。

> 私有仓库建议使用 SSH remote（如 `git@github.com:owner/repo.git`）或系统级 Git 凭据 helper。后台监控会禁用 VS Code askpass，避免 HTTPS 凭据弹窗在无交互环境中卡到超时。

**示例：**

```javascript
gitMonitor: {
  interval: 10000,
  fetchTimeout: 120000,
  preferSshForGithub: true,
  retryTimes: 3,
  retryDelay: 5000,
  repositories: [
    {
      name: 'gaofenwx',
      path: '/Users/chenwen/work/项目/gaofenwx',
      branch: 'chenwen-codex',
      type: 'miniapp',
      enabled: true
    },
    {
      name: 'gzhServer',
      path: '/Users/chenwen/work/项目/gzhServer',
      branch: 'cw-dev-525',
      enabled: true,
      type: 'backend'
    }
  ]
}
```

### 2. mpMonitor - 小程序监控配置

用于监控微信小程序运行时错误，自动捕获并记录错误信息。

#### 2.1 顶层配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | Boolean | `true` | 是否启用小程序监控功能 |

#### 2.2 startup - 启动配置

用于连接微信开发者工具并启动自动化测试。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `path` | String | - | 小程序项目路径（绝对路径） |
| `cliPath` | String | - | 微信开发者工具 CLI 路径 |
| `port` | Number | `10984` | 自动化测试端口号，需与开发者工具设置一致 |
| `connection.timeout` | Number | `10000` | 连接超时时间（毫秒） |
| `connection.maxRetries` | Number | `3` | 连接失败最大重试次数 |
| `connection.retryDelay` | Number | `3000` | 连接重试间隔时间（毫秒） |

**微信开发者工具 CLI 路径：**
- macOS: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Windows: `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`

#### 2.3 automation.pageWatch - 页面监听配置

用于监控页面变化和自动刷新。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `interval` | Number | `500` | 页面变化检测间隔（毫秒），建议 300-1000ms |
| `autoRefresh` | Boolean | `true` | 是否在页面变化时自动刷新 |
| `refreshDelay` | Number | `3000` | 刷新延迟时间（毫秒），给页面加载留出时间 |

#### 2.4 automation.logs - 日志配置

控制日志文件的生成和管理。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `clear` | Boolean | `true` | 启动时是否清空旧日志文件 |
| `dir` | String | `'../debug/mp-monitor'` | 日志输出目录（相对于 mp-monitor 目录） |
| `generatePageLogs` | Boolean | `true` | 是否生成页面日志文件 |

**generatePageLogs 说明：**
- `true`: 生成完整的页面日志（进入、离开、错误时）
- `false`: 只生成错误日志，不记录页面日志

#### 2.5 automation.errorCapture - 错误捕获配置

控制捕获哪些类型的错误。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `console.error` | Boolean | `true` | 是否捕获 `console.error` |
| `console.warn` | Boolean | `false` | 是否捕获 `console.warn` |
| `scripterror` | Boolean | `true` | 是否捕获脚本错误（JS 运行时错误） |
| `pageerror` | Boolean | `true` | 是否捕获页面错误（页面加载、渲染错误） |
| `exception` | Boolean | `true` | 是否捕获异常事件（未捕获的 Promise rejection 等） |
| `systemError` | Boolean | `true` | 是否捕获系统错误（小程序框架层错误） |

**错误类型说明：**

| 错误类型 | 触发场景 | 示例 |
|---------|---------|------|
| `console.error` | 代码中主动调用 `console.error()` | `console.error('数据加载失败')` |
| `console.warn` | 代码中主动调用 `console.warn()` | `console.warn('即将废弃的 API')` |
| `scripterror` | JavaScript 运行时错误 | `undefined.foo()` |
| `pageerror` | 页面渲染错误 | WXML 模板错误、组件错误 |
| `exception` | 未捕获的异常 | `Promise.reject()` 未处理 |
| `systemError` | 小程序框架错误 | 路由错误、API 调用错误 |

**示例配置：**

```javascript
// 只捕获严重错误，忽略警告
errorCapture: {
  console: {
    error: true,
    warn: false
  },
  scripterror: true,
  pageerror: true,
  exception: true,
  systemError: true
}

// 捕获所有类型的错误和警告
errorCapture: {
  console: {
    error: true,
    warn: true
  },
  scripterror: true,
  pageerror: true,
  exception: true,
  systemError: true
}
```

### 3. debugUpload - Debug 上传配置

用于将错误日志自动上传到远程服务器，便于远程调试和分析。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | Boolean | `true` | 是否启用自动上传功能 |
| `host` | String | - | 远程服务器 IP 地址或域名 |
| `port` | Number | `22` | SSH 端口号 |
| `user` | String | - | SSH 登录用户名 |
| `remotePath` | String | - | 远程服务器上的目标路径（绝对路径） |
| `identityFile` | String | - | SSH 私钥文件路径（用于免密登录） |

**使用前提：**
1. 远程服务器已安装 `rsync`
2. 本地已配置 SSH 密钥认证
3. 远程路径有写入权限

**SSH 密钥配置：**

```bash
# 1. 生成 SSH 密钥（如果没有）
ssh-keygen -t rsa -b 4096 -f ~/.ssh/chenwen_key

# 2. 将公钥复制到服务器
ssh-copy-id -i ~/.ssh/chenwen_key.pub chenwen@43.106.0.58

# 3. 设置密钥权限
chmod 600 ~/.ssh/chenwen_key

# 4. 测试连接
ssh -i ~/.ssh/chenwen_key chenwen@43.106.0.58
```

**示例配置：**

```javascript
// 启用上传
debugUpload: {
  enabled: true,
  host: '43.106.0.58',
  port: 22,
  user: 'chenwen',
  remotePath: '/home/chenwen/repository/gaofenwx/debug',
  identityFile: '/Users/chenwen/.ssh/chenwen_key'
}

// 禁用上传（本地调试）
debugUpload: {
  enabled: false
}
```

### 4. mpDeploy - 小程序部署配置

用于一键打包和发布小程序到微信平台。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `projectPath` | String | - | 小程序项目路径（绝对路径） |
| `cliPath` | String | - | 微信开发者工具 CLI 路径 |
| `version` | String | `'1.0.0'` | 发布版本号（遵循语义化版本规范） |
| `desc` | String | - | 版本描述信息，会显示在微信后台 |

**版本号规范：**

遵循语义化版本（Semantic Versioning）：`主版本号.次版本号.修订号`

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

**示例：**
- `1.0.0` - 初始版本
- `1.1.0` - 新增功能
- `1.1.1` - Bug 修复
- `2.0.0` - 重大更新

**示例配置：**

```javascript
mpDeploy: {
  projectPath: '/Users/chenwen/work/项目/gaofenwx',
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  version: '1.2.3',
  desc: '修复首页加载问题，优化性能'
}
```
---

## 配置验证

启动前建议验证配置是否正确：

```bash
# 检查 Git 仓库路径
ls -la /path/to/your/project/.git

# 检查微信开发者工具 CLI
/Applications/wechatwebdevtools.app/Contents/MacOS/cli --version

# 检查 SSH 连接
ssh -i /Users/chenwen/.ssh/chenwen_key chenwen@43.106.0.58

# 检查远程路径
ssh chenwen@43.106.0.58 "ls -la /home/chenwen/repository/gaofenwx/debug"
```


## 常见问题

### 1. 微信开发者工具连接失败

确保：
- 开发者工具已打开
- 已开启"服务端口"（设置 → 安全 → 服务端口）
- 端口号配置正确（默认 10984）

### 2. Git 拉取失败

检查：
- 仓库路径是否正确
- 是否有本地未提交的修改
- 网络连接是否正常
- SSH 密钥是否配置正确

### 3. 日志上传失败

确认：
- SSH 密钥路径正确
- 远程服务器可访问
- 远程路径有写入权限

#### 常见上传错误及解决方案

**错误 1：Permission denied (publickey)**

```bash
# 原因：SSH 密钥权限不正确或密钥未添加到服务器
# 解决方案：
chmod 600 /Users/chenwen/.ssh/chenwen_key
ssh-add /Users/chenwen/.ssh/chenwen_key

# 测试连接
ssh -i /Users/chenwen/.ssh/chenwen_key chenwen@43.106.0.58
```

**错误 2：No such file or directory**

```bash
# 原因：远程路径不存在
# 解决方案：在服务器上创建目录
ssh chenwen@43.106.0.58 "mkdir -p /home/chenwen/repository/gaofenwx/debug"
```

**错误 3：rsync: command not found**

```bash
# 原因：服务器未安装 rsync
# 解决方案：在服务器上安装
# Ubuntu/Debian:
sudo apt-get install rsync

# CentOS/RHEL:
sudo yum install rsync
```

**错误 4：Connection timeout**

```bash
# 原因：网络问题或防火墙阻止
# 解决方案：
# 1. 检查网络连接
ping 43.106.0.58

# 2. 检查 SSH 端口是否开放
telnet 43.106.0.58 22

# 3. 检查防火墙规则（服务器端）
sudo ufw status
sudo ufw allow 22/tcp
```

**错误 5：Host key verification failed**

```bash
# 原因：服务器密钥未添加到 known_hosts
# 解决方案：
ssh-keyscan -H 43.106.0.58 >> ~/.ssh/known_hosts
```

#### 手动测试上传

```bash
# 测试 rsync 上传
rsync -avz -e "ssh -i /Users/chenwen/.ssh/chenwen_key" \
  /path/to/local/debug/ \
  chenwen@43.106.0.58:/home/chenwen/repository/gaofenwx/debug/

# 查看上传日志
tail -f debug/git-monitor.log | grep upload
```

#### 调试模式

在 `mp-monitor/upload-to-server.js` 中启用详细日志：

```javascript
// 查看完整的 rsync 命令和输出
console.log('执行命令:', rsyncCommand)
console.log('stdout:', stdout)
console.log('stderr:', stderr)
```

### 4. 错误未被捕获

检查 `config.js` 中的 `errorCapture` 配置，确保对应的错误类型已启用。

---

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request。

## 更新日志

### v1.0.0 (2026-05-21)
- 初始版本发布
- Git 监控功能
- 小程序错误监控
- 日志管理和上传
- 自动部署功能
