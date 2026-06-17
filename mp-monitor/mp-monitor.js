const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const sharedConfig = require('../config.loader')
const fs = require('fs-extra')
const path = require('path')
const net = require('net')
const { uploadErrorLogs } = require('./upload-to-server')
const { writeFixTask } = require('../auto-fix/task-writer')
const { createFlowRunner } = require('./flow-runner')

const mpConfig = sharedConfig.mpMonitor
const debugConfig = sharedConfig.debugUpload
const cliOptions = parseCliOptions(process.argv.slice(2))
const flowRunner = createFlowRunner({
  mpConfig,
  cliOptions,
  miniProgramRef: () => miniProgram,
  readAppJson,
  collectTabPagesFromAppJson,
  openSmokeTestPage,
  safeFileName,
  getDateString,
  getTimeString
})

function parseCliOptions(args) {
  const options = {
    flow: null,
    listFlows: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--list-flows') {
      options.listFlows = true
      continue
    }
    if (arg === '--flow') {
      options.flow = args[i + 1] || ''
      i++
      continue
    }
    if (arg.startsWith('--flow=')) {
      options.flow = arg.slice('--flow='.length)
    }
  }

  return options
}

function looksLikeFlowFile(value) {
  return typeof value === 'string' && (
    value.endsWith('.js') ||
    value.includes('/') ||
    value.includes('\\')
  )
}

function resolveFlowFile(value) {
  const candidates = [
    path.resolve(process.cwd(), value),
    path.resolve(__dirname, '..', value),
    path.resolve(__dirname, '..', 'flows', value)
  ]

  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
}

function loadFlowsFromCli(flowArg, configuredFlows) {
  if (!flowArg) return configuredFlows.filter(flow => flow.enabled !== false)

  if (!looksLikeFlowFile(flowArg)) {
    return configuredFlows.filter(flow => flow.name.includes(flowArg))
  }

  const flowFile = resolveFlowFile(flowArg)
  if (!flowFile) {
    console.warn(`⚠️ 未找到 flow 文件: ${flowArg}`)
    return []
  }

  delete require.cache[require.resolve(flowFile)]
  const flows = require(flowFile)
  if (!Array.isArray(flows)) {
    console.warn(`⚠️ flow 文件必须导出数组: ${flowFile}`)
    return []
  }

  console.log(`🧾 已加载 flow 文件: ${flowFile}`)
  return flows
}

// 检测端口是否可用
function checkPortIsUsed(port) {
  return new Promise(resolve => {
    const client = new net.Socket()
    client.setTimeout(3000)
    client.on('connect', () => {
      client.destroy()
      resolve(true)
    })
    client.on('timeout', () => {
      client.destroy()
      resolve(false)
    })
    client.on('error', () => {
      client.destroy()
      resolve(false)
    })
    client.connect(port, 'localhost')
  })
}

// 全局变量
let miniProgram = null
let cliProcess = null
const captured = new Set() // 全局去重集合，避免热更新后重复捕获
let pageReloadCount = 0
let lastPagePath = null
let currentPageLogs = [] // 当前页面周期的普通日志
let currentPageStartTime = null // 当前页面周期开始时间
const monitorStartedAt = Date.now()

// 获取当前日期字符串 YYYY-MM-DD
function getDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取时间戳字符串 HH-MM-SS
function getTimeString() {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}-${minutes}-${seconds}`
}

function normalizePageUrl(pagePath) {
  return pagePath.startsWith('/') ? pagePath : `/${pagePath}`
}

function safeFileName(value) {
  return value.replace(/[\/\\:*?"<>|]/g, '-')
}

function stripMustache(value = '') {
  return value.replace(/\{\{.*?\}\}/g, '').trim()
}

function resolveMiniappFile(relativePath) {
  return path.join(mpConfig.startup.path, relativePath)
}

function normalizeComponentPath(componentPath, ownerDir) {
  let normalized = componentPath
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  } else if (normalized.startsWith('.')) {
    normalized = path.relative(mpConfig.startup.path, path.resolve(ownerDir, normalized)).replace(/\\/g, '/')
  }
  return normalized.replace(/\.(wxml|json|js|wxss)$/i, '')
}

function parseAttrs(attrSource) {
  const attrs = {}
  const attrReg = /([\w:-]+)\s*=\s*"([^"]*)"/g
  let match
  while ((match = attrReg.exec(attrSource))) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

function buildSelector(tagName, attrs) {
  const id = stripMustache(attrs.id)
  if (id) return `#${id}`

  const testId = stripMustache(attrs['data-testid'] || attrs['data-test-id'] || attrs['data-qa'])
  if (testId) return `[data-testid="${testId}"],[data-test-id="${testId}"],[data-qa="${testId}"]`

  const className = stripMustache(attrs.class)
    .split(/\s+/)
    .find(Boolean)
  if (className) return `.${className}`

  return tagName
}

function hasBlacklistedText(control, blacklist) {
  const haystack = [control.text, control.handler, control.selector, control.source, control.dataUrl].filter(Boolean).join(' ')
  return blacklist.some(keyword => haystack.includes(keyword))
}

function hasBlacklistedHandler(control, blacklist) {
  return blacklist.some(handler => control.handler === handler || control.handler.includes(handler))
}

async function readJsonIfExists(filePath) {
  if (!(await fs.pathExists(filePath))) return null
  try {
    return await fs.readJson(filePath)
  } catch (e) {
    console.warn(`⚠️ 读取 JSON 失败: ${filePath} - ${e.message}`)
    return null
  }
}

async function readAppJson() {
  return readJsonIfExists(resolveMiniappFile('app.json'))
}

