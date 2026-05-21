const path = require('path')

/**
 * MP Codex Toolkit 配置文件
 *
 * 本文件包含所有模块的配置项，包括：
 * - gitMonitor: Git 仓库监控配置
 * - mpMonitor: 小程序错误监控配置
 * - debugUpload: 日志上传配置
 * - mpDeploy: 小程序部署配置
 */
module.exports = {
  /**
   * Git 监控配置
   * 用于监控 Git 仓库的远程更新，自动拉取代码并触发后续操作
   */
  gitMonitor: {
    interval: 10000, // 检测间隔时间（毫秒），默认 10 秒检测一次

    repositories: [
      {
        name: 'gaofenwx', // 仓库名称，用于日志标识
        path: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx', // 仓库本地路径（绝对路径）
        branch: 'chenwen-codex', // 监控的分支名称
        enabled: true // 是否启用该仓库的监控，false 则跳过
      }
    ],

    logFile: path.join(__dirname, 'debug/git-monitor.log'), // Git 监控日志文件路径
    retryTimes: 3, // 拉取失败时的重试次数
    retryDelay: 5000 // 重试间隔时间（毫秒）
  },

  /**
   * 小程序监控配置
   * 用于监控微信小程序运行时错误，自动捕获并记录错误信息
   */
  mpMonitor: {
    enabled: true, // 是否启用小程序监控功能
    runOnPullSuccess: true, // Git 拉取成功后是否自动启动小程序监控
    scriptPath: path.join(__dirname, 'mp-monitor/mp-monitor.js'), // 监控脚本路径

    /**
     * 启动小程序项目基础配置
     * 用于连接微信开发者工具并启动自动化测试
     */
    startup: {
      path: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx', // 小程序项目路径（绝对路径）
      cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli', // 微信开发者工具 CLI 路径
      port: 10984, // 自动化测试端口号，需与开发者工具设置一致

      connection: {
        timeout: 10000, // 连接超时时间（毫秒）
        maxRetries: 3, // 连接失败最大重试次数
        retryDelay: 3000 // 连接重试间隔时间（毫秒）
      }
    },

    /**
     * 小程序自动化测试配置
     * 控制页面监听、日志记录和错误捕获行为
     */
    automation: {
      /**
       * 页面监听配置
       * 用于监控页面变化和自动刷新
       */
      pageWatch: {
        interval: 500, // 页面变化检测间隔（毫秒）
        autoRefresh: true, // 是否在页面变化时自动刷新
        refreshDelay: 3000 // 刷新延迟时间（毫秒），给页面加载留出时间
      },

      /**
       * 日志配置
       * 控制日志文件的生成和管理
       */
      logs: {
        clearOnStart: true, // 启动时是否清空旧日志文件
        dir: '../debug/mp-monitor', // 日志输出目录（相对于 mp-monitor 目录）
        generatePageLogs: true // 是否生成页面日志文件（包含页面进入、离开、错误时的日志）
      },

      /**
       * 错误捕获配置
       * 控制捕获哪些类型的错误
       */
      errorCapture: {
        console: {
          error: true, // 是否捕获 console.error
          warn: false // 是否捕获 console.warn
        },
        scripterror: true, // 是否捕获脚本错误（JS 运行时错误）
        pageerror: true, // 是否捕获页面错误（页面加载、渲染错误）
        exception: true, // 是否捕获异常事件（未捕获的 Promise rejection 等）
        systemError: true // 是否捕获系统错误（小程序框架层错误）
      }
    }
  },

  /**
   * Debug 上传服务器配置
   * 用于将错误日志自动上传到远程服务器，便于远程调试和分析
   */
  debugUpload: {
    enabled: true, // 是否启用自动上传功能
    host: '43.106.0.58', // 远程服务器 IP 地址或域名
    port: 22, // SSH 端口号
    user: 'chenwen', // SSH 登录用户名
    remotePath: '/home/chenwen/repository/gaofenwx/debug', // 远程服务器上的目标路径（绝对路径）
    identityFile: '/Users/chenwen/.ssh/chenwen_key' // SSH 私钥文件路径（用于免密登录）
  },

  /**
   * 小程序自动打包发布配置
   * 用于一键打包和发布小程序到微信平台
   */
  mpDeploy: {
    projectPath: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx', // 小程序项目路径（绝对路径）
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli', // 微信开发者工具 CLI 路径
    version: '1.0.0', // 发布版本号（遵循语义化版本规范）
    desc: '自动构建版本' // 版本描述信息，会显示在微信后台
  }
}
