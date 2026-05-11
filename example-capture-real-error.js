/**
 * 完整案例：捕获页面真实错误内容、截图和DOM
 *
 * 功能：
 * 1. 在页面中注入一个真实的错误
 * 2. 启动小程序并监听错误
 * 3. 捕获错误信息、DOM结构和页面截图
 * 4. 生成完整的错误报告
 */

const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

async function captureRealError() {
  console.log('\n========== 真实错误捕获完整案例 ==========\n')

  const resultsDir = path.join(__dirname, 'example-results')
  await fs.ensureDir(resultsDir)

  // ========== 步骤1: 准备测试错误 ==========
  console.log('步骤1: 在home.js中注入真实错误')
  console.log('----------------------------------------')

  const homeJsPath = path.join(config.projectPath, 'pages/home/home.js')
  const backupPath = `${homeJsPath}.example-backup`

  // 备份原文件
  await fs.copy(homeJsPath, backupPath)
  console.log('✅ 已备份原文件\n')

  // 读取原内容
  let originalContent = await fs.readFile(homeJsPath, 'utf-8')

  // 注入一个真实的错误：访问未定义对象的属性
  const errorCode = `
    // === 测试错误：访问未定义对象的属性 ===
    console.log('页面加载开始');
    
    // 故意创建一个错误
    const userData = null;
    console.log('尝试访问userData.name');
    const userName = userData.name; // 这里会抛出TypeError
    
    console.log('这行不会执行:', userName);
    // === 测试错误结束 ===
  `

  const modifiedContent = originalContent.replace('onLoad(options) {', `onLoad(options) {${errorCode}`)

  await fs.writeFile(homeJsPath, modifiedContent, 'utf-8')
  console.log('✅ 已注入错误代码')
  console.log('   错误类型: TypeError - 访问null的属性')
  console.log('   错误位置: pages/home/home.js onLoad方法\n')

  // ========== 步骤2: 启动自动化模式 ==========
  console.log('步骤2: 启动微信开发者工具自动化模式')
  console.log('----------------------------------------')

  const autoPort = 9420
  const cliProcess = spawn(config.cliPath, ['auto', '--project', config.projectPath, '--auto-port', String(autoPort)])

  let cliOutput = ''
  cliProcess.stdout.on('data', data => {
    const text = data.toString()
    cliOutput += text
    if (text.includes('✔')) {
      console.log('   CLI:', text.trim())
    }
  })

  cliProcess.stderr.on('data', data => {
    cliOutput += data.toString()
  })

  console.log('   等待10秒启动...\n')
  await new Promise(resolve => setTimeout(resolve, 10000))

  // ========== 步骤3: 连接automator并监听错误 ==========
  console.log('步骤3: 连接automator并开始监听')
  console.log('----------------------------------------')

  let miniProgram
  const errorReport = {
    timestamp: new Date().toISOString(),
    errorType: 'TypeError',
    errorDescription: '访问null对象的属性',
    page: null,
    errors: [],
    allLogs: [],
    dom: null,
    screenshot: null
  }

  try {
    miniProgram = await automator.connect({
      wsEndpoint: `ws://localhost:${autoPort}`
    })

    console.log('✅ 已连接到automator\n')

    const errors = []
    const allLogs = []

    // 开始监听console事件
    console.log('步骤4: 监听Console事件')
    console.log('----------------------------------------')

    miniProgram.on('console', msg => {
      const logEntry = {
        type: msg.type,
        text: msg.text || '(无文本)',
        timestamp: new Date().toISOString()
      }

      allLogs.push(logEntry)

      // 打印日志
      const icon = msg.type === 'error' ? '❌' : msg.type === 'warn' ? '⚠️' : msg.type === 'log' ? '📝' : 'ℹ️'
      console.log(`   ${icon} [${msg.type.toUpperCase()}] ${msg.text || '(无文本)'}`)

      // 收集错误
      if (msg.type === 'error') {
        errors.push(logEntry)
      }
    })

    // 获取当前页面
    const page = await miniProgram.currentPage()
    errorReport.page = page.path

    // 触发错误（重新调用onLoad）
    console.log('\n   触发页面加载（会产生错误）...')
    try {
      await page.callMethod('onLoad', {})
    } catch (err) {
      console.log(`   ⚠️  callMethod异常: ${err.message}`)
    }

    // 等待收集错误
    console.log('   等待5秒收集所有日志...\n')
    await new Promise(resolve => setTimeout(resolve, 5000))

    console.log(`   ✅ 收集完成: ${allLogs.length} 条日志，${errors.length} 条错误\n`)

    // ========== 步骤5: 捕获DOM的HTML原生结构 ==========
    console.log('步骤5: 捕获DOM的HTML原生结构')
    console.log('----------------------------------------')

    const pageData = await page.data()

    console.log(`   页面路径: ${page.path}`)
    console.log(`   页面数据键: ${Object.keys(pageData).length} 个`)

    // 获取页面的完整WXML结构（类似HTML）
    let htmlStructure = ''

    // 获取所有常见的小程序元素
    const elementTypes = ['view', 'text', 'image', 'button', 'input', 'scroll-view', 'swiper', 'navigator']
    let htmlParts = ['<page>\n']
    let totalElements = 0

    for (const tagName of elementTypes) {
      try {
        const elements = await page.$$(tagName)
        console.log(`   找到 ${elements.length} 个 <${tagName}> 元素`)

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
        console.log(`   ⚠️  获取${tagName}失败: ${err.message}`)
      }
    }

    htmlParts.push('</page>')
    htmlStructure = htmlParts.join('')

    console.log(`   ✅ 已构建HTML结构，共 ${totalElements} 个元素`)
    console.log(`   ✅ HTML长度: ${htmlStructure.length} 字符`)

    // 保存HTML结构到文件
    const htmlPath = path.join(resultsDir, 'page-structure.html')
    await fs.writeFile(htmlPath, htmlStructure, 'utf-8')
    console.log(`   ✅ HTML已保存: ${htmlPath}`)

    errorReport.dom = {
      page: page.path,
      dataKeysCount: Object.keys(pageData).length,
      htmlStructure: htmlStructure,
      htmlLength: htmlStructure.length
    }

    console.log('   ✅ DOM的HTML原生结构已捕获\n')

    // ========== 步骤6: 捕获页面截图 ==========
    console.log('步骤6: 捕获错误页面截图')
    console.log('----------------------------------------')

    const screenshotBase64 = await miniProgram.screenshot()
    const screenshotBuffer = Buffer.from(screenshotBase64, 'base64')

    const screenshotPath = path.join(resultsDir, 'error-screenshot.png')
    await fs.writeFile(screenshotPath, screenshotBuffer)

    console.log(`   ✅ 截图已保存: ${screenshotPath}`)
    console.log(`   ✅ 文件大小: ${(screenshotBuffer.length / 1024).toFixed(2)} KB\n`)

    errorReport.screenshot = {
      path: screenshotPath,
      size: screenshotBuffer.length
    }

    // ========== 步骤7: 整理错误信息 ==========
    errorReport.errors = errors
    errorReport.allLogs = allLogs

    // ========== 步骤8: 生成完整报告 ==========
    console.log('步骤7: 生成完整错误报告')
    console.log('----------------------------------------')

    const reportPath = path.join(resultsDir, 'error-report.json')
    await fs.writeJSON(reportPath, errorReport, { spaces: 2 })

    console.log(`   ✅ 报告已保存: ${reportPath}\n`)

    // ========== 步骤9: 显示捕获结果 ==========
    console.log('========== 捕获结果总结 ==========\n')

    console.log('📋 错误信息:')
    console.log(`   - 错误数量: ${errors.length} 条`)
    if (errors.length > 0) {
      errors.forEach((err, i) => {
        console.log(`   - 错误${i + 1}: [${err.type}] ${err.text} (${err.timestamp})`)
      })
    }

    console.log('\n📊 日志信息:')
    console.log(`   - 总日志数: ${allLogs.length} 条`)
    const logTypes = {}
    allLogs.forEach(log => {
      logTypes[log.type] = (logTypes[log.type] || 0) + 1
    })
    Object.keys(logTypes).forEach(type => {
      console.log(`   - ${type}: ${logTypes[type]} 条`)
    })

    console.log('\n🌳 DOM结构:')
    console.log(`   - 页面: ${errorReport.dom.page}`)
    console.log(`   - HTML结构长度: ${errorReport.dom.htmlLength} 字符`)
    console.log(`   - 页面数据键: ${errorReport.dom.dataKeysCount} 个`)
    console.log(`   - HTML结构预览:\n${errorReport.dom.htmlStructure.substring(0, 200)}...`)

    console.log('\n📸 截图信息:')
    console.log(`   - 文件大小: ${(errorReport.screenshot.size / 1024).toFixed(2)} KB`)
    console.log(`   - PNG路径: ${errorReport.screenshot.path}`)

    console.log('\n📁 生成的文件:')
    console.log(`   - error-report.json (完整错误报告，包含HTML结构)`)
    console.log(`   - error-screenshot.png (错误页面截图)`)

    console.log('\n✅ 所有数据已成功捕获！')
    console.log('   这些数据可以直接发送给AI进行分析和修复\n')
  } catch (error) {
    console.error('\n❌ 捕获失败:', error.message)
    console.error(error.stack)
  } finally {
    // ========== 清理工作 ==========
    if (miniProgram) {
      await miniProgram.disconnect()
      console.log('已断开automator连接')
    }

    cliProcess.kill()
    console.log('已关闭CLI进程')

    // 恢复原文件
    console.log('\n恢复原文件...')
    await fs.copy(backupPath, homeJsPath)
    await fs.remove(backupPath)
    console.log('✅ 已恢复home.js原内容\n')
  }
}

// 运行案例
if (require.main === module) {
  captureRealError().catch(error => {
    console.error('案例运行失败:', error)
    process.exit(1)
  })
}

module.exports = captureRealError