function collectTabPagesFromAppJson(appJson) {
  return new Set(
    (appJson?.tabBar?.list || [])
      .map(item => item.pagePath)
      .filter(Boolean)
      .map(pagePath => pagePath.replace(/^\/+/, ''))
  )
}

function collectPagesFromAppJson(appJson) {
  const mainPages = Array.isArray(appJson?.pages) ? appJson.pages : []
  const packages = appJson?.subpackages || appJson?.subPackages || []
  const packagePages = []

  for (const pkg of packages) {
    const root = (pkg.root || '').replace(/^\/+|\/+$/g, '')
    const pages = Array.isArray(pkg.pages) ? pkg.pages : []
    for (const page of pages) {
      packagePages.push(`${root}/${page}`.replace(/^\/+/, ''))
    }
  }

  return [...mainPages, ...packagePages].map(page => page.replace(/^\/+/, ''))
}

function resolveSmokeTestPages(smokeConfig, appJson) {
  const manualPages = smokeConfig.pages || []
  const appJsonPages = smokeConfig.includeAppJsonPages ? collectPagesFromAppJson(appJson) : []
  const includeMainPages = new Set((smokeConfig.includeAppJsonMainPages || []).map(page => page.replace(/^\/+/, '')))
  const includeRoots = new Set((smokeConfig.includeAppJsonPageRoots || []).map(root => root.replace(/^\/+|\/+$/g, '')))
  const excludePages = new Set((smokeConfig.excludePages || []).map(page => page.replace(/^\/+/, '')))
  const filteredAppJsonPages = includeMainPages.size || includeRoots.size
    ? appJsonPages.filter(page => includeMainPages.has(page) || includeRoots.has(page.split('/')[0]))
    : appJsonPages

  return [...new Set([...manualPages, ...filteredAppJsonPages])]
    .map(page => page.replace(/^\/+/, ''))
    .filter(page => !excludePages.has(page))
}

async function openSmokeTestPage(pagePath, tabPages, smokeConfig) {
  const url = normalizePageUrl(pagePath)
  const method = smokeConfig.pageEntryMethod || 'auto'

  if (method === 'switchTab' || (method === 'auto' && tabPages.has(pagePath))) {
    await miniProgram.switchTab(url)
  } else if (method === 'navigateTo') {
    await miniProgram.navigateTo(url)
  } else {
    await miniProgram.reLaunch(url)
  }

  await new Promise(resolve => setTimeout(resolve, smokeConfig.waitAfter || mpConfig.automation.pageWatch.refreshDelay))
}

async function collectTapControlsFromWxml(pagePath, options = {}) {
  const maxDepth = options.maxDepth || 0
  const visited = new Set()
  const controls = []

  async function visit(basePath, depth, ownerPage) {
    if (visited.has(basePath) || depth > maxDepth) return
    visited.add(basePath)

    const wxmlPath = resolveMiniappFile(`${basePath}.wxml`)
    if (!(await fs.pathExists(wxmlPath))) return

    const wxml = await fs.readFile(wxmlPath, 'utf-8')
    const tagReg = /<([a-zA-Z][\w-]*)([^<>]*?(?:bind:?tap|catch:?tap)[^<>]*?)>/g
    let match
    while ((match = tagReg.exec(wxml))) {
      const [, tagName, attrSource] = match
      const attrs = parseAttrs(attrSource)
      const eventName = attrs.bindtap
        ? 'bindtap'
        : attrs['bind:tap']
          ? 'bind:tap'
          : attrs.catchtap
            ? 'catchtap'
            : 'catch:tap'
      const handler = attrs[eventName] || ''
      controls.push({
        page: ownerPage,
        source: `${basePath}.wxml`,
        tagName,
        selector: buildSelector(tagName, attrs),
        event: eventName,
        handler,
        dataUrl: attrs['data-url'] || attrs.url || '',
        text: stripMustache((wxml.slice(match.index, tagReg.lastIndex + 120).match(/>([^<{}]+)</) || [])[1] || ''),
        fromComponent: basePath !== ownerPage
      })
    }

    const json = await readJsonIfExists(resolveMiniappFile(`${basePath}.json`))
    const usingComponents = json?.usingComponents || {}
    const ownerDir = path.dirname(resolveMiniappFile(basePath))
    for (const componentPath of Object.values(usingComponents)) {
      const normalized = normalizeComponentPath(componentPath, ownerDir)
      await visit(normalized, depth + 1, ownerPage)
    }
  }

  await visit(pagePath, 0, pagePath)
  return controls
}

// 解析堆栈信息
function parseStackTrace(stack) {
  if (!stack) return null
  const lines = stack.split('\n')
  const locations = []
  for (const line of lines) {
    const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/)
    if (match) {
      const [, funcName, file, line, column] = match
      locations.push({
        function: funcName || '(anonymous)',
        file: file.replace(/^.*[\/\\]/, ''),
        line: parseInt(line),
        column: parseInt(column),
        fullPath: file
      })
    }
  }
  return locations.length > 0 ? locations : null
}

function matchesAutoFixIgnorePattern(value, pattern) {
  if (!pattern) return false
  const text = String(value || '')

  if (pattern instanceof RegExp) {
    return pattern.test(text)
  }

  if (typeof pattern === 'string') {
    return text.includes(pattern)
  }

  if (typeof pattern === 'object') {
    const message = pattern.message || pattern.pattern
    if (!message) return false
    return matchesAutoFixIgnorePattern(text, message)
  }

  return false
}

