# 页面级 Flow TDD 实现方案

## 背景

这次改造来自一个真实页面回归问题：

```txt
记忆卡历史记录删除后，页面主结果区仍可能显示旧内容。
点击重新填写后，旧完成面板可能没有按预期隐藏。
拍照解题删除历史后，解题结果区也需要同步清空。
```

这类问题的共同点是：接口本身不一定失败，页面也能正常打开，但页面内部的状态源没有同步。

因此单纯页面巡检不够，需要一种更贴近用户行为的页面级 TDD：

```txt
打开页面
准备真实或测试状态
执行用户级动作
断言页面状态和 data 是否一致
失败后生成可交给 Codex 的修复任务
```

## 目标

本方案目标是让后续新页面功能也能按同样方式编写回归测试。

目标包括：

- flow 用例按业务功能组织，不继续堆在 `config.js`。
- 测试执行器和业务用例分离。
- 支持只运行某一条 flow。
- 支持真实历史数据回归，不强制使用 mock。
- 支持失败后生成 Codex 修复任务。
- 支持逐步扩展 action，但避免把业务逻辑塞进测试引擎。

## 当前实现结构

```txt
config.js
config.local.example.js
flows/
  photo-solve.flows.js
  memory-card-real-history.flows.js
mp-monitor/
  mp-monitor.js
  flow-runner.js
  flow-actions.js
docs/
  flow-tdd-user-guide.md
  page-flow-tdd-implementation-plan.md
```

职责划分：

```txt
config.js
只保留运行配置和 flow 文件引用。

flows/*.flows.js
保存业务用例。一个文件对应一个功能域或一类回归测试。

mp-monitor/flow-actions.js
负责单个 step 的具体执行。

mp-monitor/flow-runner.js
负责完整 flow 的执行、结果汇总、失败截图、Codex 修复任务生成。

mp-monitor/mp-monitor.js
负责连接微信开发者工具、错误监听、页面巡检和主流程调度。
```

## 为什么拆出 flows

之前 flow 全部写在 `config.js` 里，会带来几个问题：

- 配置文件越来越大，难以知道哪些是真配置，哪些是测试用例。
- 新增业务测试时容易误改全局配置。
- 临时切换 `enabled` 成为常态，不利于团队协作。
- 拍照解题、记忆卡、真实接口、mock 测试混在一起，维护成本高。

拆分后：

```js
flows: [
  ...require('./flows/photo-solve.flows'),
  ...require('./flows/memory-card-real-history.flows')
]
```

新增业务测试时，只需要新增：

```txt
flows/new-feature.flows.js
```

## 为什么拆出 flow-actions

`flow-actions.js` 是测试执行能力层。

它负责把配置里的 step：

```js
{ action: 'expectText', text: '暂无内容' }
```

转换为真实自动化操作：

```txt
读取当前页面文本
判断是否包含目标文本
失败时抛出可读错误
```

它应该保持通用，不应该知道具体业务。

推荐放在 `flow-actions.js` 的能力：

```txt
open
tap
wait
expectText
expectElement
expectNoElement
setPageData
savePageData
callPageMethod
callPageMethodWithPageData
callPageMethodWithSavedData
setComponentData
callComponentMethod
screenshot
```

可以接受的通用业务模式：

```txt
expectRecordRemoved
```

因为很多页面都有“历史列表 + 当前详情”的同步问题。

不建议加入过于具体的 action：

```txt
expectMemoryCardDeleted
expectPhotoSolveCleared
```

这些应该留在 flow 编排里表达。

## 为什么拆出 flow-runner

`flow-runner.js` 负责完整执行生命周期：

```txt
读取 flowConfig
根据 enabled、--flow 名称片段或 --flow 文件路径筛选 flow
逐步执行 step
记录每一步结果
失败时截图
输出每条 flow 的 JSON
输出 summary
生成 Codex 修复任务
```

这部分和单个 action 的实现无关，单独拆出后主入口更清楚。

## 新页面功能的 TDD 设计流程

后续如果有新页面功能，可以按下面流程设计。

### 1. 明确页面行为，而不是先写 selector

先把需求写成用户可感知的行为：

```txt
用户从首页进入新功能页
页面初始态显示空状态
用户输入内容后出现预览
用户提交后展示结果
用户删除历史后结果区不再显示被删记录
```

不要一开始就写：

```txt
点击 .xxx
断言 .yyy
```

selector 是实现细节，行为才是测试目标。

### 2. 判断用 mock、真实历史还是真实接口

建议分三层：

```txt
页面状态 TDD
使用 setPageData、setComponentData 或 mock 参数，最快最稳定。

真实历史数据回归
不 mock，不调用生成接口，直接使用当前账号已有历史。

真实接口全链路
真实上传、真实生成、真实保存，适合作为发布前冒烟测试。
```

高频 TDD 推荐前两层。

### 3. 新建 flow 文件

