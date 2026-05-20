const { exec, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const configPath = path.join(__dirname, 'git-monitor-config.json')
let config = {
  interval: 10000,
  repositories: [
    {
      name: 'gaofenwx',
      path: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',
      branch: 'chenwen-codex',
      enabled: true
    }
  ],
  logFile: path.join(__dirname, 'git-monitor.log'),
  retryTimes: 3,
  retryDelay: 5000,
  autoFix: {
    enabled: true,
    scriptPath: path.join(__dirname, '../auto-fix/auto-fix.js'),
    runOnPullSuccess: true
  }
}

let autoFixProcess = null

if (fs.existsSync(configPath)) {
  config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] [${level}] ${message}`
  console.log(logMessage)

  try {
    fs.appendFileSync(config.logFile, logMessage + '\n')
  } catch (error) {
    console.error('写入日志失败:', error.message)
  }
}

function execCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr })
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function checkLocalChanges(repoPath) {
  try {
    const status = await execCommand('git status --porcelain', repoPath)
    return status.length > 0
  } catch (error) {
    log(`检查本地修改失败: ${error.error?.message || error.stderr}`, 'ERROR')
    return false
  }
}

async function fetchRemote(repoPath, branch) {
  try {
    await execCommand(`git fetch origin ${branch}`, repoPath)
    return true
  } catch (error) {
    log(`fetch 失败: ${error.error?.message || error.stderr}`, 'ERROR')
    return false
  }
}

async function checkForUpdates(repoPath, branch) {
  try {
    const localCommit = await execCommand(`git rev-parse ${branch}`, repoPath)
    const remoteCommit = await execCommand(`git rev-parse origin/${branch}`, repoPath)

    if (localCommit !== remoteCommit) {
      const commitCount = await execCommand(`git rev-list --count ${branch}..origin/${branch}`, repoPath)
      return {
        hasUpdate: true,
        localCommit: localCommit.substring(0, 7),
        remoteCommit: remoteCommit.substring(0, 7),
        commitCount: parseInt(commitCount)
      }
    }

    return { hasUpdate: false }
  } catch (error) {
    log(`检查更新失败: ${error.error?.message || error.stderr}`, 'ERROR')
    return { hasUpdate: false, error: true }
  }
}

async function pullChanges(repoPath, branch) {
  try {
    const result = await execCommand(`git pull origin ${branch}`, repoPath)
    return { success: true, output: result }
  } catch (error) {
    return {
      success: false,
      error: error.error?.message || error.stderr
    }
  }
}

async function stashChanges(repoPath) {
  try {
    await execCommand('git stash save "Auto-stash by git-monitor"', repoPath)
    return true
  } catch (error) {
    log(`暂存失败: ${error.error?.message || error.stderr}`, 'ERROR')
    return false
  }
}

async function popStash(repoPath) {
  try {
    await execCommand('git stash pop', repoPath)
    return true
  } catch (error) {
    log(`恢复暂存失败: ${error.error?.message || error.stderr}`, 'WARN')
    return false
  }
}

function stopAutoFix() {
  if (autoFixProcess) {
    log('🛑 停止当前 auto-fix 进程...')
    try {
      autoFixProcess.kill('SIGINT')
      autoFixProcess = null
      log('✅ auto-fix 进程已停止')
      return true
    } catch (error) {
      log(`停止 auto-fix 失败: ${error.message}`, 'ERROR')
      return false
    }
  }
  return true
}

function startAutoFix() {
  if (!config.autoFix.enabled) {
    log('auto-fix 功能未启用', 'INFO')
    return false
  }

  if (!fs.existsSync(config.autoFix.scriptPath)) {
    log(`auto-fix 脚本不存在: ${config.autoFix.scriptPath}`, 'ERROR')
    return false
  }

  stopAutoFix()

  log('🚀 启动 auto-fix 进程...')
  log(`📝 脚本路径: ${config.autoFix.scriptPath}`)

  const autoFixDir = path.dirname(config.autoFix.scriptPath)

  autoFixProcess = spawn('node', [config.autoFix.scriptPath], {
    cwd: autoFixDir,
    stdio: 'inherit'
  })

  autoFixProcess.on('exit', (code, signal) => {
    if (signal === 'SIGINT') {
      log('auto-fix 进程被手动停止')
    } else if (code !== 0) {
      log(`auto-fix 进程异常退出，退出码: ${code}`, 'ERROR')
    } else {
      log('auto-fix 进程正常退出')
    }
    autoFixProcess = null
  })

  autoFixProcess.on('error', error => {
    log(`启动 auto-fix 失败: ${error.message}`, 'ERROR')
    autoFixProcess = null
  })

  log('✅ auto-fix 进程已启动')
  return true
}

async function processRepository(repo, retryCount = 0) {
  const { name, path: repoPath, branch } = repo

  try {
    log(`[${name}] 开始检测...`)
    const hasLocalChanges = await checkLocalChanges(repoPath)
    if (hasLocalChanges) {
      log(`[${name}] ⚠️  检测到本地未提交的修改，跳过拉取`, 'WARN')
      return
    }

    const fetchSuccess = await fetchRemote(repoPath, branch)
    if (!fetchSuccess) {
      if (retryCount < config.retryTimes) {
        log(`[${name}] 重试 ${retryCount + 1}/${config.retryTimes}...`, 'WARN')
        await new Promise(resolve => setTimeout(resolve, config.retryDelay))
        return await processRepository(repo, retryCount + 1)
      }
      log(`[${name}] ❌ fetch 失败，已达最大重试次数`, 'ERROR')
      return
    }

    const updateInfo = await checkForUpdates(repoPath, branch)

    if (updateInfo.error) {
      log(`[${name}] ❌ 检查更新时出错`, 'ERROR')
      return
    }

    if (!updateInfo.hasUpdate) {
      log(`[${name}] ✓ 无更新`)
      return
    }

    log(`[${name}] 🔄 发现 ${updateInfo.commitCount} 个新提交 (${updateInfo.localCommit}..${updateInfo.remoteCommit})`)

    const pullResult = await pullChanges(repoPath, branch)

    if (pullResult.success) {
      log(`[${name}] ✅ 拉取成功`)
      if (pullResult.output) {
        log(`[${name}] ${pullResult.output}`)
      }

      if (config.autoFix.runOnPullSuccess) {
        log(`[${name}] 🔄 代码已更新，准备启动 auto-fix...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        startAutoFix()
      }
    } else {
      log(`[${name}] ❌ 拉取失败: ${pullResult.error}`, 'ERROR')
    }
  } catch (error) {
    log(`[${name}] ❌ 处理异常: ${error.message}`, 'ERROR')
  }
}

