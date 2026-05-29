# 按业务流程组织小程序自动化测试方案

## 背景

当前项目中的小程序自动化测试主要以“页面”为组织单位执行。

现有流程大致如下：

1. 从配置或 `app.json` 中收集页面列表。
2. 逐个打开页面。
3. 扫描页面上的按钮和 `tap` 事件控件。
4. 可选地自动点击控件。
5. 按页面输出截图、控件扫描结果、点击结果和汇总报告。

这种方式适合做页面级巡检，可以发现页面是否能打开、控件是否存在、点击后是否产生明显异常。但它无法很好地表达和验证小程序真实的业务逻辑。

例如：

- 用户从首页进入某个功能模块。
- 用户完成登录后再访问个人中心。
- 用户从列表进入详情页。
- 用户填写表单并触发校验。
- 用户在多个页面之间跳转并保持状态。
- 用户按业务路径进入分包页面。

这些测试目标不是单个页面能否打开，而是一个完整业务链路是否可用。因此需要新增一套按“业务流程”组织的自动化测试能力。

## 目标

新增一套流程化自动化测试机制，使测试可以围绕业务路径组织，而不是只围绕页面列表组织。

目标包括：

- 支持通过配置声明多个业务流程。
- 每个业务流程由多个步骤组成。
- 支持打开页面、点击控件、输入内容、等待、断言页面、断言文本、截图等基础动作。
- 每个流程独立输出执行结果。
- 每个步骤记录状态、耗时、错误信息和关键上下文。
- 保留现有页面巡检能力，二者并存。

## 非目标

第一阶段不建议直接实现复杂能力，例如：

- 完整的用例编排语言。
- 复杂条件分支。
- 数据驱动测试矩阵。
- 自动识别业务流程。
- 与第三方测试平台深度集成。
- 替换现有 `tabSmokeTest`。

第一阶段应以低风险、可配置、可扩展为主。

## 现有页面巡检的问题

当前页面巡检的主要特点是：

- 入口是页面列表。
- 执行顺序由页面列表决定。
- 每个页面之间基本没有业务上下文关系。
- 自动点击主要是控件探索，而不是业务意图验证。
- 结果报告按页面组织。

因此会产生以下问题：

### 业务路径不可表达

比如“从首页点击专项训练入口，进入训练列表，再进入训练详情”这样的路径，无法通过单个页面配置表达。

### 状态依赖难以处理

很多页面需要前置状态，例如登录态、已选择年级、已加载用户资料。页面级巡检只能直接打开页面，不一定符合真实用户路径。

### 点击行为缺少意图

自动扫描 `tap` 并点击可以发现一些异常，但不知道这个点击代表什么业务动作，也很难判断点击后的结果是否正确。

### 报告不利于业务排查

页面报告可以说明某个页面失败，但不能直接说明“首页进入专项训练流程失败在第 2 步”。

## 建议新增配置

建议在 `mpMonitor.automation` 下新增 `flowSmokeTest` 配置。

示例：

```js
flowSmokeTest: {
  enabled: true,
  outputDir: 'flow-smoke-test',
  clearOutputBeforeRun: true,
  stepDelay: 1000,
  screenshot: true,

  flows: [
    {
      name: '首页进入记忆卡功能',
      enabled: true,
      steps: [
        {
          action: 'open',
          page: 'pages/home/home',
          method: 'auto'
        },
        {
          action: 'tap',
          selector: '.memory-card-entry',
          text: '记忆卡'
        },
        {
          action: 'expectPageContains',
          page: 'packageMemoryCard'
        },
        {
          action: 'expectText',
          text: '记忆卡'
        }
      ]
    },
    {
      name: '首页进入专项训练功能',
      enabled: true,
      steps: [
        {
          action: 'open',
          page: 'pages/home/home',
          method: 'auto'
        },
        {
          action: 'tap',
          text: '专项训练'
        },
        {
          action: 'expectPageContains',
          page: 'packageSpecialTrain'
        }
      ]
    }
  ]
}
```

## 流程结构设计