例如：

```txt
flows/new-feature.flows.js
```

结构示例：

```js
module.exports = [
  {
    name: '新功能-初始空状态正确',
    enabled: true,
    steps: [
      { action: 'open', page: 'packageX/pages/newFeature/newFeature', method: 'reLaunch', waitAfter: 5000 },
      { action: 'expectElement', selector: '#mainForm' },
      { action: 'expectText', text: '暂无内容' },
      { action: 'screenshot', name: 'new-feature-empty' }
    ]
  }
]
```

然后在 `config.js` 引用：

```js
flows: [
  ...require('./flows/photo-solve.flows'),
  ...require('./flows/memory-card-real-history.flows'),
  ...require('./flows/new-feature.flows')
]
```

### 4. 用 `--flow` 单独调试

不要为了调试频繁改 `enabled`。

按名称片段运行单条或一组 flow：

```powershell
node .\mp-monitor.js --flow "新功能-初始空状态"
```

按文件路径运行某个 `flows/*.flows.js` 文件里的全部 flow：

```powershell
node .\mp-monitor.js --flow "..\flows\new-feature.flows.js"
```

如果不确定名称：

```powershell
node .\mp-monitor.js --list-flows
```

## 真实历史数据回归的设计原则

真实历史数据测试的重点不是“生成一条新数据”，而是利用当前账号已有数据验证页面状态同步。

适合测试：

```txt
删除历史后，当前详情区不再展示被删记录。
删除最新记录后，如果还有下一条，页面切换到下一条。
删除最后一条后，页面展示空态。
重新填写后，旧完成面板隐藏。
```

不适合测试：

```txt
AI 是否生成正确答案。
上传接口是否稳定。
OCR 是否识别正确。
```

真实历史测试建议使用：

```txt
skipIfPageDataEmpty
savePageData
callPageMethodWithSavedData
expectRecordRemoved
```

示例：

```js
{
  name: '记忆卡-真实删除当前最新历史后主结果不残留',
  enabled: true,
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
```

## 删除测试的关键判断

不要简单断言结果面板一定消失。

以记忆卡为例，正常逻辑是：

```txt
如果删除后还有历史记录：
latest-result-panel 可以继续存在，但必须切换到下一条。

如果删除后没有历史记录：
latest-result-panel 应该消失。
```

因此正确断言是：

```txt
被删记录不在 historyRecords 中
被删记录不再是 latestCreatedRecord
```

这比：

```txt
expectNoElement('.latest-result-panel')
```

更符合真实业务。

## Codex 修复任务生成

flow 失败后，如果开启：

```js
autoFix: {
  suggestAfterTest: true
}
```

会生成：

```txt
debug/mp-monitor/fix-tasks/latest.json
debug/mp-monitor/fix-tasks/latest-fix-request.md
```

修复任务包含：

```txt
失败 flow
失败 step
失败 action
错误信息
当前页面
失败截图
flow 结果 JSON
```

可以直接用终端输出的命令交给 Codex：

```powershell
$request = Get-Content -Raw -LiteralPath "D:\appcode\mp-codex-toolkit\debug\mp-monitor\fix-tasks\latest-fix-request.md"
codex exec --cd "D:\appcode\gaofenwx" $request
```

## 新增 Action 的原则

新增 action 前先问三个问题：

```txt
这个动作是否至少两个业务页面都可能用到？
它是否表达通用测试能力，而不是某个业务特例？
能否通过已有 action 组合完成？
```

建议新增：

```txt
expectPageDataChanged
expectArrayNotContainsRecord
expectComponentData
tapByTextInSelector
```

谨慎新增：

```txt
expectRecordRemoved
```

这是一个常见模式，可以接受，但后续如果类似能力变多，应该进一步拆成更通用的数据断言。

不建议新增：

```txt
expectMemoryCardLatestCleared
expectPhotoSolveAnswerHidden
```

这类业务动作应该写在 flow 文件里。

## 推荐后续演进

当前已经完成第一阶段拆分：

```txt
业务 flow 从 config.js 拆出。
flow runner 从主入口拆出。
flow actions 从主入口拆出。
支持 --flow 按名称片段或文件路径调试。
支持失败生成 Codex 修复任务。
```

下一阶段可以继续做：

```txt
清理 mp-monitor.js 中旧的 flow 辅助函数。
把页面巡检相关能力拆成 page-smoke-runner.js。
把 record 对比能力拆到 assertions/record-assertions.js。
支持 tags，例如 --tag memory-card。
支持 config.local.js 覆盖单条 flow enabled 状态。
支持 expectComponentData。
```

## 总结

这次方案的核心原则是：

```txt
用 flows 表达业务。
用 actions 表达自动化能力。
用 runner 管理执行生命周期。
用 Codex 修复任务承接失败结果。
```

后续新页面功能只要按这个结构新增 flow，就能复用同一套页面级 TDD 能力。
