const path = require('path')

module.exports = {
  // Git 监控配置
  gitMonitor: {
    interval: 10000,
    repositories: [
      {
        name: 'gaofenwx',
        path: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',
        branch: 'chenwen-codex',
        enabled: true
      }
    ],
    logFile: path.join(__dirname, 'debug/git-monitor.log'),
    retryTimes: 3,
    retryDelay: 5000
  },

  //小程序监控
  mpMonitor: {
    enabled: true,
    runOnPullSuccess: true,
    scriptPath: path.join(__dirname, 'mp-monitor/mp-monitor.js'),

    //启动小程序项目基础配置
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

    // 小程序自动化测试配置
    automation: {
      pageWatch: {
        interval: 500,
        autoRefresh: true,
        refreshDelay: 3000
      },
      // 日志配置
      logs: {
        clearOnStart: true,
        dir: '../debug/mp-monitor',
        generatePageLogs: true // 是否生成 page-logs 文件
      },
      // 错误捕获配置
      errorCapture: {
        console: {
          error: true, // 捕获 console.error
          warn: false // 捕获 console.warn
        },
        scripterror: true, // 捕获脚本错误
        pageerror: true, // 捕获页面错误
        exception: true, // 捕获异常事件
        systemError: true // 捕获系统错误
      }
    }
  },

  // debug上传服务器配置
  debugUpload: {
    enabled: false,
    host: '43.106.0.58',
    port: 22,
    user: 'chenwen',
    remotePath: '/home/chenwen/repository/gaofenwx/debug',
    identityFile: '/Users/chenwen/.ssh/chenwen_key'
  },

  //小程自动打包发布
  mpDeploy: {
    projectPath: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    version: '1.0.0',
    desc: '自动构建版本'
  }
}