async function monitorLoop() {
  const enabledRepos = config.repositories.filter(r => r.enabled)

  if (enabledRepos.length === 0) {
    log('没有启用的仓库，退出监控', 'WARN')
    return
  }

  log(`开始监控 ${enabledRepos.length} 个仓库，检测间隔: ${config.interval / 1000} 秒`)
  log(`监控仓库: ${enabledRepos.map(r => `${r.name}(${r.branch})`).join(', ')}`)

  while (true) {
    for (const repo of enabledRepos) {
      await processRepository(repo)
    }

    await new Promise(resolve => setTimeout(resolve, config.interval))
  }
}

process.on('SIGINT', () => {
  log('收到退出信号，停止监控...')
  stopAutoFix()
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('收到终止信号，停止监控...')
  stopAutoFix()
  process.exit(0)
})

process.on('uncaughtException', error => {
  log(`未捕获的异常: ${error.message}`, 'ERROR')
  log(error.stack, 'ERROR')
})

log('=========================================')
log('Git 监控程序启动')
log('=========================================')
if (config.autoFix.enabled) {
  log(`✅ auto-fix 功能已启用 (拉取成功后${config.autoFix.runOnPullSuccess ? '自动' : '不'}启动)`)
} else {
  log('⚠️  auto-fix 功能未启用')
}
log('=========================================')

monitorLoop().catch(error => {
  log(`监控循环异常: ${error.message}`, 'ERROR')
  process.exit(1)
})
