/**
 * 错误监听器 - Console轮询版本
 *
 * 每次刷新后等待3秒，然后检查开发者工具console中的错误日志
 * 如果发现错误就记录下来
 */

const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

class ErrorMonitorPollingConsole {
  constructor() {
    this.miniProgram = null
    this.cliProcess = null
    this.isMonitoring = false
    this.errorCount = 0
    this.lastCheckTime = Date.now()
    this.consoleMessages = []
  }

  getTimestampFolderName() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${hours}-${minutes}-${seconds}`
  }

  async start() {
    console.log('\n========== 错误监听器启动（Console轮询模式）==========\n')
    console.log('📡 监听模式: 定期检查console日志')
    console.log('📁 保存格式: 时-分-秒 文件夹')
    console.log('⏰ 检查频率: 每3秒检查一次\n')

    console.log('步骤1: 启动微信开发者工具自动化模式')
    console.log('----------------------------------------')

    const autoPort = 9420
    this.cliProcess = spawn(config.cliPath, ['auto', '--project', config.projectPath, '--auto-port', String(autoPort)])

    this.cliProcess.stdout.on('data', data => {
      const text = data.toString()
      if (text.includes('✔')) {
        console.log('   CLI:', text.trim())
      }
    })

    console.log('   等待10秒启动...\n')
    await new Promise(resolve => setTimeout(resolve, 10000))

    console.log('步骤2: 连接automator')
    console.log('----------------------------------------')

    try {
      this.miniProgram = await automator.connect({
        wsEndpoint: `ws://localhost:${autoPort}`
      })

      console.log('✅ 已连接到automator\n')

      console.log('步骤3: 注入console监听')
      console.log('----------------------------------------')

      await this.injectConsoleListener()

      this.isMonitoring = true
      this.startPolling()

      console.log('========== 监听已启动 ==========\n')
      console.log('🔍 每3秒检查一次console日志...')
      console.log('💡 发现错误时自动捕获并保存')
      console.log('⏹️  按 Ctrl+C 停止监听\n')
    } catch (error) {
      console.error('❌ 连接失败:', error.message)
      this.stop()
    }
  }

  async injectConsoleListener() {
    // 暴露函数给小程序调用
    await this.miniProgram.exposeFunction('__collectConsoleLog', logData => {
      this.consoleMessages.push({
        ...logData,
        receivedAt: Date.now()
      })
    })

    // 在小程序中注入console监听
    await this.miniProgram.evaluate(function () {
      // 保存原始console方法
      const originalLog = console.log
      const originalWarn = console.warn
      const originalError = console.error

      // 重写console.log
      console.log = function (...args) {
        originalLog.apply(console, args)
        if (typeof __collectConsoleLog === 'function') {
          __collectConsoleLog({
            type: 'log',
            args: args.map(arg => {
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg)
                } catch (e) {
                  return String(arg)
                }
              }
              return String(arg)
            }),
            timestamp: Date.now()
          })
        }
      }

      // 重写console.warn
      console.warn = function (...args) {
        originalWarn.apply(console, args)
        if (typeof __collectConsoleLog === 'function') {
          __collectConsoleLog({
            type: 'warn',
            args: args.map(arg => {
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg)
                } catch (e) {
                  return String(arg)
                }
              }
              return String(arg)
            }),
            timestamp: Date.now()
          })
        }
      }

      // 重写console.error
      console.error = function (...args) {
        originalError.apply(console, args)
        if (typeof __collectConsoleLog === 'function') {
          __collectConsoleLog({
            type: 'error',
            args: args.map(arg => {
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg)
                } catch (e) {
                  return String(arg)
                }
              }
              return String(arg)
            }),
            timestamp: Date.now()
          })
        }
      }

      console.log('✅ Console监听已注入')
    })

    console.log('   ✅ 已注入console监听\n')
  }

  startPolling() {
    let checkCount = 0

    setInterval(async () => {
      checkCount++
      const now = Date.now()

      // 获取最近3秒内的console消息
      const recentMessages = this.consoleMessages.filter(msg => {
        return msg.receivedAt > this.lastCheckTime
      })

      if (recentMessages.length > 0) {
        const timestamp = new Date().toLocaleTimeString('zh-CN')
        console.log(`[${timestamp}] 检查到 ${recentMessages.length} 条新消息`)

        // 检查是否有错误
        const errors = recentMessages.filter(msg => msg.type === 'error')
        const warnings = recentMessages.filter(msg => msg.type === 'warn')

        if (errors.length > 0) {
          console.log(`   🚨 发现 ${errors.length} 个错误`)
          for (const error of errors) {
            await this.captureError(error)
          }
        }

        if (warnings.length > 0) {
          console.log(`   ⚠️  发现 ${warnings.length} 个警告`)
        }

        // 显示所有消息（简化版）
        recentMessages.forEach(msg => {
          const icon = msg.type === 'error' ? '❌' : msg.type === 'warn' ? '⚠️' : 'ℹ️'
          console.log(`   ${icon} [${msg.type}] ${msg.args.join(' ')}`)
        })

        console.log('')
      } else {
        // 每30秒输出一次状态
        if (checkCount % 10 === 0) {
          const timestamp = new Date().toLocaleTimeString('zh-CN')
          console.log(`[${timestamp}] 状态正常 - 无新消息`)
        }
      }

      this.lastCheckTime = now
    }, 3000) // 每3秒检查一次
  }

  async captureError(errorInfo) {
    try {
      this.errorCount++
      console.log(`\n📸 捕获错误 #${this.errorCount}...`)

      const timestamp = this.getTimestampFolderName()
      const errorDir = path.join(__dirname, 'error-logs', timestamp)
      await fs.ensureDir(errorDir)

      console.log(`   📁 保存目录: error-logs/${timestamp}`)

      let pagePath = 'unknown'
      let page = null

      try {
        page = await this.miniProgram.currentPage()
        pagePath = page.path
        console.log(`   📄 当前页面: ${pagePath}`)
      } catch (err) {
        console.log(`   ⚠️  无法获取页面: ${err.message}`)
      }

      const errorReport = {
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
        errorNumber: this.errorCount,
        page: pagePath,
        error: {
          type: errorInfo.type,
          message: errorInfo.args.join(' '),
          timestamp: new Date(errorInfo.timestamp).toISOString()
        },
        dom: null,
        screenshot: null
      }

      // 捕获DOM结构
      if (page) {
        try {
          console.log('   🌳 捕获DOM结构...')
          const pageData = await page.data()

          const elementTypes = ['view', 'text', 'image', 'button', 'input', 'scroll-view', 'swiper', 'navigator']
          let htmlParts = ['<page>\n']
          let totalElements = 0

          for (const tagName of elementTypes) {
            try {
              const elements = await page.$$(tagName)
              for (let i = 0; i < elements.length; i++) {
                const el = elements[i]
                const className = await el.attribute('class')
                const id = await el.attribute('id')

                let attrs = ''
                if (className) attrs += ` class="${className}"`
                if (id) attrs += ` id="${id}"`

                htmlParts.push(`  <${tagName}${attrs}></${tagName}>\n`)
                totalElements++
              }
            } catch (err) {
              // 忽略
            }
          }

          htmlParts.push('</page>')
          const htmlStructure = htmlParts.join('')

          errorReport.dom = {
            page: pagePath,
            dataKeysCount: Object.keys(pageData).length,
            htmlStructure: htmlStructure,
            htmlLength: htmlStructure.length,
            totalElements: totalElements
          }

          console.log(`   ✅ DOM结构已捕获 (${totalElements} 个元素)`)
        } catch (err) {
          console.log(`   ⚠️  DOM捕获失败: ${err.message}`)
          errorReport.dom = { error: err.message, page: pagePath }
        }
      }

      // 捕获截图
      try {
        console.log('   📷 捕获页面截图...')
        const screenshotBase64 = await this.miniProgram.screenshot()
        const screenshotBuffer = Buffer.from(screenshotBase64, 'base64')

        const screenshotPath = path.join(errorDir, 'error-screenshot.png')
        await fs.writeFile(screenshotPath, screenshotBuffer)

        errorReport.screenshot = {
          path: screenshotPath,
          size: screenshotBuffer.length
        }

        console.log(`   ✅ 截图已保存 (${(screenshotBuffer.length / 1024).toFixed(2)} KB)`)
      } catch (err) {
        console.log(`   ⚠️  截图捕获失败: ${err.message}`)
        errorReport.screenshot = { error: err.message }
      }

      // 保存错误报告
      const reportPath = path.join(errorDir, 'error-report.json')
      await fs.writeJSON(reportPath, errorReport, { spaces: 2 })

      console.log(`   ✅ 错误报告已保存`)
      console.log(`📦 错误 #${this.errorCount} 捕获完成`)
      console.log(`   目录: error-logs/${timestamp}/\n`)
    } catch (error) {
      console.error(`   ❌ 捕获失败: ${error.message}\n`)
    }
  }

  async stop() {
    console.log('\n========== 停止监听 ==========\n')

    this.isMonitoring = false

    if (this.miniProgram) {
      await this.miniProgram.disconnect()
      console.log('✅ 已断开automator连接')
    }

    if (this.cliProcess) {
      this.cliProcess.kill()
      console.log('✅ 已关闭CLI进程')
    }

    console.log(`\n📊 监听统计:`)
    console.log(`   - 捕获错误数: ${this.errorCount} 个`)
    console.log(`   - 收集消息数: ${this.consoleMessages.length} 条`)
    console.log(`   - 保存目录: error-logs/\n`)

    process.exit(0)
  }
}

async function main() {
  const monitor = new ErrorMonitorPollingConsole()

  process.on('SIGINT', async () => {
    await monitor.stop()
  })

  process.on('SIGTERM', async () => {
    await monitor.stop()
  })

  try {
    await monitor.start()
  } catch (error) {
    console.error('启动失败:', error)
    await monitor.stop()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('程序异常:', error)
    process.exit(1)
  })
}

module.exports = ErrorMonitorPollingConsole
