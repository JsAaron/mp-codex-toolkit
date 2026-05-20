const { exec } = require('child_process')
const path = require('path')
const config = require('./config')

async function cleanRemoteDir() {
  const { host, port, user, remotePath, identityFile } = config.server

  return new Promise((resolve, reject) => {
    const identityOption = identityFile ? `-i ${identityFile} ` : ''
    const sshCommand = `ssh ${identityOption}-p ${port} ${user}@${host} "rm -rf ${remotePath}/* && echo 'Cleaned'"`

    console.log('🗑️  清空服务器目录...')
    console.log(`🔧 执行命令: ${sshCommand}\n`)

    exec(sshCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ 清空失败: ${error.message}`)
        if (stderr) {
          console.error(`错误详情: ${stderr}`)
        }
        resolve({ success: false, error: error.message, stderr })
        return
      }

      console.log('✅ 服务器目录已清空\n')
      resolve({ success: true })
    })
  })
}

async function uploadToServer(localPath) {
  if (!config.server.enabled) {
    console.log('⚠️  服务器上传功能未启用')
    return { success: false, message: '服务器上传功能未启用' }
  }

  return new Promise((resolve, reject) => {
    const { host, port, user, remotePath, identityFile } = config.server

    console.log('📤 开始上传错误日志到服务器...')
    console.log(`📍 服务器: ${user}@${host}:${port}`)
    console.log(`📁 远程路径: ${remotePath}`)
    console.log(`📂 本地路径: ${localPath}`)

    const remoteDir = `${user}@${host}:${remotePath}`
    const identityOption = identityFile ? `-i ${identityFile} ` : ''
    const sshCommand = `scp ${identityOption}-P ${port} -r ${localPath}/* ${remoteDir}/`

    console.log(`🔧 执行命令: ${sshCommand}\n`)

    exec(sshCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ 上传失败: ${error.message}`)
        if (stderr) {
          console.error(`错误详情: ${stderr}`)
        }
        resolve({ success: false, error: error.message, stderr })
        return
      }

      console.log('✅ 上传成功!')
      if (stdout) {
        console.log(`输出: ${stdout}`)
      }

      resolve({ success: true, message: '上传成功' })
    })
  })
}

async function uploadErrorLogs(errorLogsDir) {
  if (!config.server.enabled) {
    return { success: false, message: '服务器上传功能未启用' }
  }

  try {
    // 先清空服务器目录
    const cleanResult = await cleanRemoteDir()
    if (!cleanResult.success) {
      return cleanResult
    }

    // 再上传新日志
    const result = await uploadToServer(errorLogsDir)
    return result
  } catch (error) {
    console.error(`❌ 上传过程异常: ${error.message}`)
    return { success: false, error: error.message }
  }
}

module.exports = {
  uploadToServer,
  uploadErrorLogs
}
