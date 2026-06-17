module.exports = [
  {
    name: '专项训练-插件入口初始态正确',
    enabled: false,
    description: '验证专项训练新入口 pluginbase 可打开，并处于空输入态。',
    steps: [
      { action: 'open', page: 'packageSpecialTrain/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 3000 },
      { action: 'expectText', text: '开始分析' },
      { action: 'expectPageData', path: 'inputText', equals: '' },
      { action: 'screenshot', name: 'special-train-pluginbase-initial' }
    ]
  },
  {
    name: '专项训练-空输入不创建任务',
    enabled: false,
    steps: [
      { action: 'open', page: 'packageSpecialTrain/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 3000 },
      { action: 'callPageMethod', method: 'onSubmit', waitAfter: 800 },
      { action: 'expectPageData', path: 'submitting', equals: false },
      { action: 'expectPageContains', page: 'packageSpecialTrain/pages/pluginbase/pluginbase' },
      { action: 'screenshot', name: 'special-train-empty-submit' }
    ]
  },
  {
    name: '专项训练-短输入不创建任务',
    enabled: false,
    steps: [
      { action: 'open', page: 'packageSpecialTrain/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 3000 },
      { action: 'setPageData', data: { inputText: '函数' }, waitAfter: 300 },
      { action: 'callPageMethod', method: 'onSubmit', waitAfter: 800 },
      { action: 'expectPageData', path: 'submitting', equals: false },
      { action: 'expectPageContains', page: 'packageSpecialTrain/pages/pluginbase/pluginbase' },
      { action: 'screenshot', name: 'special-train-short-submit' }
    ]
  },
  {
    name: '专项训练-真实创建任务后confirm重新输入回到pluginbase',
    enabled: false,
    description: '从 pluginbase 真实创建任务，保存页面返回的 taskid，再验证 confirm 回流路径。',
    steps: [
      { action: 'open', page: 'packageSpecialTrain/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 3000 },
      { action: 'setPageData', data: { inputText: '函数专项训练测试' }, waitAfter: 300 },
      { action: 'callPageMethod', method: 'onSubmit', waitAfter: 3000 },
      { action: 'expectPageContains', page: 'packageSpecialTrain/pages/confirm/confirm' },
      { action: 'savePageData', name: 'taskid', path: 'taskid' },
      {
        action: 'expectPageData',
        path: 'taskid',
        empty: false
      },
      { action: 'callPageMethod', method: 'onReinput', waitAfter: 1000 },
      { action: 'expectPageContains', page: 'packageSpecialTrain/pages/pluginbase/pluginbase' },
      { action: 'expectPageData', path: 'inputText', equals: '函数专项训练测试' },
      { action: 'screenshot', name: 'special-train-confirm-reinput' }
    ]
  },
  {
    name: '专项训练-真实taskid等待完成态跳转result',
    enabled: false,
    description: '从 pluginbase 真实创建任务，保存 taskid 后进入 wait，验证真实任务状态流转。',
    steps: [
      { action: 'open', page: 'packageSpecialTrain/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 3000 },
      { action: 'setPageData', data: { inputText: '函数专项训练测试' }, waitAfter: 300 },
      { action: 'callPageMethod', method: 'onSubmit', waitAfter: 3000 },
      { action: 'expectPageContains', page: 'packageSpecialTrain/pages/confirm/confirm' },
      { action: 'savePageData', name: 'taskid', path: 'taskid' },
      { action: 'callPageMethod', method: 'onConfirm', waitAfter: 1000 },
      {
        action: 'open',
        page: 'packageSpecialTrain/pages/wait/wait?taskid={{taskid}}',
        method: 'reLaunch',
        waitAfter: 8000
      },
      { action: 'expectPageContains', page: 'packageSpecialTrain/pages/result/result' },
      { action: 'screenshot', name: 'special-train-wait-to-result' }
    ]
  }
]