function shouldWriteFixTask(errorInfo) {
  const autoFixConfig = mpConfig.automation.autoFix || {}
  if (!autoFixConfig.suggestAfterTest) return false

  const ignorePatterns = autoFixConfig.ignoreErrorPatterns || []
  const haystack = [
    errorInfo.type,
    errorInfo.message,
    errorInfo.page,
    JSON.stringify(errorInfo.raw || {})
  ].filter(Boolean).join('\n')

  return !ignorePatterns.some(pattern => matchesAutoFixIgnorePattern(haystack, pattern))
}

// 保存错误（修复核心：确保目录创建完成后再写入文件）
async function saveError(type, message, extraData = {}, pageLogPath = null) {
  // 去重：避免同一错误被多次保存
  const key = type + ':' + message
  if (captured.has(key)) {
    console.log(`⚠️ 已捕获过的错误，跳过: ${type}`)
    return
  }
  captured.add(key)

  console.log(`\n\n${'='.repeat(60)}`)
  console.log(`❌ 捕获到错误: ${type}`)
  console.log(`📝 错误信息: ${message}`)
  if (pageLogPath) {
    console.log(`🔗 关联页面日志: ${pageLogPath}`)
  }
  console.log(`${'='.repeat(60)}`)

  const stackLocations = parseStackTrace(extraData.stack)
  if (stackLocations && stackLocations.length > 0) {
    console.log(`📍 错误位置（编译后的行号）:`)
    stackLocations.slice(0, 3).forEach((loc, idx) => {
      console.log(`   ${idx + 1}. ${loc.file}:${loc.line}:${loc.column} (${loc.function})`)
    })
  }

  try {
    const timeStr = getTimeString()
    const dirName = `${timeStr}_${type}`
    const errorDir = path.join(__dirname, mpConfig.automation.logs.dir, 'page-error', dirName)

    // 关键修复：确保目录同步创建完成（使用 await 等待 ensureDir 执行完毕）
    await fs.ensureDir(errorDir)
    console.log(`📁 日志目录已创建: ${errorDir}`)

    // 兼容页面可能未加载的情况
    let pagePath = 'unknown'
    try {
      const page = await miniProgram.currentPage()
      pagePath = page.path
      const screenshot = await miniProgram.screenshot()
      // 修复：写入截图前再次确认目录存在（双重保障）
      await fs.ensureDir(errorDir)
      await fs.writeFile(path.join(errorDir, 'screenshot.png'), Buffer.from(screenshot, 'base64'))
    } catch (e) {
      console.warn(`⚠️ 获取页面/截图失败: ${e.message}`)
    }

    const errorJsonPath = path.join(errorDir, 'error.json')
    const screenshotPath = path.join(errorDir, 'screenshot.png')
    const errorData = {
      type,
      message,
      page: pagePath,
      time: new Date().toISOString(),
      pageLogFile: pageLogPath || null, // 关联的页面日志文件
      stackLocations,
      ...extraData
    }

    // 修复：写入JSON前确认目录存在
    await fs.ensureDir(errorDir)
    await fs.writeFile(errorJsonPath, JSON.stringify(errorData, null, 2))
    console.log(`✅ 已保存到: ${mpConfig.automation.logs.dir}/page-error/${dirName}/\n`)

    const fixTaskErrorInfo = {
      ...errorData,
      errorDir,
      errorJsonPath,
      screenshotPath: await fs.pathExists(screenshotPath) ? screenshotPath : null,
      raw: extraData
    }
    if (shouldWriteFixTask(fixTaskErrorInfo)) {
      try {
        const fixTaskResult = await writeFixTask(fixTaskErrorInfo)
        console.log(`🧩 已生成 Codex 修复任务: ${fixTaskResult.latestRequestPath}`)
      } catch (taskError) {
        console.error(`⚠️ 生成 Codex 修复任务失败: ${taskError.message}`)
      }
    } else {
      console.log('🧩 已按 autoFix.ignoreErrorPatterns 跳过 Codex 修复任务生成')
    }

    if (debugConfig.enabled) {
      const errorLogsDir = path.join(__dirname, mpConfig.automation.logs.dir)
      await uploadErrorLogs(errorLogsDir)
    }
  } catch (e) {
    console.error(`❌ 保存错误日志失败: ${e.message}`)
    // 可选：捕获错误后移除已添加的key，避免永久去重
    const key = type + ':' + message
    captured.delete(key)
  }
}

