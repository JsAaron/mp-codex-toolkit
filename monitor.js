const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')
const fs = require('fs-extra')
const path = require('path')

async function main() {
  console.log('启动监听器...\n')

  const autoPort = 9420
  const cliProcess = spawn(config.cliPath, ['auto', '--project', config.projectPath, '--auto-port', String(autoPort)])

  // 监听 CLI 进程的输出（捕获编译错误）
  const compileErrors = new Set()

  cliProcess.stdout.on('data', data => {
    const output = data.toString()
    console.log('[CLI stdout]', output)

    // 检测编译错误关键词
    if (output.includes('Error:') || output.includes('编译错误') || output.includes('SyntaxError')) {
      const errorKey = 'compile:' + output.trim()
      if (!compileErrors.has(errorKey)) {
        compileErrors.add(errorKey)
        console.log('\n⚠️  检测到编译错误:\n', output)

        // 保存编译错误日志
        const now = new Date()
        const timestamp = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`
        const errorDir = path.join(__dirname, 'error-logs', timestamp)
        fs.ensureDirSync(errorDir)
        fs.writeFileSync(
          path.join(errorDir, 'compile-error.txt'),
          `编译错误 (${new Date().toISOString()})\n\n${output}`
        )
        console.log(`已保存编译错误到: error-logs/${timestamp}/compile-error.txt\n`)
      }
    }
  })

  cliProcess.stderr.on('data', data => {
    const output = data.toString()
    console.log('[CLI stderr]', output)

    // stderr 通常包含错误信息
    const errorKey = 'compile-stderr:' + output.trim()
    if (!compileErrors.has(errorKey)) {
      compileErrors.add(errorKey)
      console.log('\n⚠️  CLI 错误输出:\n', output)

      const now = new Date()
      const timestamp = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`
      const errorDir = path.join(__dirname, 'error-logs', timestamp)
      fs.ensureDirSync(errorDir)
      fs.writeFileSync(path.join(errorDir, 'cli-error.txt'), `CLI 错误 (${new Date().toISOString()})\n\n${output}`)
      console.log(`已保存 CLI 错误到: error-logs/${timestamp}/cli-error.txt\n`)
    }
  })

  await new Promise(resolve => setTimeout(resolve, 10000))

  const miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${autoPort}` })
  console.log('已连接\n')

  console.log('开始监听各类事件...\n')

  const captured = new Set()
  let lastPagePath = null

  // 监听页面变化
  setInterval(async () => {
    try {
      const page = await miniProgram.currentPage()
      const currentPath = page.path

      if (currentPath !== lastPagePath) {
        console.log(`页面变化: ${currentPath}\n`)
        lastPagePath = currentPath
      }
    } catch (e) {}
  }, 500)

  // 保存错误的通用函数
  async function saveError(type, message, extraData = {}) {
    const key = type + ':' + message
    if (captured.has(key)) {
      return
    }

    captured.add(key)
    console.log(`[${type}] ${message}`)

    try {
      const now = new Date()
      const timestamp = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`
      const errorDir = path.join(__dirname, 'error-logs', timestamp)
      await fs.ensureDir(errorDir)

      const page = await miniProgram.currentPage()
      const screenshot = await miniProgram.screenshot()

      await fs.writeFile(path.join(errorDir, 'screenshot.png'), Buffer.from(screenshot, 'base64'))
      await fs.writeJSON(
        path.join(errorDir, 'error.json'),
        {
          type,
          message,
          page: page.path,
          time: new Date().toISOString(),
          ...extraData
        },
        { spaces: 2 }
      )

      console.log(`已保存到: error-logs/${timestamp}/\n`)
    } catch (e) {
      console.error('保存错误日志失败:', e.message)
    }
  }

  // 1. 监听 console 事件（运行时的 console 输出）
  miniProgram.on('console', async msg => {
    if (msg.type === 'error') {
      const message = msg.text || msg.args?.join(' ') || ''
      await saveError(msg.type, message, { args: msg.args })
    }
  })

  // 2. 监听脚本错误（包括语法错误、运行时错误）
  miniProgram.on('scripterror', async msg => {
    const message = msg.message || msg.stack || JSON.stringify(msg)
    await saveError('scripterror', message, {
      stack: msg.stack,
      filename: msg.filename,
      lineno: msg.lineno,
      colno: msg.colno
    })
  })

  // 3. 监听页面错误
  miniProgram.on('pageerror', async msg => {
    const message = msg.message || JSON.stringify(msg)
    await saveError('pageerror', message, { detail: msg })
  })

  // 4. 监听异常事件（捕获运行时异常）
  miniProgram.on('exception', async msg => {
    const message = msg.message || msg.stack || JSON.stringify(msg)
    await saveError('exception', message, {
      stack: msg.stack,
      detail: msg
    })
  })

  // 5. 监听通用错误事件
  miniProgram.on('error', async msg => {
    const message = msg.message || JSON.stringify(msg)
    await saveError('error', message, { detail: msg })
  })

  process.on('SIGINT', () => {
    miniProgram.disconnect()
    cliProcess.kill()
    process.exit(0)
  })
}

main().catch(console.error)
