const path = require('path')
const fs = require('fs-extra')
const sharedConfig = require('../config')

const taskDir = path.resolve(__dirname, '..', 'mp-monitor', sharedConfig.mpMonitor.automation.logs.dir, 'fix-tasks')
const latestTaskPath = path.join(taskDir, 'latest.json')
const latestRequestPath = path.join(taskDir, 'latest-fix-request.md')

async function main() {
  if (!(await fs.pathExists(latestTaskPath))) {
    console.log('暂无 Codex 修复任务')
    console.log(`任务目录: ${taskDir}`)
    return
  }

  const task = await fs.readJson(latestTaskPath)

  console.log('最新 Codex 修复任务')
  console.log('='.repeat(60))
  console.log(`任务 ID: ${task.id}`)
  console.log(`状态: ${task.status}`)
  console.log(`目标项目: ${task.projectPath}`)
  console.log(`错误类型: ${task.error.type}`)
  console.log(`页面: ${task.error.page}`)
  console.log(`错误信息: ${task.error.message}`)
  console.log('')
  console.log(`任务 JSON: ${latestTaskPath}`)
  console.log(`修复请求: ${latestRequestPath}`)
}

if (require.main === module) {
  main().catch(error => {
    console.error(`读取最新任务失败: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  taskDir,
  latestTaskPath,
  latestRequestPath
}
