module.exports = [
  {
    name: '拍照解题-首页入口进入上传页',
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
  },
  {
    name: '拍照解题-真实删除当前历史后结果区清空',
    enabled: false,
    description: '会真实删除当前账号第一条拍照解题历史；需要确认测试账号可删除数据后再启用。',
    steps: [
      { action: 'open', page: 'packagePhotoSolve/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
      {
        action: 'skipIfPageDataEmpty',
        path: 'historyRecords.0',
        reason: '当前账号没有可删除的拍照解题历史'
      },
      { action: 'callPageMethodWithPageData', method: 'onHistoryTap', path: 'historyRecords.0', waitAfter: 2500 },
      { action: 'expectElement', selector: '#solutionResult' },
      { action: 'callPageMethodWithPageData', method: 'deleteHistoryRecord', path: 'historyRecords.0', waitAfter: 1500 },
      { action: 'expectText', text: '暂无解题内容' },
      { action: 'expectNoElement', selector: '#solutionResult' },
      { action: 'screenshot', name: 'photo-solve-real-delete-current' }
    ]
  }
]
