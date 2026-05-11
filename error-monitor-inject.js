/**
 * 错误监听器 - 注入版本
 *
 * 通过 evaluate() 在小程序中注入全局错误处理
 * 然后通过 exposeFunction() 接收错误回调
 */

const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

class ErrorMonitorInject {
  constructor() {
    this.miniProgram = null
    this.cliProcess = null
    this.isMonitoring = false
    this.errorCount = 0
  }

  getTimestampFolderName() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${hours}-${minutes}-${seconds}`
  }

  async start() {
    console.log('\n========== 错误监听器启动（注入模式）==========\n')
    console.log('📡 监听模式: 注入全局错误处理')
    console.log('📁 保存格式: 时-分-秒 文件夹')
    console.log('✅ 可以捕获所有运行时错误\n')

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

      console.log('步骤3: 注入全局错误处理')
      console.log('----------------------------------------')

      await this.injectErrorHandler()

      this.isMonitoring = true

      console.log('========== 监听已启动 ==========\n')
      console.log('🔍 已注入全局错误处理...')
      console.log('💡 所有运行时错误都会被捕获')
      console.log('⏹️  按 Ctrl+C 停止监听\n')
    } catch (error) {
      console.error('❌ 连接失败:', error.message)
      this.stop()
    }
  }

  async injectErrorHandler() {
    // 暴露错误处理函数给小程序调用
    await this.miniProgram.exposeFunction('__reportError', async errorInfo => {
      this.errorCount++
      console.log(`\n🚨 检测到错误 #${this.errorCount}`)
      console.log(`   时间: ${new Date().toLocaleString('zh-CN')}`)
      console.log(`   类型: ${errorInfo.type || 'error'}`)
      console.log(`   消息: ${errorInfo.message}`)
      console.log(`   堆栈: ${errorInfo.stack || '(无)'}\n`)

      await this.captureError(errorInfo)
    })

    // 在小程序中注入全局错误处理
    await this.miniProgram.evaluate(function () {
      // 保存原始console方法
      const originalError = console.error
      const originalWarn = console.warn

      // 重写console.error
      console.error = function (...args) {
        originalError.apply(console, args)

        if (typeof __reportError === 'function') {
          __reportError({
            type: 'console.error',
            message: args
              .map(arg => {
                if (typeof arg === 'object') {
                  try {
                    return JSON.stringify(arg)
                  } catch (e) {
                    return String(arg)
                  }
                }
                return String(arg)
              })
              .join(' '),
            timestamp: new Date().toISOString()
          })
        }
      }

      // 重写console.warn
      console.warn = function (...args) {
        originalWarn.apply(console, args)

        if (typeof __reportError === 'function') {
          __reportError({
            type: 'console.warn',
            message: args
              .map(arg => {
                if (typeof arg === 'object') {
                  try {
                    return JSON.stringify(arg)
                  } catch (e) {
                    return String(arg)
                  }
                }
                return String(arg)
              })
              .join(' '),
            timestamp: new Date().toISOString()
          })
        }
      }

      // 捕获未处理的错误
      wx.onError(function (error) {
        if (typeof __reportError === 'function') {
          __reportError({
            type: 'wx.onError',
            message: error,
            timestamp: new Date().toISOString()
          })
        }
      })

      // 捕获未处理的Promise rejection
      wx.onUnhandledRejection(function (res) {
        if (typeof __reportError === 'function') {
          __reportError({
            type: 'unhandledRejection',
            message: res.reason || String(res),
            timestamp: new Date().toISOString()
          })
        }
      })

      console.log('✅ 全局错误处理已注入')
    })

    console.log('   ✅ 已注入全局错误处理\n')
  }

  async captureError(errorInfo) {
    try {
      console.log('📸 开始捕获错误详情...')

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
        console.log(`   ⚠️  无法获取页面信息: ${err.message}`)
      }

      const errorReport = {
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
        errorNumber: this.errorCount,
        page: pagePath,
        error: {
          type: errorInfo.type || 'error',
          message: errorInfo.message || '(无消息)',
          stack: errorInfo.stack || null,
          timestamp: errorInfo.timestamp || new Date().toISOString()
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
          errorReport.dom = {
            error: err.message,
            page: pagePath
          }
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
        errorReport.screenshot = {
          error: err.message
        }
      }

      // 保存错误报告
      const reportPath = path.join(errorDir, 'error-report.json')
      await fs.writeJSON(reportPath, errorReport, { spaces: 2 })

      console.log(`   ✅ 错误报告已保存\n`)
      console.log(`📦 错误 #${this.errorCount} 捕获完成`)
      console.log(`   目录: error-logs/${timestamp}/`)
      console.log(`   文件: error-report.json, error-screenshot.png\n`)
      console.log('🔍 继续监听中...\n')
    } catch (error) {
      console.error(`   ❌ 捕获失败: ${error.message}\n`)
      console.log('🔍 继续监听中...\n')
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
    console.log(`   - 保存目录: error-logs/\n`)

    process.exit(0)
  }
}

async function main() {
  const monitor = new ErrorMonitorInject()

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

module.exports = ErrorMonitorInject