一个流程建议包含以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 流程名称，用于日志和报告 |
| `enabled` | boolean | 是否启用该流程 |
| `description` | string | 可选，流程说明 |
| `steps` | array | 流程步骤列表 |

一个步骤建议包含以下通用字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `action` | string | 步骤动作类型 |
| `name` | string | 可选，步骤名称 |
| `timeout` | number | 可选，步骤超时时间 |
| `delayAfter` | number | 可选，步骤后等待时间 |
| `screenshot` | boolean | 可选，是否在该步骤后截图 |

## 第一阶段支持的动作

### open

打开指定页面。

```js
{
  action: 'open',
  page: 'pages/home/home',
  method: 'auto'
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `page` | 页面路径 |
| `method` | 打开方式，可选 `auto`、`switchTab`、`navigateTo`、`reLaunch` |

该动作可以复用现有 `openSmokeTestPage()`。

### tap

点击页面上的控件。

```js
{
  action: 'tap',
  selector: '.memory-card-entry',
  text: '记忆卡'
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `selector` | 可选，优先使用的选择器 |
| `text` | 可选，按文本匹配控件 |
| `tagName` | 可选，限制候选标签 |

该动作可以复用现有 `findTapElement()` 的查找逻辑。

### input

向输入框输入内容。

```js
{
  action: 'input',
  selector: '#keyword',
  value: '数学'
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `selector` | 输入框选择器 |
| `value` | 输入内容 |

### wait

等待固定时间。

```js
{
  action: 'wait',
  duration: 1000
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `duration` | 等待毫秒数 |

### expectPage

断言当前页面路径等于指定页面。

```js
{
  action: 'expectPage',
  page: 'packageMemoryCard/pages/index/index'
}
```

### expectPageContains

断言当前页面路径包含指定片段。

```js
{
  action: 'expectPageContains',
  page: 'packageMemoryCard'
}
```

该动作适合页面带参数、分包路径较长或只关心模块是否进入的场景。

### expectText

断言当前页面存在指定文本。

```js
{
  action: 'expectText',
  text: '记忆卡'
}
```

### screenshot

手动截图。

```js
{
  action: 'screenshot',
  name: '进入记忆卡首页后'
}
```

## 建议新增代码结构

建议在 `mp-monitor/mp-monitor.js` 中新增以下函数：

### runFlowSmokeTest

负责读取 `mpConfig.automation.flowSmokeTest`，初始化输出目录，遍历执行所有启用的 flow，并写入汇总报告。

职责：

- 判断配置是否启用。
- 读取 `app.json` 并收集 tabBar 页面。
- 初始化输出目录。
- 遍历 flows。
- 汇总所有流程结果。
- 输出 summary 文件。

### runFlow

负责执行单个业务流程。

职责：

- 初始化流程结果。
- 按顺序执行 steps。
- 遇到失败时终止当前流程。
- 记录每一步状态、错误和截图。

### runFlowStep

负责执行单个步骤。

职责：

- 根据 `step.action` 分发到具体动作。
- 记录执行前后的页面路径。
- 执行步骤后延迟。
- 返回步骤结果。

### assertCurrentPage

负责页面路径断言。

支持：

- 完全匹配。
- 包含匹配。

### assertTextExists

负责页面文本断言。

可以先通过页面元素文本扫描实现，后续再优化为更精确的选择器查询。

### writeFlowScreenshot

负责截图文件写入。

命名建议包含：

- flow 名称。
- step 序号。
- action 名称。

## 执行入口

建议保留现有页面巡检入口，并新增流程巡检入口。

例如主流程中可以按顺序执行：

```js
await runTabSmokeTest()
await runFlowSmokeTest()
```

两者通过独立配置开关控制：

- `tabSmokeTest.enabled`
- `flowSmokeTest.enabled`

这样可以做到：

- 只跑页面巡检。
- 只跑流程巡检。
- 两者都跑。

## 报告设计

流程执行结果建议以 flow 为维度组织。

单个 flow 结果示例：

```json
{
  "name": "首页进入记忆卡功能",
  "status": "passed",
  "startTime": "2026-05-29T08:00:00.000Z",
  "endTime": "2026-05-29T08:00:05.000Z",
  "duration": 5000,
  "steps": [
    {
      "index": 0,
      "action": "open",
      "status": "passed",
      "beforePath": "",
      "afterPath": "pages/home/home",
      "page": "pages/home/home"
    },
    {
      "index": 1,
      "action": "tap",
      "status": "passed",
      "beforePath": "pages/home/home",
      "afterPath": "packageMemoryCard/pages/index/index",
      "selector": ".memory-card-entry",
      "text": "记忆卡"
    }
  ]
}
```

失败步骤示例：

```json
{
  "index": 2,
  "action": "expectText",
  "status": "failed",
  "text": "记忆卡",
  "error": "Expected text not found: 记忆卡",
  "beforePath": "packageMemoryCard/pages/index/index",
  "afterPath": "packageMemoryCard/pages/index/index"
}
```

汇总报告示例：

```json
{
  "time": "2026-05-29T08:00:10.000Z",
  "total": 2,
  "passed": 1,
  "failed": 1,
  "skipped": 0,
  "flows": [
    {
      "name": "首页进入记忆卡功能",
      "status": "passed",
      "resultFile": "..."
    },
    {
      "name": "首页进入专项训练功能",
      "status": "failed",
      "resultFile": "..."
    }
  ]
}
```

## 与现有页面巡检的关系

不建议删除或替换现有 `tabSmokeTest`。

两者定位不同：

| 能力 | 定位 | 优点 | 局限 |
| --- | --- | --- | --- |
| `tabSmokeTest` | 页面级巡检 | 覆盖面广，自动发现页面问题 | 不理解业务链路 |
| `flowSmokeTest` | 业务流程巡检 | 能表达用户路径和业务断言 | 需要手工维护流程配置 |

建议两者并存：

- 日常快速检查可以跑 `flowSmokeTest`。
- 发版前全量检查可以同时跑 `tabSmokeTest` 和 `flowSmokeTest`。
- 新功能上线时优先补充对应 flow。

## 实施步骤建议

### 第一阶段：基础流程执行器

实现内容：

- 新增 `flowSmokeTest` 配置。
- 新增 `runFlowSmokeTest()`。
- 支持 `open`、`tap`、`wait`、`expectPage`、`expectPageContains`、`expectText`、`screenshot`。
- 输出 flow 结果和 summary。

### 第二阶段：输入和表单支持

实现内容：

- 支持 `input`。
- 支持 `clearInput`。
- 支持 `expectValue`。
- 支持表单校验流程。

### 第三阶段：上下文和复用

实现内容：

- 支持公共前置步骤。
- 支持 flow 之间复用 steps。
- 支持配置变量。
- 支持从本地配置覆盖 flows。

### 第四阶段：更强断言能力

实现内容：

- 支持元素存在断言。
- 支持元素不存在断言。
- 支持接口请求结果辅助判断。
- 支持控制台错误与流程步骤关联。

## 风险与注意事项

### 控件选择器稳定性

如果页面缺少稳定的 `id`、`class` 或测试标识，流程测试会依赖文本匹配，稳定性较差。

建议后续在小程序页面中逐步补充稳定选择器。

### 登录态和环境数据

业务流程通常依赖登录态、用户数据或后端环境。

建议单独约定测试账号、测试环境和初始化数据方式。

### 自动点击与业务点击要区分

页面巡检中的自动点击是探索式的，而流程测试中的点击是有业务意图的。

两者不应混用结果判断。

### 危险操作保护

涉及支付、删除、注销、提交订单等操作时，需要继续沿用黑名单或在 flow 配置中显式禁用。

### 失败恢复

流程失败后，不一定需要恢复到原页面。建议第一阶段失败即终止当前 flow，并继续下一个 flow。

## 推荐结论

建议新增 `flowSmokeTest`，与现有 `tabSmokeTest` 并存。

第一版重点实现“可配置的业务流程执行器”，先覆盖核心路径验证，不追求复杂测试框架能力。

这样可以在不破坏现有页面巡检的前提下，让自动化测试从“页面是否能打开”升级到“关键业务链路是否可用”。
