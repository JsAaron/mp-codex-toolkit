const path = require('path')
const fs = require('fs-extra')
const sharedConfig = require('../config')

const mpConfig = sharedConfig.mpMonitor
const gitConfig = sharedConfig.gitMonitor

function getEnabledRepository() {
  return gitConfig.repositories.find(repo => repo.enabled) || gitConfig.repositories[0] || null
}

function safeFileName(value) {
  return String(value || 'unknown')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

function toAbsoluteDebugPath(relativePath) {
  if (!relativePath) return null
  if (path.isAbsolute(relativePath)) return relativePath
  return path.resolve(__dirname, '..', 'mp-monitor', relativePath)
}

function buildMarkdown(task) {
  const stackLines = task.stackLocations && task.stackLocations.length > 0
    ? task.stackLocations
      .slice(0, 10)
      .map((loc, index) => `${index + 1}. ${loc.fullPath || loc.file}:${loc.line}:${loc.column} (${loc.function})`)
      .join('\n')
    : '无可解析堆栈位置'

  return [
    '# Codex 修复任务',
    '',
    '请根据下面的小程序运行错误，修复目标项目中的问题。优先读取错误日志、页面日志和相关源码，修改后运行可用的语法检查或测试。',
    '',
    '## 目标项目',
    '',
    `- 项目路径: ${task.projectPath}`,
    `- 仓库名称: ${task.repositoryName || 'unknown'}`,
    `- 分支: ${task.branch || 'unknown'}`,
    '',
    '## 错误信息',
    '',
    `- 任务 ID: ${task.id}`,
    `- 状态: ${task.status}`,
    `- 错误类型: ${task.error.type}`,
    `- 页面: ${task.error.page}`,
    `- 时间: ${task.createdAt}`,
    '',
    '```text',
    task.error.message,
    '```',
    '',
    '## 文件位置',
    '',
    `- 错误 JSON: ${task.artifacts.errorJson}`,
    `- 页面日志: ${task.artifacts.pageLog || '无'}`,
    `- 截图: ${task.artifacts.screenshot || '无'}`,
    '',
    '## 堆栈位置',
    '',
    stackLines,
    '',
    '## 期望动作',
    '',
    '1. 读取错误 JSON 和页面日志。',
    '2. 在目标项目中定位根因。',
    '3. 只修改与该错误相关的源码。',
    '4. 修改后运行能在本机执行的检查命令。',
    '5. 汇总修改内容和验证结果。',
    ''
  ].join('\n')
}

async function writeFixTask(errorInfo) {
  const repository = getEnabledRepository()
  const projectPath = mpConfig.startup.path || repository?.path || null
  const baseDebugDir = path.resolve(__dirname, '..', 'mp-monitor', mpConfig.automation.logs.dir)
  const taskDir = path.join(baseDebugDir, 'fix-tasks')
  const createdAt = new Date().toISOString()
  const taskId = `${createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}_${safeFileName(errorInfo.type)}`

  const task = {
    id: taskId,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
    projectPath,
    repositoryName: repository?.name || null,
    branch: repository?.branch || null,
    error: {
      type: errorInfo.type,
      message: errorInfo.message,
      page: errorInfo.page,
      time: errorInfo.time
    },
    stackLocations: errorInfo.stackLocations || null,
    artifacts: {
      errorDir: errorInfo.errorDir,
      errorJson: errorInfo.errorJsonPath,
      pageLog: toAbsoluteDebugPath(errorInfo.pageLogFile),
      screenshot: errorInfo.screenshotPath
    },
    raw: errorInfo.raw || {}
  }

  await fs.ensureDir(taskDir)

  const taskPath = path.join(taskDir, `${taskId}.json`)
  const latestTaskPath = path.join(taskDir, 'latest.json')
  const requestPath = path.join(taskDir, `${taskId}.md`)
  const latestRequestPath = path.join(taskDir, 'latest-fix-request.md')

  const markdown = buildMarkdown(task)

  await fs.writeJson(taskPath, task, { spaces: 2 })
  await fs.writeJson(latestTaskPath, task, { spaces: 2 })
  await fs.writeFile(requestPath, markdown, 'utf-8')
  await fs.writeFile(latestRequestPath, markdown, 'utf-8')

  return {
    task,
    taskPath,
    latestTaskPath,
    requestPath,
    latestRequestPath
  }
}

module.exports = {
  writeFixTask
}
