/**
 * 错误监听器 - Launch版本
 *
 * 使用 automator.launch() 而非 connect()
 * 这样可以正确接收 console 事件
 */

const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

class ErrorMonitorLaunch {
  constructor() {
    this.miniProgram = null
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
    console.log('\n========== 错误监听器启动（Launch模式）==========\n')
    console.log('📡 监听模式: 使用launch启动小程序')
    console.log('📁 保存格式: 时-分-秒 文件夹')
    console.log('✅ 支持完整的console事件监听\n')

    console.log('步骤1: 使用automator.launch()启动小程序')
    console.log('----------------------------------------')

    try {
      this.miniProgram = await automator.launch({
        cliPath: config.cliPath,
        projectPath: config.projectPath,
        port: 9420 // 自动化端口
      })

      console.log('✅ 小程序已启动\n')

      this.isMonitoring = true
      this.setupErrorListener()

      console.log('========== 监听已启动 ==========\n')
      console.log('🔍 正在监听console消息...')
      console.log('💡 所有console.log/warn/error都会被捕获')
      console.log('⏹️  按 Ctrl+C 停止监听\n')
    } catch (error) {
      console.error('❌ 启动失败:', error.message)
      this.stop()
    }
  }

  setupErrorListener() {
    // 监听所有console消息
    this.miniProgram.on('console', async msg => {
      const timestamp = new Date().toLocaleTimeString('zh-CN')

      // 打印所有console消息
      console.log(`[${timestamp}] Console ${msg.type}: ${msg.text || JSON.stringify(msg.args)}`)

      // 只捕获error和warn
      if (msg.type === 'error' || msg.type === 'warn') {
        this.errorCount++
        console.log(`\n🚨 检测到${msg.type === 'error' ? '错误' : '警告'} #${this.errorCount}`)
        console.log(`   时间: ${new Date().toLocaleString('zh-CN')}`)
        console.log(`   类型: ${msg.type}`)
        console.log(`   内容: ${msg.text || '(无文本)'}`)
        console.log(`   参数: ${JSON.stringify(msg.args || [])}\n`)

        await this.captureError({
          source: 'console',
          type: msg.type,
          text: msg.text || '(无文本)',
          args: msg.args
        })
      }
    })
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
          source: errorInfo.source || 'unknown',
          type: errorInfo.type || 'error',
          text: errorInfo.text || '(无文本)',
          args: errorInfo.args || null,
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

    if (this.miniProgram) {
      await this.miniProgram.close()
      console.log('✅ 已关闭小程序')
    }

    console.log(`\n📊 监听统计:`)
    console.log(`   - 捕获错误数: ${this.errorCount} 个`)
    console.log(`   - 保存目录: error-logs/\n`)

    process.exit(0)
  }
}

async function main() {
  const monitor = new ErrorMonitorLaunch()

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

module.exports = ErrorMonitorLaunch
