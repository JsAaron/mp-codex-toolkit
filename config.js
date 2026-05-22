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
    retryTimes: 3, // 失败重试次数
    retryDelay: 5000, // 重试间隔（毫秒）

    repositories: [
      {
        name: 'gaofenwx',
        path: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',
        branch: 'chenwen-codex',
        enabled: true
      }
    ]
  },

  // ==================== 小程序监控配置 ====================
  mpMonitor: {
    enabled: true,

    // 启动配置
    startup: {
      path: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',
      cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
      port: 10984,
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
    enabled: true,
    host: '43.106.0.58',
    port: 22,
    user: 'chenwen',
    remotePath: '/home/chenwen/repository/gaofenwx/debug',
    identityFile: '/Users/chenwen/.ssh/chenwen_key'
  },

  // ==================== 小程序部署配置 ====================
  mpDeploy: {
    projectPath: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    version: '1.0.0',
    desc: '自动构建版本'
  }
}
