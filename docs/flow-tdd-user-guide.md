# 小程序页面级 TDD 使用说明

## 适用场景

这套 flow 自动化适合围绕一个具体页面或业务功能做页面级 TDD。

典型用途：

- 验证首页入口能进入目标页面。
- 验证页面初始态、空状态、错误态。
- 验证用户操作后页面状态是否正确切换。
- 验证历史记录删除后，主结果区不残留旧数据。
- 验证失败后能生成可交给 Codex 的修复任务。

它不是用来替代真实接口全链路测试的。高频 TDD 应优先测页面状态和业务链路，真实接口测试建议作为发布前冒烟测试。

## 目录结构

当前与 flow TDD 相关的主要文件：

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
debug/
  mp-monitor/
```

职责说明：

```txt
config.js
默认运行配置，例如开发者工具路径、端口、是否启用 flowSmokeTest。

flows/*.flows.js
业务用例配置。每个文件按功能域组织，例如拍照解题、记忆卡真实历史。

mp-monitor/flow-actions.js
执行单个 step.action，例如 open、tap、expectText、callPageMethod。

mp-monitor/flow-runner.js
执行完整 flow，记录步骤结果、失败截图、summary，并生成 Codex 修复任务。

mp-monitor/mp-monitor.js
主入口，负责连接微信开发者工具、绑定错误监听、执行页面巡检和 flow 巡检。
```

## 基本运行

进入工具目录：

```powershell
cd D:\appcode\mp-codex-toolkit\mp-monitor
```

运行默认启用的 flow：

```powershell
node .\mp-monitor.js
```

列出所有可用 flow：

```powershell
node .\mp-monitor.js --list-flows
```

只运行名称包含指定文本的 flow：

```powershell
node .\mp-monitor.js --flow "记忆卡-真实删除"
```

也可以直接运行某个 `flows/*.flows.js` 文件里的全部 flow：

```powershell
node .\mp-monitor.js --flow "..\flows\special-train-plugin.flows.js"
```

如果在仓库根目录运行，需要写主入口路径：

```powershell
node .\mp-monitor\mp-monitor.js --flow "flows\special-train-plugin.flows.js"
```

`--flow` 传普通文本时会匹配 flow 名称；传 `.js` 文件路径时会加载该文件导出的全部 flow。两种方式都会忽略 `enabled: false`，适合临时调试。

## Flow 配置示例

一个 flow 由多个 step 组成：

```js
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
```

## 常用 Action

```txt
open
打开页面。支持 reLaunch、navigateTo、switchTab。

tap
点击元素。可按 selector，也可配合 text 在候选元素中查找。

wait
等待指定毫秒。

expectPageContains
断言当前页面路径包含指定页面片段。

expectText
断言当前页面可见文本包含指定内容。

expectElement
断言元素存在。

expectNoElement
断言元素不存在。

setPageData
直接设置当前页面 data。

savePageData
读取当前页面 data，并保存到 flow 变量。

变量占位
字符串配置支持使用 `{{变量名}}` 引用 `savePageData` 保存的数据，常用于把真实业务 id 带到后续页面。

示例：

```js
{ action: 'savePageData', name: 'taskid', path: 'taskid' },
{ action: 'open', page: 'packageSpecialTrain/pages/wait/wait?taskid={{taskid}}', method: 'reLaunch' }
```

skipIfPageDataEmpty
如果指定页面 data 为空，则跳过整个 flow。

callPageMethod
调用当前页面方法。

callPageMethodWithPageData
读取页面 data 后，把该 data 作为参数调用页面方法。

callPageMethodWithSavedData
使用 savePageData 保存过的数据调用页面方法。

setComponentData
设置组件 data。

callComponentMethod
调用组件方法。

expectRecordRemoved
断言某条已保存记录不再存在于历史列表，也不再是当前最新记录。

screenshot
保存截图。
```

## 真实历史数据测试

真实历史数据测试不使用 mock，也不重新调用真实接口生成新数据。它依赖当前账号已经存在的历史记录。

推荐用途：

```txt
删除历史后，主结果区是否还残留被删记录。
重新填写后，旧结果面板是否隐藏。
点击历史记录后，详情区是否展示正确记录。
```

注意事项：

- 删除类 flow 会真实删除当前账号数据。
- 建议使用测试账号。
- 如果账号没有历史数据，使用 `skipIfPageDataEmpty` 自动跳过，避免误报失败。
- 不要简单断言结果面板一定消失，因为删除最新记录后，如果还有下一条历史，页面可以继续显示下一条。

正确的删除断言应该是：

```txt
被删记录不再存在于 historyRecords
被删记录不再是 latestCreatedRecord
```

这就是 `expectRecordRemoved` 的作用。

## 真实任务参数测试

如果页面状态依赖 `taskid`、`recordId`、`fileId` 这类业务参数，不要在 flow 中写 `test-task`、`mock-success` 这类假 id。假参数只能验证页面能否打开，不能验证接口加载、轮询、完成态、错误态和结果页状态是否正确。

推荐做法：

```txt
先通过真实入口创建或读取一条测试数据
用 savePageData 保存页面返回的真实 id
后续页面用 {{变量名}} 拼接真实参数
没有可用数据时使用 skipIfPageDataEmpty 跳过
```

只有在后端专门提供稳定的测试种子任务时，才建议写固定 id；并且 flow 描述里要说明这个 id 由测试环境维护。

## 失败结果与 Codex 修复任务

flow 失败后，会输出结果文件和截图：

```txt
debug/mp-monitor/flow-smoke-test/
```

如果 `autoFix.suggestAfterTest` 为 `true`，还会生成 Codex 修复任务：

```txt
debug/mp-monitor/fix-tasks/latest.json
debug/mp-monitor/fix-tasks/latest-fix-request.md
```

终端会给出类似命令：

```powershell
$request = Get-Content -Raw -LiteralPath "D:\appcode\mp-codex-toolkit\debug\mp-monitor\fix-tasks\latest-fix-request.md"
codex exec --cd "D:\appcode\gaofenwx" $request
```

这个任务会包含：

```txt
失败 flow 名称
失败 step
失败 action
错误信息
当前页面
失败截图
flow 结果 JSON
```

## 新增业务 Flow

新增页面级 TDD 用例时，优先在 `flows/` 下新建或扩展文件。

例如新增一个功能：

```txt
flows/new-feature.flows.js
```

然后在 `config.js` 中引用：

```js
flows: [
  ...require('./flows/photo-solve.flows'),
  ...require('./flows/memory-card-real-history.flows'),
  ...require('./flows/new-feature.flows')
]
```

临时调试新文件时，也可以先不改 `config.js`，直接按文件路径运行：

```powershell
node .\mp-monitor\mp-monitor.js --flow "flows\new-feature.flows.js"
```

建议每个新功能至少覆盖：

```txt
入口进入页面
初始空状态
输入或选择后的预览态
mock 成功结果
失败或错误态
删除、重置、重新填写后的状态同步
```

## 什么时候改 Action

多数新业务只需要新增 `flows/*.flows.js`，不需要修改 `flow-actions.js`。

只有当现有 action 无法表达测试意图时，才新增 action。

建议新增通用 action，例如：

```txt
expectArrayNotContainsRecord
expectPageDataChanged
callPageMethodWithSavedData
```

不建议新增过于业务化的 action，例如：

```txt
expectMemoryCardDeleted
expectPhotoSolveCleared
```

原则是：

```txt
业务知道要测什么。
Action 只负责怎么执行。
```
