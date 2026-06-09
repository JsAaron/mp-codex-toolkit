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
    enabled: false, // 是否启用自动上传功能
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
