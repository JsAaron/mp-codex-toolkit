const { exec } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')

class ErrorCapture {
  async captureCompileError() {
    console.log('📦 检查编译错误...')

    return new Promise(resolve => {
      const cmd = `"${config.cliPath}" --compile "${config.projectPath}"`

      exec(cmd, (error, stdout, stderr) => {
        const output = stdout + stderr

        if (output.includes('Error') || output.includes('编译失败')) {
          const errorInfo = this.parseCompileError(output)
          console.log('❌ 发现编译错误:', errorInfo.message)
          resolve(errorInfo)
        } else {
          console.log('✅ 编译通过')
          resolve(null)
        }
      })
    })
  }

  async captureRuntimeError() {
    console.log('🚀 启动小程序检查运行时错误...')

    try {
      const miniProgram = await automator.launch({
        projectPath: config.projectPath,
        cliPath: config.cliPath,
        port: config.automatorPort
      })

      const errors = []
      const logs = []

      miniProgram.on('console', msg => {
        logs.push(msg)
        if (msg.type === 'error') {
          console.log('❌ 捕获到运行时错误:', msg.text)
          errors.push(msg.text)
        }
      })

      await new Promise(resolve => setTimeout(resolve, config.waitTime))

      const page = await miniProgram.currentPage()
      const screenshot = await page.screenshot()

      await miniProgram.close()

      if (errors.length > 0) {
        return {
          type: 'runtime',
          errors: errors,
          screenshot: screenshot.toString('base64'),
          allLogs: logs
        }
      }

      console.log('✅ 运行正常，无错误')
      return null
    } catch (error) {
      console.error('❌ 启动小程序失败:', error.message)
      return {
        type: 'launch',
        message: error.message
      }
    }
  }

  parseCompileError(output) {
    const lines = output.split('\n')
    const errorLines = lines.filter(line => line.includes('Error') || line.includes('错误'))

    const fileMatch = output.match(/([^\s]+\.(js|wxml|wxss|json)):(\d+):(\d+)/)

    return {
      type: 'compile',
      message: errorLines.join('\n'),
      file: fileMatch ? fileMatch[1] : 'unknown',
      line: fileMatch ? fileMatch[3] : 0,
      column: fileMatch ? fileMatch[4] : 0,
      fullOutput: output
    }
  }
}

module.exports = ErrorCapture
