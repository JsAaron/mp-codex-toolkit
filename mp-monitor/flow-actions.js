const fs = require('fs-extra')
const path = require('path')

function createFlowActions(options) {
  const {
    miniProgramRef,
    openSmokeTestPage,
    safeFileName
  } = options

  function getMiniProgram() {
    const miniProgram = miniProgramRef()
    if (!miniProgram) throw new Error('miniProgram 尚未连接')
    return miniProgram
  }

  async function findElementByText(page, text, selector = 'button,view,text') {
    const candidates = await page.$$(selector)
    for (const candidate of candidates) {
      try {
        const candidateText = await candidate.text()
        if (candidateText && candidateText.includes(text)) return candidate
      } catch (e) {}
    }

    return null
  }

  async function findElementBySelectorAndText(page, selector, text) {
    const candidates = await page.$$(selector)
    for (const candidate of candidates) {
      if (!text) return candidate

      try {
        const candidateText = await candidate.text()
        if (candidateText && candidateText.includes(text)) return candidate
      } catch (e) {}
    }

    return null
  }

  async function getPageText(page) {
    const texts = []
    const candidates = await page.$$('button,view,text')
    for (const candidate of candidates) {
      try {
        const text = await candidate.text()
        if (text) texts.push(text)
      } catch (e) {}
    }

    return texts.join('\n')
  }

  async function findElement(page, selector) {
    if (!selector) throw new Error('缺少 selector')
    return page.$(selector)
  }

  async function waitAfterStep(step, fallbackDelay = 0) {
    const delay = step.waitAfter || fallbackDelay
    if (delay) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  function readDataPath(data, dataPath) {
    if (!dataPath) return data
    return String(dataPath)
      .split('.')
      .filter(Boolean)
      .reduce((current, key) => {
        if (current == null) return undefined
        if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)]
        return current[key]
      }, data)
  }

  function readVarPath(vars, varPath) {
    return readDataPath(vars, varPath)
  }

  function resolveTemplateString(value, vars) {
    return value.replace(/\{\{\s*([\w$.]+)\s*\}\}/g, (match, varPath) => {
      const resolved = readVarPath(vars, varPath.replace(/^\$\./, ''))
      if (resolved == null) {
        throw new Error(`流程变量不存在: ${varPath}`)
      }
      return encodeURIComponent(String(resolved))
    })
  }

  function resolveValue(value, vars) {
    if (typeof value === 'string') return resolveTemplateString(value, vars)
    if (Array.isArray(value)) return value.map(item => resolveValue(item, vars))
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolveValue(item, vars)])
      )
    }
    return value
  }

  function isEmptyValue(value) {
    if (value == null) return true
    if (Array.isArray(value) || typeof value === 'string') return value.length === 0
    if (typeof value === 'object') return Object.keys(value).length === 0
    return false
  }

  function getRecordIds(record) {
    if (!record || typeof record !== 'object') return []
    return [record.fileId, record.relatedId, record.setId, record.resourceId, record.id]
      .filter(Boolean)
      .map(String)
  }

  function isSameRecord(left, right) {
    const leftIds = getRecordIds(left)
    const rightIds = getRecordIds(right)
    return leftIds.some(id => rightIds.includes(id))
  }

  async function getCurrentPageData(dataPath) {
    const page = await getMiniProgram().currentPage()
    if (typeof page.data !== 'function') {
      throw new Error('当前 automator Page 不支持读取 data')
    }
    const data = await page.data()
    return readDataPath(data, dataPath)
  }

  async function saveFlowScreenshot(outputDir, flowName, stepName) {
    const screenshot = await getMiniProgram().screenshot()
    const fileName = `${safeFileName(flowName)}_${safeFileName(stepName)}.png`
    const screenshotPath = path.join(outputDir, fileName)
    await fs.writeFile(screenshotPath, Buffer.from(screenshot, 'base64'))
    return screenshotPath
  }

  async function runFlowStep(step, context) {
    const { flowConfig, outputDir, tabPages, vars } = context
    const miniProgram = getMiniProgram()
    const action = step.action

    if (action === 'open') {
      const pagePath = resolveValue(step.page, vars)
      await openSmokeTestPage(pagePath, tabPages, {
        pageEntryMethod: step.method || flowConfig.pageEntryMethod || 'auto',
        waitAfter: step.waitAfter
      })
      const page = await miniProgram.currentPage()
      return { currentPath: page.path }
    }

    if (action === 'tap') {
      const page = await miniProgram.currentPage()
      let element = null

      if (step.selector) {
        element = await findElementBySelectorAndText(page, step.selector, step.text)
      }
      if (!element && step.text) {
        element = await findElementByText(page, step.text, step.scope || 'button,view,text')
      }
      if (!element) {
        throw new Error(`未找到可点击元素: ${step.selector || step.text || '(未配置 selector/text)'}`)
      }

      await element.tap()
      await new Promise(resolve => setTimeout(resolve, step.waitAfter || flowConfig.stepDelay || 800))
      const currentPage = await miniProgram.currentPage()
      return { currentPath: currentPage.path }
    }

    if (action === 'wait') {
      await new Promise(resolve => setTimeout(resolve, step.ms || flowConfig.stepDelay || 800))
      return { waited: step.ms || flowConfig.stepDelay || 800 }
    }

    if (action === 'expectPageContains') {
      const page = await miniProgram.currentPage()
      const expected = resolveValue(step.page || step.text, vars)
      if (!expected) throw new Error('expectPageContains 缺少 page/text')
      if (!page.path.includes(expected)) {
        throw new Error(`页面路径断言失败: 当前 ${page.path}, 期望包含 ${expected}`)
      }
      return { currentPath: page.path, expected }
    }

    if (action === 'expectText') {
      const page = await miniProgram.currentPage()
      const actualText = await getPageText(page)
      const expected = resolveValue(step.text, vars)
      if (!expected) throw new Error('expectText 缺少 text')
      if (!actualText.includes(expected)) {
        throw new Error(`文本断言失败: 当前页面未包含 "${expected}"`)
      }
      return { expected }
    }

    if (action === 'expectElement') {
      const page = await miniProgram.currentPage()
      const element = await findElement(page, step.selector)
      if (!element) {
        throw new Error(`元素断言失败: 未找到 ${step.selector}`)
      }
      return { selector: step.selector }
    }

    if (action === 'expectNoElement') {
      const page = await miniProgram.currentPage()
      const element = await findElement(page, step.selector)
      if (element) {
        throw new Error(`元素断言失败: 仍然找到 ${step.selector}`)
      }
      return { selector: step.selector }
    }

    if (action === 'skipIfPageDataEmpty') {
      const value = await getCurrentPageData(step.path)
      if (isEmptyValue(value)) {
        return {
          skippedFlow: true,
          reason: step.reason || `页面数据为空: ${step.path}`,
          path: step.path
        }
      }
      return { path: step.path, empty: false }
    }

    if (action === 'savePageData') {
      if (!step.name) throw new Error('savePageData 缺少 name')
      const value = await getCurrentPageData(step.path)
      vars[step.name] = value
      return { name: step.name, path: step.path, value }
    }

    if (action === 'expectPageData') {
      const value = await getCurrentPageData(step.path)
      if (step.empty === true && !isEmptyValue(value)) {
        throw new Error(`页面数据断言失败: ${step.path} 期望为空`)
      }
      if (step.empty === false && isEmptyValue(value)) {
        throw new Error(`页面数据断言失败: ${step.path} 期望非空`)
      }
      if (Object.prototype.hasOwnProperty.call(step, 'equals')) {
        const expected = resolveValue(step.equals, vars)
        if (value !== expected) {
          throw new Error(`页面数据断言失败: ${step.path} 当前 ${JSON.stringify(value)}, 期望 ${JSON.stringify(expected)}`)
        }
      }
      return { path: step.path, value }
    }

    if (action === 'expectRecordRemoved') {
      if (!step.from) throw new Error('expectRecordRemoved 缺少 from')
      const record = vars[step.from]
      if (isEmptyValue(record)) throw new Error(`未找到已保存记录: ${step.from}`)

      const historyRecords = await getCurrentPageData(step.historyPath || 'historyRecords')
      const latestRecord = await getCurrentPageData(step.latestPath || 'latestCreatedRecord')
      const records = Array.isArray(historyRecords) ? historyRecords : []
      const stillInHistory = records.some(item => isSameRecord(item, record))
      const stillLatest = isSameRecord(latestRecord, record)

      if (stillInHistory || stillLatest) {
        throw new Error(`记录删除断言失败: 被删记录仍存在，history=${stillInHistory}, latest=${stillLatest}`)
      }

      return {
        removedRecordIds: getRecordIds(record),
        remainingHistoryCount: records.length,
        latestExists: !isEmptyValue(latestRecord)
      }
    }

    if (action === 'callPageMethod') {
      const page = await miniProgram.currentPage()
      if (!step.method) throw new Error('callPageMethod 缺少 method')
      const result = await page.callMethod(step.method, ...(resolveValue(step.args || [], vars)))
      await waitAfterStep(step)
      return { method: step.method, result }
    }

    if (action === 'callPageMethodWithPageData') {
      const page = await miniProgram.currentPage()
      if (!step.method) throw new Error('callPageMethodWithPageData 缺少 method')
      if (!step.path) throw new Error('callPageMethodWithPageData 缺少 path')
      const value = await getCurrentPageData(step.path)
      if (isEmptyValue(value)) {
        throw new Error(`页面数据为空，无法调用 ${step.method}: ${step.path}`)
      }
      const result = await page.callMethod(step.method, value)
      await waitAfterStep(step)
      return { method: step.method, path: step.path, result }
    }

    if (action === 'callPageMethodWithSavedData') {
      const page = await miniProgram.currentPage()
      if (!step.method) throw new Error('callPageMethodWithSavedData 缺少 method')
      if (!step.from) throw new Error('callPageMethodWithSavedData 缺少 from')
      const value = vars[step.from]
      if (isEmptyValue(value)) {
        throw new Error(`已保存数据为空，无法调用 ${step.method}: ${step.from}`)
      }
      const result = await page.callMethod(step.method, value)
      await waitAfterStep(step)
      return { method: step.method, from: step.from, result }
    }

    if (action === 'setPageData') {
      const page = await miniProgram.currentPage()
      const data = resolveValue(step.data || {}, vars)
      await page.setData(data)
      await waitAfterStep(step)
      return { dataKeys: Object.keys(data) }
    }

    if (action === 'callComponentMethod') {
      const page = await miniProgram.currentPage()
      const component = await findElement(page, step.selector)
      if (!component) throw new Error(`未找到组件: ${step.selector}`)
      if (typeof component.callMethod !== 'function') {
        throw new Error(`元素不支持 callMethod: ${step.selector}`)
      }
      if (!step.method) throw new Error('callComponentMethod 缺少 method')
      const result = await component.callMethod(step.method, ...(resolveValue(step.args || [], vars)))
      await waitAfterStep(step)
      return { selector: step.selector, method: step.method, result }
    }

    if (action === 'setComponentData') {
      const page = await miniProgram.currentPage()
      const component = await findElement(page, step.selector)
      if (!component) throw new Error(`未找到组件: ${step.selector}`)
      if (typeof component.setData !== 'function') {
        throw new Error(`元素不支持 setData: ${step.selector}`)
      }
      await component.setData(step.data || {})
      await waitAfterStep(step)
      return { selector: step.selector, dataKeys: Object.keys(step.data || {}) }
    }

    if (action === 'screenshot') {
      const screenshotPath = await saveFlowScreenshot(outputDir, context.flow.name, step.name || action)
      return { screenshot: screenshotPath }
    }

    throw new Error(`暂不支持的流程动作: ${action}`)
  }

  return {
    runFlowStep,
    saveFlowScreenshot
  }
}

module.exports = {
  createFlowActions
}
