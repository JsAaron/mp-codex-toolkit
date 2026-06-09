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
    },
    automation: {
      tabSmokeTest: {
        enabled: false,
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
      flowSmokeTest: {
        enabled: true,
        outputDir: 'flow-smoke-test',
        clearOutputBeforeRun: true,
        stepDelay: 800,
        pageEntryMethod: 'auto',
        screenshot: true,
        flows: [
          {
            name: '拍照解题-首页入口进入上传页',
            enabled: true,
            steps: [
              { action: 'open', page: 'pages/home/home', method: 'switchTab', waitAfter: 5000 },
              { action: 'tap', selector: '.standard-feature-card', text: '拍题讲解', waitAfter: 5000 },
              { action: 'expectPageContains', page: 'packagePhotoSolve/pages/pluginbase/pluginbase' },
              { action: 'expectText', text: '拍照解题' },
              { action: 'expectText', text: '开始解题' },
              { action: 'expectText', text: '解题结果' },
              { action: 'screenshot', name: 'photo-solve-upload-page' }
            ]
          },
          {
            name: '拍照解题-初始空结果正确',
            enabled: true,
            steps: [
              { action: 'open', page: 'packagePhotoSolve/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
              { action: 'expectElement', selector: '#photoSolveTopic' },
              { action: 'expectText', text: '拍照解题' },
              { action: 'expectText', text: '开始解题' },
              { action: 'expectText', text: '解题结果' },
              { action: 'expectText', text: '暂无解题内容' },
              { action: 'screenshot', name: 'photo-solve-empty-state' }
            ]
          },
          {
            name: '拍照解题-注入测试图片后出现缩略图',
            enabled: true,
            steps: [
              { action: 'open', page: 'packagePhotoSolve/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
              {
                action: 'setComponentData',
                selector: '#photoSolveTopic',
                data: {
                  thumbnails: ['/packagePhotoSolve/assets/images/camera.png']
                },
                waitAfter: 500
              },
              { action: 'callComponentMethod', selector: '#photoSolveTopic', method: 'calculateLayout', waitAfter: 500 },
              { action: 'expectElement', selector: '.thumbnail-image' },
              { action: 'screenshot', name: 'photo-solve-image-injected' }
            ]
          },
          {
            name: '拍照解题-相机打开隐藏工具栏',
            enabled: true,
            steps: [
              { action: 'open', page: 'packagePhotoSolve/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
              { action: 'expectElement', selector: '.plugin-toolbar' },
              { action: 'callPageMethod', method: 'onCameraOpen', waitAfter: 500 },
              { action: 'expectNoElement', selector: '.plugin-toolbar' },
              { action: 'callPageMethod', method: 'onCameraClose', waitAfter: 500 },
              { action: 'expectElement', selector: '.plugin-toolbar' },
              { action: 'screenshot', name: 'photo-solve-toolbar-restored' }
            ]
          },
          {
            name: '拍照解题-mock提交后展示结果',
            enabled: true,
            steps: [
              { action: 'open', page: 'packagePhotoSolve/pages/pluginbase/pluginbase?mock=1', method: 'reLaunch', waitAfter: 5000 },
              {
                action: 'callPageMethod',
                method: 'onPhotoSubmit',
                args: [
                  {
                    detail: {
                      images: ['/packagePhotoSolve/assets/images/camera.png'],
                      questionNumber: '1'
                    }
                  }
                ],
                waitAfter: 5000
              },
              { action: 'expectText', text: '答案' },
              { action: 'expectText', text: '解题思路' },
              { action: 'screenshot', name: 'photo-solve-mock-result' }
            ]
          },
          {
            name: '拍照解题-真实接口提交后展示结果',
            enabled: false,
            description: '发布前冒烟测试用。将 images 改成 wx.chooseMedia 产生的真实 tempFilePath 后再启用。',
            steps: [
              { action: 'open', page: 'packagePhotoSolve/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
              {
                action: 'callPageMethod',
                method: 'onPhotoSubmit',
                args: [
                  {
                    detail: {
                      images: ['请替换为真实题图 tempFilePath'],
                      questionNumber: '1'
                    }
                  }
                ],
                waitAfter: 60000
              },
              { action: 'expectText', text: '答案' },
              { action: 'expectText', text: '解题思路' },
              { action: 'screenshot', name: 'photo-solve-real-result' }
            ]
          }
        ]
      },
      autoFix: {
        suggestAfterTest: true
      }
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
