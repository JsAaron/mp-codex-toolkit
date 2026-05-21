# MP Codex Toolkit

微信小程序开发工具集，提供 Git 监控、错误监控、日志管理和自动部署功能。

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
- 支持日志上传到远程服务器
- 可配置的日志清理策略

### 4. 自动部署 (`mp-deploy`)
- 一键打包发布小程序
- 版本号管理
- 构建描述自定义

## 目录结构

```
mp-codex-toolkit/
├── config.js                 # 统一配置文件
├── git-monitor/              # Git 监控模块
│   └── git-monitor.js        # Git 监控主程序
├── mp-monitor/               # 小程序监控模块
│   ├── mp-monitor.js         # 小程序监控主程序
│   └── upload-to-server.js   # 日志上传工具
├── mp-deploy/                # 小程序部署模块
│   └── deploy.js             # 部署脚本
├── debug/                    # 日志输出目录
│   ├── git-monitor.log       # Git 监控日志
│   ├── mp-monitor/           # 小程序监控日志
│   │   ├── page-error/       # 错误日志（含截图）
│   │   └── page-logs/        # 页面日志
└── start.sh                  # 启动脚本
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

确保已安装微信开发者工具，并开启命令行工具：

- macOS: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Windows: `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`

## 配置说明

编辑 `config.js` 文件进行配置：

### Git 监控配置

```javascript
gitMonitor: {
  interval: 10000,              // 检测间隔（毫秒）
  repositories: [               // 监控的仓库列表
    {
      name: 'gaofenwx',
      path: '/path/to/your/project',
      branch: 'chenwen-codex',
      enabled: true
    }
  ],
  logFile: path.join(__dirname, 'debug/git-monitor.log'),
  retryTimes: 3,                // 失败重试次数
  retryDelay: 5000              // 重试延迟（毫秒）
}
```

### 小程序监控配置

```javascript
mpMonitor: {
  enabled: true,                // 是否启用
  runOnPullSuccess: true,       // Git 拉取成功后是否自动运行
  scriptPath: path.join(__dirname, 'mp-monitor/mp-monitor.js'),
  
  // 启动配置
  startup: {
    path: '/path/to/miniprogram',
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    port: 10984,
    connection: {
      timeout: 10000,
      maxRetries: 3,
      retryDelay: 3000
    }
  },
  
  // 自动化测试配置
  automation: {
    pageWatch: {
      interval: 500,            // 页面监听间隔
      autoRefresh: true,        // 是否自动刷新
      refreshDelay: 3000        // 刷新延迟
    },
    logs: {
      clearOnStart: true,       // 启动时清空日志
      dir: '../debug/mp-monitor',
      generatePageLogs: true    // 是否生成页面日志
    },
    // 错误捕获配置
    errorCapture: {
      console: {
        error: true,            // 捕获 console.error
        warn: false             // 捕获 console.warn
      },
      scripterror: true,        // 捕获脚本错误
      pageerror: true,          // 捕获页面错误
      exception: true,          // 捕获异常事件
      systemError: true         // 捕获系统错误
    }
  }
}
```

### 日志上传配置

```javascript
debugUpload: {
  enabled: true,                // 是否启用上传
  host: '43.106.0.58',
  port: 22,
  user: 'chenwen',
  remotePath: '/home/chenwen/repository/gaofenwx/debug',
  identityFile: '/Users/chenwen/.ssh/chenwen_key'
}
```

### 部署配置

```javascript
mpDeploy: {
  projectPath: '/path/to/miniprogram',
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  version: '1.0.0',
  desc: '自动构建版本'
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

### 部署小程序

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

## 工作流程

1. **Git 监控启动** → 定时检测远程仓库更新
2. **发现更新** → 自动执行 `git pull`
3. **拉取成功** → 触发小程序监控
4. **小程序监控** → 启动微信开发者工具自动化
5. **错误捕获** → 记录错误信息、截图、堆栈
6. **日志上传** → 自动上传到远程服务器（可选）

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
  clearOnStart: true,
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
