const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const config = require('./config')

class AIFixer {
  constructor() {
    this.apiKey = config.aiConfig.apiKey
    this.baseURL = config.aiConfig.baseURL
    this.model = config.aiConfig.model
  }

  async analyzeAndFix(errorInfo) {
    console.log('🤖 AI分析错误中...')

    const codeContext = await this.getCodeContext(errorInfo)

    const prompt = this.buildPrompt(errorInfo, codeContext)

    try {
      const response = await this.callAI(prompt, errorInfo.screenshot)

      const fixPlan = this.parseFix(response)
      console.log('💡 AI修复方案:', fixPlan)

      return fixPlan
    } catch (error) {
      console.error('❌ AI调用失败:', error.message)
      return null
    }
  }

  async getCodeContext(errorInfo) {
    if (errorInfo.type === 'compile' && errorInfo.file) {
      const filePath = path.join(config.projectPath, errorInfo.file)

      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.split('\n')

        const startLine = Math.max(0, errorInfo.line - 10)
        const endLine = Math.min(lines.length, errorInfo.line + 10)

        return {
          file: errorInfo.file,
          fullContent: content,
          contextLines: lines.slice(startLine, endLine).join('\n'),
          errorLine: errorInfo.line
        }
      }
    }

    return null
  }

  buildPrompt(errorInfo, codeContext) {
    let prompt = `你是一个微信小程序(Donut框架)代码修复专家。

错误类型: ${errorInfo.type}
错误信息: ${errorInfo.message || errorInfo.errors?.join('\n')}
`

    if (codeContext) {
      prompt += `
错误文件: ${codeContext.file}
错误行号: ${codeContext.errorLine}

相关代码上下文:
\`\`\`javascript
${codeContext.contextLines}
\`\`\`
`
    }

    prompt += `
请提供修复方案，要求:
1. 返回JSON格式: { "file": "文件路径", "action": "replace", "oldCode": "要替换的代码", "newCode": "修复后的代码", "explanation": "修复说明" }
2. 确保符合Donut框架和微信小程序规范
3. 只修复必要的部分，不要改动其他代码
`

    return prompt
  }

  async callAI(prompt, screenshot) {
    const messages = [
      {
        role: 'user',
        content: []
      }
    ]

    messages[0].content.push({
      type: 'text',
      text: prompt
    })

    if (screenshot) {
      messages[0].content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${screenshot}`
        }
      })
    }

    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: this.model,
        messages: messages,
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    return response.data.choices[0].message.content
  }

  parseFix(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.warn('⚠️ AI返回格式解析失败，使用原始文本')
    }

    return {
      action: 'manual',
      suggestion: aiResponse
    }
  }

  async applyFix(fixPlan) {
    if (fixPlan.action !== 'replace' || !fixPlan.file) {
      console.log('📝 AI建议:', fixPlan.suggestion || fixPlan.explanation)
      return false
    }

    console.log(`🔧 应用修复到文件: ${fixPlan.file}`)

    const filePath = path.join(config.projectPath, fixPlan.file)

    if (!(await fs.pathExists(filePath))) {
      console.error('❌ 文件不存在:', filePath)
      return false
    }

    const backupPath = `${filePath}.backup`
    await fs.copy(filePath, backupPath)
    console.log('💾 已备份原文件')

    try {
      let content = await fs.readFile(filePath, 'utf-8')

      if (content.includes(fixPlan.oldCode)) {
        content = content.replace(fixPlan.oldCode, fixPlan.newCode)
        await fs.writeFile(filePath, content, 'utf-8')
        console.log('✅ 修复已应用')
        return true
      } else {
        console.warn('⚠️ 未找到要替换的代码，可能AI理解有误')
        await fs.remove(backupPath)
        return false
      }
    } catch (error) {
      console.error('❌ 应用修复失败:', error.message)
      await fs.copy(backupPath, filePath)
      console.log('↩️ 已恢复原文件')
      return false
    }
  }
}

module.exports = AIFixer
