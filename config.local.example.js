/**
 * 本地私有配置模板
 *
 * 使用方式：
 * 1. 复制本文件为 config.local.js
 * 2. 按自己的本地路径、分支、服务器和 SSH 密钥修改
 * 3. config.local.js 已被 .gitignore 忽略，不会提交到 Git
 */

module.exports = {
  gitMonitor: {
    repositories: [
      {
        name: 'gaofenwx',
        path: '/你的项目路径/gaofenwx',
        branch: 'chenwen-codex',
        type: 'miniapp',
        enabled: true
      },
      {
        name: 'gzhServer',
        path: '/你的项目路径/gzhServer',
        branch: 'cw-dev-525',
        type: 'backend',
        enabled: true
      }
    ]
  },

  mpMonitor: {
    startup: {
      path: '/你的项目路径/gaofenwx',
      cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
      port: 10984
    }
  },

  debugUpload: {
    enabled: false,
    host: '你的服务器IP',
    port: 22,
    user: '你的用户名',
    remotePath: '/你的远程路径/gaofenwx/debug',
    identityFile: '/你的本地SSH密钥路径'
  },

  mpDeploy: {
    projectPath: '/你的项目路径/gaofenwx',
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    version: '1.0.0',
    desc: '自动构建版本'
  }
}
