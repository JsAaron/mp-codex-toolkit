module.exports = {
  projectPath: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',

  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',

  // 自动化端口配置
  autoPort: 10984,

  // 连接配置
  connection: {
    timeout: 10000,
    maxRetries: 3,
    retryDelay: 3000
  },

  // 错误日志配置
  errorLogs: {
    dir: 'debug-logs',
    clearOnStart: true
  },

  server: {
    enabled: true,
    host: '43.106.0.58',
    port: 22,
    user: 'chenwen',
    remotePath: '/home/chenwen/repository/gaofenwx/debug',
    uploadOnError: true
  }
}
