const path = require('path')

/**
 * MP Codex Toolkit 配置文件
 *
 * 说明：
 * - 本文件是默认配置模板（提交到 Git）
 * - 创建 config.local.js 覆盖个人配置（不提交）
 * - 使用 config.loader.js 自动合并配置
 */
module.exports = {
  // ==================== Git 监控配置 ====================
  gitMonitor: {
    interval: 10000, // 检测间隔（毫秒）
    fetchTimeout: 120000, // fetch 超时时间（毫秒）
    preferSshForGithub: true, // GitHub HTTPS remote 自动切换为 SSH，避免后台监控受 HTTPS 连接/凭据影响
    retryTimes: 3, // 失败重试次数
    retryDelay: 5000, // 重试间隔（毫秒）

    repositories: [
      {
        name: 'gaofenwx', // 仓库名称，用于日志标识
        path: 'D:\\appcode\\gaofenwx', // 仓库本地路径（绝对路径）
        branch: 'chenwen-codex', // 监控的分支名称
        enabled: true // 是否启用该仓库的监控，false 则跳过
      }
    ]
  },

  // ==================== 小程序监控配置 ====================
  mpMonitor: {
    enabled: true,

    // 启动配置
    startup: {
      path: 'D:\\appcode\\gaofenwx', // 小程序项目路径（绝对路径）
      cliPath: 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat', // 微信开发者工具 CLI 路径
      port: 10984, // 自动化测试端口号，需与开发者工具设置一致

      connection: {
        timeout: 10000,
        maxRetries: 3,
        retryDelay: 3000
      }
    },

    // 自动化配置
    automation: {
      pageWatch: {
        interval: 500,
        autoRefresh: true,
        refreshDelay: 3000
      },

      tabSmokeTest: {
        enabled: true,
        pages: [],
        includeAppJsonPages: true,
        includeAppJsonMainPages: ['pages/home/home', 'pages/profile/profile', 'pages/about/about'],
        includeAppJsonPageRoots: ['packageMemoryCard', 'packageSpecialTrain'],
        excludePages: [],
        pageEntryMethod: 'auto',
        scanButtons: true,
        scanEventControls: true,
        tapEventControls: true,
        maxTapPerPage: 20,
        componentScanDepth: 2,
        tapDelay: 1000,
        tapHandlerBlacklist: ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack'],
        tapBlacklist: ['支付', '删除', '注销', '退出', '登录', '授权', '提交订单'],
        screenshot: true,
        outputDir: 'page-smoke-test',
        clearOutputBeforeRun: true
      },

      autoFix: {
        suggestAfterTest: true
      },

      logs: {
        clear: true,
        dir: '../debug/mp-monitor',
        generatePageLogs: true
      },

      errorCapture: {
        console: { error: true, warn: false },
        scripterror: true,
        pageerror: true,
        exception: true,
        systemError: true
      }
    }
  },

  // ==================== Debug 上传配置 ====================
  debugUpload: {
    enabled: true, // 是否启用自动上传功能
    host: '43.106.0.58', // 远程服务器 IP 地址或域名
    port: 22, // SSH 端口号
    user: 'xiaowanyun', // SSH 登录用户名
    remotePath: '/home/xiaowanyun/gaofenwx/debug', // 远程服务器上的目标路径（绝对路径）
    identityFile: 'C:\\Users\\Administrator\\.ssh\\xiaowanyun_key' // SSH 私钥文件路径（用于免密登录）
  },

  // ==================== 小程序部署配置 ====================
  mpDeploy: {
    projectPath: 'D:\\appcode\\gaofenwx', // 小程序项目路径（绝对路径）
    cliPath: 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat', // 微信开发者工具 CLI 路径
    version: '1.0.0', // 发布版本号（遵循语义化版本规范）
    desc: '自动构建版本' // 版本描述信息，会显示在微信后台
  }
}
