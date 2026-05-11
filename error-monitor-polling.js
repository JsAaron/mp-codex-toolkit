/**
 * 错误监听器 - 轮询版本
 *
 * 由于miniprogram-automator的console事件无法接收消息，
 * 改用主动轮询的方式检测页面状态变化
 */

const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

class ErrorMonitorPolling {
  constructor() {
    this.miniProgram = null
    this.cliProcess = null
    this.isMonitoring = false
    this.errorCount = 0
    this.pollingInterval = null
    this.lastPagePath = null
    this.lastPageData = null
  }

  getTimestampFolderName() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${hours}-${minutes}-${seconds}`
  }

  async start() {
    console.log('\n========== 错误监听器启动（轮询模式）==========\n')
    console.log('📡 监听模式: 主动轮询页面状态')
    console.log('📁 保存格式: 时-分-秒 文件夹')
    console.log('⚠️  说明: 由于console事件无法使用，改用轮询方式\n')

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

      this.isMonitoring = true
      this.startPolling()

      console.log('========== 监听已启动 ==========\n')
      console.log('🔍 每3秒检查一次页面状态...')
      console.log('💡 检测到页面错误或异常时会自动捕获')
      console.log('⏹️  按 Ctrl+C 停止监听\n')
    } catch (error) {
      console.error('❌ 连接失败:', error.message)
      this.stop()
    }
  }

  startPolling() {
    let checkCount = 0

    this.pollingInterval = setInterval(async () => {
      try {
        checkCount++

        const page = await this.miniProgram.currentPage()
        const pagePath = page.path

        // 检测页面切换
        if (this.lastPagePath !== pagePath) {
          console.log(`[${new Date().toLocaleTimeString()}] 页面切换: ${this.lastPagePath || '(无)'} -> ${pagePath}`)
          this.lastPagePath = pagePath
        }

        // 尝试获取页面数据，如果失败说明页面有问题
        try {
          const pageData = await page.data()

          // 检测数据变化（可能表示错误恢复）
          const dataKeys = Object.keys(pageData).length
          if (this.lastPageData && this.lastPageData !== dataKeys) {
            console.log(`[${new Date().toLocaleTimeString()}] 页面数据变化: ${this.lastPageData} -> ${dataKeys} 个键`)
          }
          this.lastPageData = dataKeys

          // 每30秒输出一次状态
          if (checkCount % 10 === 0) {
            console.log(`[${new Date().toLocaleTimeString()}] 状态正常 - 页面: ${pagePath}, 数据键: ${dataKeys}`)
          }
        } catch (error) {
          // 页面数据获取失败，可能是错误
          this.errorCount++
          console.log(`\n🚨 检测到页面异常 #${this.errorCount}`)
          console.log(`   时间: ${new Date().toLocaleString('zh-CN')}`)
          console.log(`   页面: ${pagePath}`)
          console.log(`   错误: ${error.message}\n`)

          await this.captureError(
            {
              source: 'polling-check',
              type: 'page-data-error',
              text: error.message,
              stack: error.stack
            },
            page
          )
        }
      } catch (error) {
        // 无法获取页面，可能是小程序关闭或崩溃
        if (this.isMonitoring) {
          console.log(`[${new Date().toLocaleTimeString()}] ⚠️  无法访问页面: ${error.message}`)
        }
      }
    }, 3000) // 每3秒检查一次
  }

  async captureError(errorInfo, page = null) {
    try {
      console.log('📸 开始捕获错误详情...')

      const timestamp = this.getTimestampFolderName()
      const errorDir = path.join(__dirname, 'error-logs', timestamp)
      await fs.ensureDir(errorDir)

      console.log(`   📁 保存目录: error-logs/${timestamp}`)

      let pagePath = 'unknown'

      if (!page) {
        try {
          page = await this.miniProgram.currentPage()
          pagePath = page.path
        } catch (err) {
          console.log(`   ⚠️  无法获取页面: ${err.message}`)
        }
      } else {
        pagePath = page.path
      }

      console.log(`   📄 当前页面: ${pagePath}`)

      const errorReport = {
        timestamp: new Date().toISOString(),
        localTime: new Date().toLocaleString('zh-CN'),
        errorNumber: this.errorCount,
        page: pagePath,
        error: {
          source: errorInfo.source || 'unknown',
          type: errorInfo.type || 'error',
          text: errorInfo.text || '(无文本)',
          stack: errorInfo.stack || null,
          timestamp: new Date().toISOString()
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

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      console.log('✅ 已停止轮询')
    }

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
  const monitor = new ErrorMonitorPolling()

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

module.exports = ErrorMonitorPolling
