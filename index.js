const ErrorCapture = require('./error-capture')
const AIFixer = require('./ai-fixer')
const config = require('./config')

class AutoFixAgent {
  constructor() {
    this.errorCapture = new ErrorCapture()
    this.aiFixer = new AIFixer()
  }

  async run() {
    console.log('\n🚀 启动自动修复Agent...\n')

    for (let i = 0; i < config.maxRetries; i++) {
      console.log(`\n========== 第 ${i + 1}/${config.maxRetries} 次尝试 ==========\n`)

      const compileError = await this.errorCapture.captureCompileError()

      if (compileError) {
        const fixed = await this.fixError(compileError)
        if (fixed) {
          continue
        } else {
          console.log('❌ 修复失败，停止尝试')
          break
        }
      }

      const runtimeError = await this.errorCapture.captureRuntimeError()

      if (runtimeError) {
        const fixed = await this.fixError(runtimeError)
        if (fixed) {
          continue
        } else {
          console.log('❌ 修复失败，停止尝试')
          break
        }
      }

      console.log('\n🎉 成功！项目无错误\n')
      break
    }
  }

  async fixError(errorInfo) {
    const fixPlan = await this.aiFixer.analyzeAndFix(errorInfo)

    if (!fixPlan) {
      return false
    }

    const applied = await this.aiFixer.applyFix(fixPlan)

    return applied
  }
}

if (require.main === module) {
  const agent = new AutoFixAgent()
  agent.run().catch(error => {
    console.error('💥 Agent运行失败:', error)
    process.exit(1)
  })
}

module.exports = AutoFixAgent
