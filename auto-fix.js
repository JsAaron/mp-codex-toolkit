const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')
const net = require('net')

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

// 保存错误（修复核心：确保目录创建完成后再写入文件）
async function saveError(type, message, extraData = {}) {
  const key = type + ':' + message
  if (captured.has(key)) return

  captured.add(key)
  console.log(`\n💾 准备保存错误:`)
  console.log(`  类型: ${type}`)
  console.log(`  消息: ${message}`)

  const stackLocations = parseStackTrace(extraData.stack)
  if (stackLocations && stackLocations.length > 0) {
    console.log(`📍 错误位置（编译后的行号）:`)
    stackLocations.slice(0, 3).forEach((loc, idx) => {
      console.log(`   ${idx + 1}. ${loc.file}:${loc.line}:${loc.column} (${loc.function})`)
    })
  }

  try {
    const dateStr = getDateString()
    const timeStr = getTimeString()
    const errorDir = path.join(__dirname, 'error-logs', dateStr, timeStr)

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

    // 修复：写入JSON前确认目录存在
    await fs.ensureDir(errorDir)
    await fs.writeJSON(
      path.join(errorDir, 'error.json'),
      {
        type,
        message,
        page: pagePath,
        time: new Date().toISOString(),
        stackLocations,
        ...extraData
      },
      { spaces: 2 }
    )
    console.log(`✅ 已保存到: error-logs/${dateStr}/${timeStr}/\n`)
  } catch (e) {
    console.error(`❌ 保存错误日志失败: ${e.message}`)
    // 可选：捕获错误后移除已添加的key，避免永久去重
    const key = type + ':' + message
    captured.delete(key)
  }
}

// 保存当前页面周期的普通日志
async function savePageLogs() {
  if (currentPageLogs.length === 0) return

  try {
    const dateStr = getDateString()
    const timeStr = getTimeString()
    const logDir = path.join(__dirname, 'error-logs', dateStr, 'page-logs')
    await fs.ensureDir(logDir)

    const logFileName = `page-${pageReloadCount}_${lastPagePath?.replace(/\//g, '-') || 'unknown'}_${timeStr}.log`
    const logFilePath = path.join(logDir, logFileName)

    const logContent = [
      `页面刷新周期 #${pageReloadCount}`,
      `页面路径: ${lastPagePath || 'unknown'}`,
      `开始时间: ${currentPageStartTime ? new Date(currentPageStartTime).toISOString() : 'unknown'}`,
      `结束时间: ${new Date().toISOString()}`,
      `日志数量: ${currentPageLogs.length}`,
      `${'='.repeat(80)}`,
      '',
      ...currentPageLogs,
      ''
    ].join('\n')

    await fs.writeFile(logFilePath, logContent, 'utf-8')
    console.log(`📝 已保存页面日志: error-logs/${dateStr}/page-logs/${logFileName} (${currentPageLogs.length}条)\n`)
  } catch (e) {
    console.error(`❌ 保存页面日志失败: ${e.message}`)
  }
}

// 核心：绑定所有事件监听（可重复调用，先解绑再绑定）
function bindAllListeners() {
  if (!miniProgram) return

  // 先移除所有原有监听，避免重复绑定
  miniProgram.removeAllListeners('console')
  miniProgram.removeAllListeners('scripterror')
  miniProgram.removeAllListeners('pageerror')
  miniProgram.removeAllListeners('exception')
  miniProgram.removeAllListeners('error')

  // 1. 修复 console 监听：优化 text 为 undefined 的问题
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
    // 打印优化后的 console 信息
    console.log(`[Console捕获] type:${msg.type} | text:${text} | args:`, msg.args)

    // 收集普通日志（log/info）到当前页面周期
    if (msg.type === 'log' || msg.type === 'info') {
      const timestamp = new Date().toISOString()
      const logLine = `[${timestamp}] [${msg.type.toUpperCase()}] ${text}`
      currentPageLogs.push(logLine)
    }

    // 错误和警告仍然单独保存
    if (msg.type === 'error' || msg.type === 'warn') {
      const message = text || JSON.stringify(msg)
      await saveError(`console.${msg.type}`, message, { args: msg.args, type: msg.type })
    }
  })

  // 2. 脚本错误
  miniProgram.on('scripterror', async msg => {
    const message = msg.message || msg.stack || JSON.stringify(msg)
    await saveError('scripterror', message, {
      stack: msg.stack,
      filename: msg.filename,
      lineno: msg.lineno,
      colno: msg.colno
    })
  })

  // 3. 页面错误
  miniProgram.on('pageerror', async msg => {
    const message = msg.message || JSON.stringify(msg)
    await saveError('pageerror', message, { detail: msg })
  })

  // 4. 异常事件
  miniProgram.on('exception', async msg => {
    const message = msg.message || msg.stack || JSON.stringify(msg)
    await saveError('exception', message, {
      stack: msg.stack,
      detail: msg
    })
  })

  // 5. 系统错误
  miniProgram.on('error', async msg => {
    const message = msg.message || JSON.stringify(msg)
    await saveError('system error', message, { detail: msg })
  })

  console.log('✅ 所有事件监听已重新绑定')
}

// 监听页面变化，热更新后重建监听
async function watchPageChange() {
  try {
    const page = await miniProgram.currentPage()
    const currentPath = page.path

    if (currentPath !== lastPagePath) {
      // 保存上一个页面周期的日志
      if (pageReloadCount > 0) {
        await savePageLogs()
      }

      // 重置当前页面周期的日志
      currentPageLogs = []
      currentPageStartTime = Date.now()
      pageReloadCount++

      console.log(`\n${'='.repeat(60)}`)
      console.log(`📄 页面变化 #${pageReloadCount}: ${lastPagePath || '(初始)'} -> ${currentPath}`)
      console.log(`⏰ 时间: ${new Date().toLocaleTimeString()}`)
      console.log(`${'='.repeat(60)}\n`)
      lastPagePath = currentPath

      // 核心：页面变化（热更新）后重新绑定监听
      bindAllListeners()
    }
  } catch (e) {
    console.warn(`⚠️ 检测页面变化失败: ${e.message}`)
  }
}

async function main() {
  console.log('启动监听器...\n')
  const autoPort = 9420

  // 检测端口
  const isPortUsed = await checkPortIsUsed(autoPort)
  if (isPortUsed) {
    console.log(`✅ 检测到 ${autoPort} 端口已被占用，开发者工具已运行\n`)
  } else {
    console.log(`🔄 ${autoPort} 端口未占用，启动开发者工具自动化模式...\n`)
    cliProcess = spawn(config.cliPath, ['auto', '--project', config.projectPath, '--auto-port', String(autoPort)])

    // 监听CLI输出，便于调试
    cliProcess.stdout.on('data', data => {
      console.log(`📢 CLI输出: ${data.toString().trim()}`)
    })
    cliProcess.stderr.on('data', data => {
      console.log(`⚠️ CLI错误输出: ${data.toString().trim()}`)
    })
  }

  // 等待工具启动
  const waitTime = isPortUsed ? 1000 : 10000
  await new Promise(resolve => setTimeout(resolve, waitTime))

  try {
    // 连接小程序自动化工具
    miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${autoPort}` })
    console.log('✅ 已连接到开发者工具\n')

    // 初始化绑定监听
    bindAllListeners()

    // 轮询检测页面变化（热更新）
    setInterval(watchPageChange, 500)

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
