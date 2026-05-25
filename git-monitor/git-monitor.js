const { exec, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const sharedConfig = require('../config.loader')
const gitConfig = sharedConfig.gitMonitor
const mpConfig = sharedConfig.mpMonitor

// 固定路径配置（内部定义）
const LOG_FILE = path.join(__dirname, '../debug/git-monitor.log')
const MP_MONITOR_SCRIPT = path.join(__dirname, '../mp-monitor/mp-monitor.js')

let mpMonitorProcess = null

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] [${level}] ${message}`
  console.log(logMessage)

  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n')
  } catch (error) {
    console.error('写入日志失败:', error.message)
  }
}

function execCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout: stdout.trim(), stderr: stderr.trim() })
        return
      }
      resolve(stdout.trim())
    })
  })
}

function getCommandErrorMessage(error) {
  return [error.error?.message, error.stderr, error.stdout].filter(Boolean).join('\n')
}

function shouldStartMpMonitor(repo) {
  if (repo.afterPull) {
    return repo.afterPull === 'mp-monitor'
  }

  return repo.type !== 'backend'
}

async function checkLocalChanges(repoPath) {
  try {
    const status = await execCommand('git status --porcelain', repoPath)
    return status.length > 0
  } catch (error) {
    log(`检查本地修改失败: ${getCommandErrorMessage(error)}`, 'ERROR')
    return false
  }
}

async function fetchRemote(repoPath, branch) {
  try {
    await execCommand(`git fetch origin ${branch}`, repoPath)
    return true
  } catch (error) {
    log(`fetch 失败: ${getCommandErrorMessage(error)}`, 'ERROR')
    return false
  }
}

async function checkForUpdates(repoPath, branch) {
  try {
    const localCommit = await execCommand(`git rev-parse ${branch}`, repoPath)
    const remoteCommit = await execCommand(`git rev-parse origin/${branch}`, repoPath)

    if (localCommit !== remoteCommit) {
      const commitCount = await execCommand(`git rev-list --count ${branch}..origin/${branch}`, repoPath)
      const count = parseInt(commitCount)

      if (count > 0) {
        return {
          hasUpdate: true,
          localCommit: localCommit.substring(0, 7),
          remoteCommit: remoteCommit.substring(0, 7),
          commitCount: count
        }
      } else {
        log(`[本地领先远程，无需拉取]`)
        return { hasUpdate: false }
      }
    }

    return { hasUpdate: false }
  } catch (error) {
    log(`检查更新失败: ${getCommandErrorMessage(error)}`, 'ERROR')
    return { hasUpdate: false, error: true }
  }
}

async function pullChanges(repoPath, branch) {
  try {
    const result = await execCommand(`git pull --rebase origin ${branch}`, repoPath)
    return { success: true, output: result }
  } catch (error) {
    return {
      success: false,
      error: getCommandErrorMessage(error)
    }
  }
}

async function stashChanges(repoPath) {
  try {
    await execCommand('git stash save "Auto-stash by git-monitor"', repoPath)
    return true
  } catch (error) {
    log(`暂存失败: ${getCommandErrorMessage(error)}`, 'ERROR')
    return false
  }
}

async function popStash(repoPath) {
  try {
    await execCommand('git stash pop', repoPath)
    return true
  } catch (error) {
    log(`恢复暂存失败: ${getCommandErrorMessage(error)}`, 'WARN')
    return false
  }
}

function stopmpMonitor() {
  if (mpMonitorProcess) {
    log('🛑 停止当前 mp-monitor 进程...')
    try {
      mpMonitorProcess.kill('SIGINT')
      mpMonitorProcess = null
      log('✅ mp-monitor 进程已停止')
      return true
    } catch (error) {
      log(`停止 mp-monitor 失败: ${error.message}`, 'ERROR')
      return false
    }
  }
  return true
}

function startmpMonitor() {
  if (!mpConfig.enabled) {
    log('mp-monitor 功能未启用', 'INFO')
    return false
  }

  if (!fs.existsSync(MP_MONITOR_SCRIPT)) {
    log(`mp-monitor 脚本不存在: ${MP_MONITOR_SCRIPT}`, 'ERROR')
    return false
  }

  stopmpMonitor()

  const mpMonitorDir = path.dirname(MP_MONITOR_SCRIPT)

  mpMonitorProcess = spawn('node', [MP_MONITOR_SCRIPT], {
    cwd: mpMonitorDir,
    stdio: 'inherit'
  })

  mpMonitorProcess.on('exit', (code, signal) => {
    if (signal === 'SIGINT') {
      log('mp-monitor 进程被手动停止')
    } else if (code !== 0) {
      log(`mp-monitor 进程异常退出，退出码: ${code}`, 'ERROR')
    } else {
      log('mp-monitor 进程正常退出')
    }
    mpMonitorProcess = null
  })

  mpMonitorProcess.on('error', error => {
    log(`启动 mp-monitor 失败: ${error.message}`, 'ERROR')
    mpMonitorProcess = null
  })
  return true
}

async function processRepository(repo, retryCount = 0) {
  const { name, path: repoPath, branch } = repo

  try {
    log(`[${name}] 主动探测中...`)
    const hasLocalChanges = await checkLocalChanges(repoPath)
    if (hasLocalChanges) {
      log(`[${name}] ⚠️  检测到本地未提交的修改，跳过拉取`, 'WARN')
      return
    }

    const fetchSuccess = await fetchRemote(repoPath, branch)
    if (!fetchSuccess) {
      if (retryCount < gitConfig.retryTimes) {
        log(`[${name}] 重试 ${retryCount + 1}/${gitConfig.retryTimes}...`, 'WARN')
        await new Promise(resolve => setTimeout(resolve, gitConfig.retryDelay))
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
      // log(`[${name}] ✓ 无更新`)
      return
    }

    log(`[${name}] 🔄 发现 ${updateInfo.commitCount} 个新提交 (${updateInfo.localCommit}..${updateInfo.remoteCommit})`)

    const pullResult = await pullChanges(repoPath, branch)

    if (pullResult.success) {
      log(`[${name}] ✅ 拉取成功`)
      if (pullResult.output) {
        log(`[${name}] ${pullResult.output}`)
      }

      // 验证拉取后的状态
      try {
        const localCommit = await execCommand(`git rev-parse ${branch}`, repoPath)
        const remoteCommit = await execCommand(`git rev-parse origin/${branch}`, repoPath)
        log(`[${name}] 📍 拉取后状态: 本地=${localCommit.substring(0, 7)}, 远程=${remoteCommit.substring(0, 7)}`)

        if (localCommit !== remoteCommit) {
          log(`[${name}] ⚠️  警告：拉取后本地和远程提交仍不一致！`, 'WARN')
        }
      } catch (error) {
        log(`[${name}] ⚠️  无法验证拉取后状态`, 'WARN')
      }

      if (mpConfig.enabled && shouldStartMpMonitor(repo)) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        startmpMonitor()
      } else if (!shouldStartMpMonitor(repo)) {
        log(`[${name}] 后端仓库已拉取完成，跳过 mp-monitor`)
      }
    } else {
      log(`[${name}] ❌ 拉取失败: ${pullResult.error}`, 'ERROR')
    }
  } catch (error) {
    log(`[${name}] ❌ 处理异常: ${error.message}`, 'ERROR')
  }
}

async function monitorLoop() {
  const enabledRepos = gitConfig.repositories.filter(r => r.enabled)

  if (enabledRepos.length === 0) {
    log('没有启用的仓库，退出监控', 'WARN')
    return
  }

  log(`开始监控 ${enabledRepos.length} 个仓库，检测间隔: ${gitConfig.interval / 1000} 秒`)
  log(`监控仓库: ${enabledRepos.map(r => `${r.name}(${r.branch})`).join(', ')}`)

  while (true) {
    for (const repo of enabledRepos) {
      await processRepository(repo)
    }

    await new Promise(resolve => setTimeout(resolve, gitConfig.interval))
  }
}

process.on('SIGINT', () => {
  log('收到退出信号，停止监控...')
  stopmpMonitor()
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('收到终止信号，停止监控...')
  stopmpMonitor()
  process.exit(0)
})

process.on('uncaughtException', error => {
  log(`未捕获的异常: ${error.message}`, 'ERROR')
  log(error.stack, 'ERROR')
})

log('=========================================')
log('Git 监控程序启动')
log('=========================================')
if (mpConfig.enabled) {
  log(`✅ mp-monitor 功能已启用 (拉取成功后自动启动)`)
} else {
  log('⚠️  mp-monitor 功能未启用')
}
log('=========================================')

monitorLoop().catch(error => {
  log(`监控循环异常: ${error.message}`, 'ERROR')
  process.exit(1)
})