// 保存当前页面周期的普通日志
async function savePageLogs(reason = 'page-change') {
  // 检查是否启用 page-logs 生成
  if (!mpConfig.automation.logs.generatePageLogs) {
    return null
  }

  // 错误场景下，即使日志为空也要生成文件
  if (currentPageLogs.length === 0 && reason !== 'error') return null

  try {
    // 实时获取当前页面路径（避免依赖 lastPagePath 导致显示 unknown）
    let currentPath = lastPagePath || 'unknown'
    try {
      const page = await miniProgram.currentPage()
      currentPath = page.path || currentPath
    } catch (e) {
      console.warn(`⚠️ 获取当前页面路径失败，使用缓存路径: ${currentPath}`)
    }

    const timeStr = getTimeString()
    const logDir = path.join(__dirname, mpConfig.automation.logs.dir, 'page-logs')
    await fs.ensureDir(logDir)

    // 根据触发原因生成文件名和前缀
    let reasonPrefix = 'NORMAL'
    let reasonText = '页面变化'

    if (reason === 'error') {
      reasonPrefix = 'ERROR'
      reasonText = '页面出现错误'
    } else if (reason === 'page-enter') {
      reasonPrefix = 'ENTER'
      reasonText = '进入页面'
    } else if (reason === 'page-leave') {
      reasonPrefix = 'LEAVE'
      reasonText = '离开页面'
    }

    const logFileName = `[${reasonPrefix}]_page-${pageReloadCount}_${currentPath.replace(/\//g, '-')}_${timeStr}.log`
    const logFilePath = path.join(logDir, logFileName)

    const logContent = [
      `页面刷新周期 #${pageReloadCount}`,
      `页面路径: ${currentPath}`,
      `开始时间: ${currentPageStartTime ? new Date(currentPageStartTime).toISOString() : 'unknown'}`,
      `结束时间: ${new Date().toISOString()}`,
      `触发原因: ${reasonText}`,
      `日志数量: ${currentPageLogs.length}`,
      `${'='.repeat(80)}`,
      '',
      `📋 捕获到的日志：`,
      `${'='.repeat(80)}`,
      '',
      currentPageLogs.length > 0 ? currentPageLogs.join('\n') : '⚠️ 未捕获到任何日志',
      ''
    ].join('\n')

    await fs.writeFile(logFilePath, logContent, 'utf-8')
    const logCountInfo =
      currentPageLogs.length > 0 ? `${currentPageLogs.length}条` : '空（可能监听器绑定晚于页面初始化）'
    // console.log(`📝 已保存页面日志: ${mpConfig.automation.logs.dir}/page-logs/${logFileName} (${logCountInfo})\n`)

    // 返回相对路径，供错误日志引用
    return `${mpConfig.automation.logs.dir}/page-logs/${logFileName}`
  } catch (e) {
    console.error(`❌ 保存页面日志失败: ${e.message}`)
    return null
  }
}

async function scanButtons(page) {
  const buttons = await page.$$('button')
  const result = []

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i]
    const info = {
      index: i,
      tagName: button.tagName,
      id: '',
      className: '',
      text: '',
      size: null,
      offset: null
    }

    try {
      info.id = await button.attribute('id')
    } catch (e) {}
    try {
      info.className = await button.attribute('class')
    } catch (e) {}
    try {
      info.text = await button.text()
    } catch (e) {}
    try {
      info.size = await button.size()
    } catch (e) {}
    try {
      info.offset = await button.offset()
    } catch (e) {}

    result.push(info)
  }

  return result
}

async function findTapElement(page, control) {
  try {
    const element = await page.$(control.selector)
    if (element) return element
  } catch (e) {}

  const candidates = await page.$$(control.tagName || 'button,view,text,image')
  for (const candidate of candidates) {
    try {
      const text = await candidate.text()
      if (control.text && text && text.includes(control.text)) return candidate
    } catch (e) {}

    try {
      const className = await candidate.attribute('class')
      if (control.selector?.startsWith('.') && className?.split(/\s+/).includes(control.selector.slice(1))) return candidate
    } catch (e) {}
  }

  return null
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
  const page = await miniProgram.currentPage()
  if (typeof page.data !== 'function') {
    throw new Error('当前 automator Page 不支持读取 data')
  }
  const data = await page.data()
  return readDataPath(data, dataPath)
}

async function saveFlowScreenshot(outputDir, flowName, stepName) {
  const screenshot = await miniProgram.screenshot()
  const fileName = `${safeFileName(flowName)}_${safeFileName(stepName)}.png`
  const screenshotPath = path.join(outputDir, fileName)
  await fs.writeFile(screenshotPath, Buffer.from(screenshot, 'base64'))
  return screenshotPath
}

