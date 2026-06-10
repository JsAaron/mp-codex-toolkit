module.exports = [
  {
    name: '记忆卡-真实历史重新填写进入输入态',
    enabled: false,
    description: '使用当前账号已有的最新记忆卡历史，不 mock、不调用真实生成接口；没有历史时自动跳过。',
    steps: [
      { action: 'open', page: 'packageMemoryCard/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
      {
        action: 'skipIfPageDataEmpty',
        path: 'latestCreatedRecord',
        reason: '当前账号没有可重填的最新记忆卡历史'
      },
      { action: 'expectElement', selector: '.latest-result-panel' },
      { action: 'callPageMethod', method: 'onResetCreateTask', waitAfter: 1000 },
      { action: 'expectNoElement', selector: '.latest-result-panel' },
      { action: 'expectNoElement', selector: '.create-task-panel-completed' },
      { action: 'expectElement', selector: '#createMemoryCard' },
      { action: 'screenshot', name: 'memory-card-real-history-refill' }
    ]
  },
  {
    name: '记忆卡-真实删除当前最新历史后主结果不残留',
    enabled: true,
    description: '会真实删除当前账号第一条记忆卡历史；需要确认测试账号可删除数据后再启用。',
    steps: [
      { action: 'open', page: 'packageMemoryCard/pages/pluginbase/pluginbase', method: 'reLaunch', waitAfter: 5000 },
      {
        action: 'skipIfPageDataEmpty',
        path: 'historyRecords.0',
        reason: '当前账号没有可删除的最新记忆卡历史'
      },
      { action: 'expectElement', selector: '.latest-result-panel' },
      { action: 'savePageData', name: 'deletedRecord', path: 'historyRecords.0' },
      { action: 'callPageMethodWithSavedData', method: 'deleteHistoryRecord', from: 'deletedRecord', waitAfter: 1500 },
      { action: 'expectRecordRemoved', from: 'deletedRecord', historyPath: 'historyRecords', latestPath: 'latestCreatedRecord' },
      { action: 'screenshot', name: 'memory-card-real-delete-latest' }
    ]
  }
]