async function runFlowStep(step, context) {
  const { flowConfig, outputDir, tabPages, vars } = context
  const action = step.action

  if (action === 'open') {
    await openSmokeTestPage(step.page, tabPages, {
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
    const expected = step.page || step.text
    if (!expected) throw new Error('expectPageContains 缺少 page/text')
    if (!page.path.includes(expected)) {
      throw new Error(`页面路径断言失败: 当前 ${page.path}, 期望包含 ${expected}`)
    }
    return { currentPath: page.path, expected }
  }

  if (action === 'expectText') {
    const page = await miniProgram.currentPage()
    const actualText = await getPageText(page)
    if (!step.text) throw new Error('expectText 缺少 text')
    if (!actualText.includes(step.text)) {
      throw new Error(`文本断言失败: 当前页面未包含 "${step.text}"`)
    }
    return { expected: step.text }
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
    if (Object.prototype.hasOwnProperty.call(step, 'equals') && value !== step.equals) {
      throw new Error(`页面数据断言失败: ${step.path} 当前 ${JSON.stringify(value)}, 期望 ${JSON.stringify(step.equals)}`)
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
    const result = await page.callMethod(step.method, ...(step.args || []))
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
    await page.setData(step.data || {})
    await waitAfterStep(step)
    return { dataKeys: Object.keys(step.data || {}) }
  }

  if (action === 'callComponentMethod') {
    const page = await miniProgram.currentPage()
    const component = await findElement(page, step.selector)
    if (!component) throw new Error(`未找到组件: ${step.selector}`)
    if (typeof component.callMethod !== 'function') {
      throw new Error(`元素不支持 callMethod: ${step.selector}`)
    }
    if (!step.method) throw new Error('callComponentMethod 缺少 method')
    const result = await component.callMethod(step.method, ...(step.args || []))
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

async function writeFlowFixTask(flowResult, failedStep) {
  const autoFixConfig = mpConfig.automation.autoFix || {}
  if (!autoFixConfig.suggestAfterTest) return null
  if (!failedStep || failedStep.status !== 'failed') return null

  const page = await miniProgram.currentPage().catch(() => null)
  const pagePath = page?.path || 'unknown'
  const errorDir = path.dirname(flowResult.resultFile)
  const errorJsonPath = path.join(errorDir, `${safeFileName(flowResult.name)}.fix-error.json`)
  const screenshotPath = failedStep.screenshot || null

  const errorData = {
    type: 'flow-smoke-test',
    message: [
      `页面 TDD 流程失败: ${flowResult.name}`,
      `失败步骤: ${failedStep.name}`,
      `失败动作: ${failedStep.action}`,
      `错误信息: ${failedStep.error}`
    ].join('\n'),
    page: pagePath,
    time: new Date().toISOString(),
    errorDir,
    errorJsonPath,
    screenshotPath,
    pageLogFile: null,
    raw: {
      flow: flowResult.name,
      resultFile: flowResult.resultFile,
      failedStep,
      steps: flowResult.steps
    }
  }

  if (!shouldWriteFixTask(errorData)) {
    console.log('   🧩 已按 autoFix.ignoreErrorPatterns 跳过流程修复任务生成')
    return null
  }

  await fs.writeJson(errorJsonPath, errorData, { spaces: 2 })
  return writeFixTask(errorData)
}

async function runFlowSmokeTest() {
  const flowConfig = mpConfig.automation.flowSmokeTest
  if (!flowConfig || !flowConfig.enabled) return

  const allFlows = flowConfig.flows || []
  if (cliOptions.listFlows) {
    console.log('\n🧾 可用业务流程:')
    allFlows.forEach(flow => {
      const enabledText = flow.enabled === false ? 'disabled' : 'enabled'
      console.log(`- ${flow.name} [${enabledText}]`)
    })
    console.log('')
    return
  }

  const flows = loadFlowsFromCli(cliOptions.flow, allFlows)

  if (flows.length === 0) return

  const appJson = await readAppJson()
  const tabPages = collectTabPagesFromAppJson(appJson)
  const outputDir = path.join(__dirname, mpConfig.automation.logs.dir, flowConfig.outputDir || 'flow-smoke-test')
  if (flowConfig.clearOutputBeforeRun) {
    await fs.emptyDir(outputDir)
  } else {
    await fs.ensureDir(outputDir)
  }

  const summary = []
  console.log(`\n🧭 开始业务流程巡检，共 ${flows.length} 条流程`)

  for (const flow of flows) {
    const flowResult = {
      name: flow.name,
      status: 'passed',
      startedAt: new Date().toISOString(),
      steps: []
    }

    console.log(`➡️  执行流程: ${flow.name}`)
    const steps = flow.steps || []
    const vars = {}

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const stepLabel = step.name || `${i + 1}-${step.action}`
      const started = Date.now()
      const stepResult = {
        index: i + 1,
        name: stepLabel,
        action: step.action,
        status: 'passed',
        startedAt: new Date(started).toISOString()
      }

      try {
        const detail = await runFlowStep(step, {
          flow,
          flowConfig,
          outputDir,
          tabPages,
          vars
        })
        Object.assign(stepResult, detail)
        if (detail?.skippedFlow) {
          stepResult.status = 'skipped'
          flowResult.status = 'skipped'
          console.log(`   ⏭️  ${stepLabel}: ${detail.reason}`)
        } else {
          console.log(`   ✅ ${stepLabel}`)
        }
      } catch (e) {
        stepResult.status = 'failed'
        stepResult.error = e.message
        flowResult.status = 'failed'
        console.warn(`   ❌ ${stepLabel}: ${e.message}`)

        if (flowConfig.screenshot) {
          try {
            stepResult.screenshot = await saveFlowScreenshot(outputDir, flow.name, `${stepLabel}-failed`)
          } catch (screenshotError) {
            stepResult.screenshotError = screenshotError.message
          }
        }
      } finally {
        stepResult.durationMs = Date.now() - started
        stepResult.finishedAt = new Date().toISOString()
        flowResult.steps.push(stepResult)
      }

      if (stepResult.status === 'failed' || stepResult.status === 'skipped') break
      if (flowConfig.stepDelay && step.action !== 'tap' && step.action !== 'wait') {
        await new Promise(resolve => setTimeout(resolve, flowConfig.stepDelay))
      }
    }

    flowResult.finishedAt = new Date().toISOString()
    flowResult.durationMs = new Date(flowResult.finishedAt).getTime() - new Date(flowResult.startedAt).getTime()
    const resultPath = path.join(outputDir, `${safeFileName(flow.name)}.json`)
    flowResult.resultFile = resultPath
    await fs.writeFile(resultPath, JSON.stringify(flowResult, null, 2), 'utf-8')

    const failedStep = flowResult.steps.find(step => step.status === 'failed')
    if (failedStep) {
      try {
        const fixTaskResult = await writeFlowFixTask(flowResult, failedStep)
        if (fixTaskResult) {
          flowResult.fixTask = fixTaskResult.latestRequestPath
          await fs.writeFile(resultPath, JSON.stringify(flowResult, null, 2), 'utf-8')
          console.log(`   🧩 已生成 Codex 修复任务: ${fixTaskResult.latestRequestPath}`)
        }
      } catch (taskError) {
        console.warn(`   ⚠️ 生成流程修复任务失败: ${taskError.message}`)
      }
    }

    summary.push(flowResult)
  }

  const summaryPath = path.join(outputDir, `summary-${getDateString()}-${getTimeString()}.json`)
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8')
  const failedCount = summary.filter(flow => flow.status === 'failed').length
  const skippedCount = summary.filter(flow => flow.status === 'skipped').length
  console.log(`✅ 业务流程巡检完成: ${summaryPath}，失败 ${failedCount}/${summary.length}，跳过 ${skippedCount}/${summary.length}\n`)
}

async function tapEventControls(pagePath, controls, smokeConfig, tabPages) {
  if (!smokeConfig.tapEventControls) return []

  const blacklist = smokeConfig.tapBlacklist || []
  const handlerBlacklist = smokeConfig.tapHandlerBlacklist || []
  const maxTap = smokeConfig.maxTapPerPage || controls.length
  const tapResults = []
  let tapped = 0

  for (const control of controls) {
    if (tapped >= maxTap) break

    const tapResult = {
      ...control,
      status: 'pending',
      time: new Date().toISOString()
    }

    if (hasBlacklistedText(control, blacklist)) {
      tapResult.status = 'skipped'
      tapResult.reason = 'blacklist'
      tapResults.push(tapResult)
      continue
    }

    if (hasBlacklistedHandler(control, handlerBlacklist)) {
      tapResult.status = 'skipped'
      tapResult.reason = 'handler-blacklist'
      tapResults.push(tapResult)
      continue
    }

    try {
      const page = await miniProgram.currentPage()
      const element = await findTapElement(page, control)
      if (!element) {
        tapResult.status = 'skipped'
        tapResult.reason = 'element-not-found'
        tapResults.push(tapResult)
        continue
      }

      console.log(`👆 点击控件: ${control.selector} -> ${control.handler}`)
      await element.tap()
      tapped++
      await new Promise(resolve => setTimeout(resolve, smokeConfig.tapDelay || 1000))

      const currentPage = await miniProgram.currentPage()
      tapResult.status = 'tapped'
      tapResult.afterPath = currentPage.path

      if (currentPage.path !== pagePath) {
        await openSmokeTestPage(pagePath, tabPages, smokeConfig)
      }
    } catch (e) {
      tapResult.status = 'failed'
      tapResult.error = e.message
      try {
        await openSmokeTestPage(pagePath, tabPages, smokeConfig)
      } catch (restoreError) {
        tapResult.restoreError = restoreError.message
      }
    }

    tapResults.push(tapResult)
  }

  return tapResults
}

async function runTabSmokeTest() {
  const smokeConfig = mpConfig.automation.tabSmokeTest
  if (!smokeConfig || !smokeConfig.enabled) return

  const appJson = await readAppJson()
  const tabPages = collectTabPagesFromAppJson(appJson)
  const pages = resolveSmokeTestPages(smokeConfig, appJson)
  if (pages.length === 0) return

  const outputDir = path.join(__dirname, mpConfig.automation.logs.dir, smokeConfig.outputDir || 'page-smoke-test')
  if (smokeConfig.clearOutputBeforeRun) {
    await fs.emptyDir(outputDir)
  } else {
    await fs.ensureDir(outputDir)
  }

  const results = []
  console.log(`\n🧪 开始页面自动化巡检，共 ${pages.length} 个页面`)

  for (const pagePath of pages) {
    try {
      console.log(`➡️  打开页面: ${pagePath}`)
      await openSmokeTestPage(pagePath, tabPages, smokeConfig)

      const page = await miniProgram.currentPage()
      const currentPath = page.path
      const pageResult = {
        targetPath: pagePath,
        currentPath,
        time: new Date().toISOString(),
        buttons: [],
        eventControls: [],
        tapResults: []
      }

      if (smokeConfig.scanButtons) {
        pageResult.buttons = await scanButtons(page)
        console.log(`🔎 ${currentPath} 发现 button: ${pageResult.buttons.length} 个`)
      }

      if (smokeConfig.scanEventControls) {
        pageResult.eventControls = await collectTapControlsFromWxml(pagePath, {
          maxDepth: smokeConfig.componentScanDepth
        })
        console.log(`🧭 ${currentPath} 发现 tap 事件控件: ${pageResult.eventControls.length} 个`)
        pageResult.tapResults = await tapEventControls(pagePath, pageResult.eventControls, smokeConfig, tabPages)
      }

      const filePrefix = safeFileName(currentPath || pagePath)
      if (smokeConfig.screenshot) {
        const screenshot = await miniProgram.screenshot()
        const screenshotPath = path.join(outputDir, `${filePrefix}.png`)
        await fs.writeFile(screenshotPath, Buffer.from(screenshot, 'base64'))
        pageResult.screenshot = screenshotPath
      }

      const buttonsPath = path.join(outputDir, `${filePrefix}.buttons.json`)
      await fs.writeFile(buttonsPath, JSON.stringify(pageResult.buttons, null, 2), 'utf-8')
      pageResult.buttonsFile = buttonsPath

      const controlsPath = path.join(outputDir, `${filePrefix}.event-controls.json`)
      await fs.writeFile(controlsPath, JSON.stringify(pageResult.eventControls, null, 2), 'utf-8')
      pageResult.eventControlsFile = controlsPath

      const tapResultsPath = path.join(outputDir, `${filePrefix}.tap-results.json`)
      await fs.writeFile(tapResultsPath, JSON.stringify(pageResult.tapResults, null, 2), 'utf-8')
      pageResult.tapResultsFile = tapResultsPath
      results.push(pageResult)
    } catch (e) {
      console.warn(`⚠️ 页面巡检失败: ${pagePath} - ${e.message}`)
      results.push({
        targetPath: pagePath,
        time: new Date().toISOString(),
        error: e.message
      })
    }
  }

  const summaryPath = path.join(outputDir, `summary-${getDateString()}-${getTimeString()}.json`)
  await fs.writeFile(summaryPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`✅ 页面自动化巡检完成: ${summaryPath}\n`)
}

async function printAutoFixSuggestion() {
  const autoFixConfig = mpConfig.automation.autoFix || {}
  if (!autoFixConfig.suggestAfterTest) return

  const taskDir = path.join(__dirname, mpConfig.automation.logs.dir, 'fix-tasks')
  const latestTaskPath = path.join(taskDir, 'latest.json')
  const latestRequestPath = path.join(taskDir, 'latest-fix-request.md')

  if (!(await fs.pathExists(latestTaskPath)) || !(await fs.pathExists(latestRequestPath))) {
    console.log('🧩 本轮测试未发现可交给 Codex 的修复任务\n')
    return
  }

  let task
  try {
    task = await fs.readJson(latestTaskPath)
  } catch (e) {
    console.warn(`⚠️ 读取 Codex 修复任务失败: ${e.message}`)
    return
  }

  const taskTime = new Date(task.createdAt || 0).getTime()
  if (!taskTime || taskTime < monitorStartedAt) {
    console.log('🧩 未发现本轮新生成的 Codex 修复任务\n')
    return
  }

  const projectPath = task.projectPath || mpConfig.startup.path
  console.log('🧩 检测到本轮新生成的 Codex 修复任务')
  console.log(`任务 ID: ${task.id}`)
  console.log(`错误类型: ${task.error?.type || 'unknown'}`)
  console.log(`错误页面: ${task.error?.page || 'unknown'}`)
  console.log(`修复请求: ${latestRequestPath}`)
  console.log('')
  console.log('可手动执行以下命令启动 Codex 修复：')
  console.log(`$request = Get-Content -Raw -LiteralPath "${latestRequestPath}"`)
  console.log(`codex exec --cd "${projectPath}" $request`)
  console.log('')
}

// 核心：绑定所有事件监听（只在启动时调用一次）
function bindAllListeners() {
  if (!miniProgram) return

  const errorConfig = mpConfig.automation.errorCapture
  const enabledListeners = []

  // 1. console 监听：捕获所有类型的日志
  miniProgram.on('console', async msg => {
    // 优化：拼接 args 生成可读的 text，解决 text 为 undefined 的问题
    let text = msg.text
    if (!text && msg.args && msg.args.length > 0) {
      text = msg.args
        .map(arg => {
          if (typeof arg === 'object') return JSON.stringify(arg)
          return String(arg)
        })
        .join(' ')
    }

    // 打印完整的 msg 对象用于调试
    // console.log(`\n[Console事件] 完整信息:`, JSON.stringify(msg, null, 2))
    // console.log(`✅ [Console捕获] type:${msg.type} | text:${text?.substring(0, 100)}`)

    // 收集所有类型的日志到当前页面周期（不仅仅是 log/info）
    // 排除 error 和 warn，因为它们会单独保存
    if (msg.type !== 'error' && msg.type !== 'warn') {
      const timestamp = new Date().toISOString()
      const logLine = `[${timestamp}] [${msg.type.toUpperCase()}] ${text}`
      currentPageLogs.push(logLine)
      // console.log(`📝 已收集日志 (当前总数: ${currentPageLogs.length})`)
    }

    // 错误和警告仍然单独保存（根据配置）
    if (msg.type === 'error' && errorConfig.console.error) {
      const message = text || JSON.stringify(msg)
      // 延迟 100ms，等待其他 console.log 的异步回调执行完成
      await new Promise(resolve => setTimeout(resolve, 100))
      const pageLogPath = await savePageLogs('error')
      // 保存后清空日志，开始新的周期
      currentPageLogs = []
      currentPageStartTime = Date.now()
      await saveError(`console.${msg.type}`, message, { args: msg.args, type: msg.type }, pageLogPath)
    } else if (msg.type === 'warn' && errorConfig.console.warn) {
      const message = text || JSON.stringify(msg)
      await saveError(`console.${msg.type}`, message, { args: msg.args, type: msg.type }, null)
    }
  })
  enabledListeners.push('console')

  // 2. 脚本错误
  if (errorConfig.scripterror) {
    miniProgram.on('scripterror', async msg => {
      // 延迟 100ms，等待其他 console.log 的异步回调执行完成
      await new Promise(resolve => setTimeout(resolve, 100))
      // 错误发生时，先保存当前页面周期的日志
      const pageLogPath = await savePageLogs('error')
      const message = msg.message || JSON.stringify(msg)
      await saveError('scripterror', message, msg, pageLogPath)
      currentPageLogs = []
      currentPageStartTime = Date.now()
    })
    enabledListeners.push('scripterror')
  }

  // 3. 页面错误
  if (errorConfig.pageerror) {
    miniProgram.on('pageerror', async msg => {
      // 延迟 100ms，等待其他 console.log 的异步回调执行完成
      await new Promise(resolve => setTimeout(resolve, 100))
      // 错误发生时，先保存当前页面周期的日志
      const pageLogPath = await savePageLogs('error')
      // 保存后清空日志，开始新的周期
      currentPageLogs = []
      currentPageStartTime = Date.now()
      const message = msg.message || JSON.stringify(msg)
      await saveError('pageerror', message, { detail: msg }, pageLogPath)
    })
    enabledListeners.push('pageerror')
  }

  // 4. 异常事件
  if (errorConfig.exception) {
    miniProgram.on('exception', async msg => {
      // 延迟 100ms，等待其他 console.log 的异步回调执行完成
      await new Promise(resolve => setTimeout(resolve, 100))
      // 错误发生时，先保存当前页面周期的日志
      const pageLogPath = await savePageLogs('error')
      // 保存后清空日志，开始新的周期
      currentPageLogs = []
      currentPageStartTime = Date.now()
      const message = msg.message || msg.error?.message || JSON.stringify(msg)
      await saveError(
        'exception',
        message,
        {
          stack: msg.stack,
          detail: msg
        },
        pageLogPath
      )
    })
    enabledListeners.push('exception')
  }

  // 5. 系统错误
  if (errorConfig.systemError) {
    miniProgram.on('error', async msg => {
      // 延迟 100ms，等待其他 console.log 的异步回调执行完成
      await new Promise(resolve => setTimeout(resolve, 100))
      // 错误发生时，先保存当前页面周期的日志
      const pageLogPath = await savePageLogs('error')
      // 保存后清空日志，开始新的周期
      currentPageLogs = []
      currentPageStartTime = Date.now()
      const message = msg.message || JSON.stringify(msg)
      await saveError('system error', message, { detail: msg }, pageLogPath)
    })
    enabledListeners.push('error')
  }

  console.log(`📊 已启用的监听器: ${enabledListeners.join(', ')}`)
}

// 监听页面变化，热更新后重建监听
async function watchPageChange() {
  try {
    const page = await miniProgram.currentPage()
    const currentPath = page.path

    if (currentPath !== lastPagePath) {
      // 保存上一个页面周期的日志（离开页面时）
      if (pageReloadCount > 0) {
        // await savePageLogs('page-leave')
      }
      // 重置当前页面周期的日志
      currentPageLogs = []
      currentPageStartTime = Date.now()
      pageReloadCount++
      // console.log(`\n${'='.repeat(60)}`)
      // console.log(`📄 页面变化 #${pageReloadCount}: ${lastPagePath || '(初始)'} -> ${currentPath}`)
      // console.log(`${'='.repeat(60)}\n`)
      lastPagePath = currentPath
      // 延迟后生成进入页面的日志（等待页面初始化的日志被捕获）
      setTimeout(async () => {
        await savePageLogs('page-enter')
      }, mpConfig.automation.pageWatch.refreshDelay)
    }
  } catch (e) {
    console.warn(`⚠️ 检测页面变化失败: ${e.message}`)
  }
}

async function main() {
  // 清空 debug-logs 目录
  const errorLogsDir = path.join(__dirname, mpConfig.automation.logs.dir)
  if (mpConfig.automation.logs.clear) {
    try {
      await fs.remove(errorLogsDir)
      console.log('🗑️  已清空 debug-logs 目录\n')
    } catch (e) {
      console.log('ℹ️  debug-logs 目录不存在或已清空\n')
    }
  }

  const autoPort = mpConfig.startup.port

  // 检测端口
  const isPortUsed = await checkPortIsUsed(autoPort)
  if (isPortUsed) {
    console.log(`✅ 检测到 ${autoPort} 端口已被占用，开发者工具已启动`)
  } else {
    console.log(`🔄 ${autoPort} 端口未占用，启动开发者工具自动化模式...\n`)

    // 只在端口未占用时启动开发者工具
    cliProcess = spawn(mpConfig.startup.cliPath, [
      'auto',
      '--project',
      mpConfig.startup.path,
      '--auto-port',
      String(autoPort)
    ])

    // 监听CLI输出，便于调试
    cliProcess.stdout.on('data', data => {
      console.log(`📢 CLI输出: ${data.toString().trim()}`)
    })
    cliProcess.stderr.on('data', data => {
      console.log(`⚠️ CLI错误输出: ${data.toString().trim()}`)
    })
  }

  // 等待开发者工具准备就绪
  await new Promise(resolve => setTimeout(resolve, mpConfig.startup.connection.retryDelay))
  // 连接到开发者工具
  try {
    miniProgram = await automator.connect({
      wsEndpoint: `ws://localhost:${autoPort}`,
      timeout: mpConfig.startup.connection.timeout
    })
    console.log('✅ 已连接到开发者工具\n')
  } catch (error) {
    console.error(`❌ 连接失败: ${error.message}`)
    if (cliProcess) cliProcess.kill()
    process.exit(1)
  }

  try {
    // 立即绑定监听器（在页面加载前）
    bindAllListeners()
    const shouldRefreshCurrentPage = !!mpConfig.automation.tabSmokeTest?.enabled
    try {
      const page = await miniProgram.currentPage()
      const pagePath = page.path
      console.log(`📄 当前页面: ${pagePath}`)

      if (shouldRefreshCurrentPage) {
        const url = pagePath.startsWith('/') ? pagePath : `/${pagePath}`
        await miniProgram.reLaunch(url)
        await new Promise(resolve => setTimeout(resolve, mpConfig.automation.pageWatch.refreshDelay))
      }
    } catch (e) {
      console.warn(`⚠️ 获取或刷新当前页面失败: ${e.message}`)
    }

    await runTabSmokeTest()
    await flowRunner.runFlowSmokeTest()
    await printAutoFixSuggestion()

    // 轮询检测页面变化（热更新）
    setInterval(watchPageChange, mpConfig.automation.pageWatch.interval)

    // 监听退出信号
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 收到退出信号，正在保存日志...')
      // 保存最后一个页面周期的日志
      await savePageLogs()
      if (miniProgram) miniProgram.disconnect()
      if (cliProcess) cliProcess.kill()
      console.log('✅ 日志已保存，程序退出')
      process.exit(0)
    })
  } catch (e) {
    console.error(`❌ 连接开发者工具失败: ${e.message}`)
    if (cliProcess) cliProcess.kill()
    process.exit(1)
  }
}

main().catch(console.error)
