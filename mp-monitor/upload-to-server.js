const { exec } = require('child_process')
const path = require('path')
const fs = require('fs-extra')
const sharedConfig = require('../config')
const debugConfig = sharedConfig.debugUpload

// 生成上传唯一标识
function generateUploadId() {
  const now = new Date()
  const timestamp = now.getTime()
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5)
  return `upload_${dateStr}_${timestamp}`
}

async function cleanRemoteDir() {
  const { host, port, user, remotePath, identityFile } = debugConfig

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
  if (!debugConfig.enabled) {
    console.log('⚠️  服务器上传功能未启用')
    return { success: false, message: '服务器上传功能未启用' }
  }

  return new Promise((resolve, reject) => {
    const { host, port, user, remotePath, identityFile } = debugConfig

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

async function updateUploadStatus(localPath, uploadId, status) {
  const statusFile = path.join(localPath, 'upload-status.json')
  const statusData = {
    uploadId,
    status,
    timestamp: new Date().toISOString(),
    time: Date.now()
  }

  await fs.writeFile(statusFile, JSON.stringify(statusData, null, 2))
  console.log(`📝 更新状态: ${status} (uploadId: ${uploadId})`)
}

async function uploadErrorLogs(errorLogsDir) {
  if (!debugConfig.enabled) {
    return { success: false, message: '服务器上传功能未启用' }
  }

  const uploadId = generateUploadId()

  try {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🚀 开始上传任务`)
    console.log(`📋 上传ID: ${uploadId}`)
    console.log(`${'='.repeat(60)}\n`)

    // 1. 创建状态文件，标记为 uploading
    await updateUploadStatus(errorLogsDir, uploadId, 'uploading')

    // 2. 先清空服务器目录
    const cleanResult = await cleanRemoteDir()
    if (!cleanResult.success) {
      return cleanResult
    }

    // 3. 上传所有文件（包括 upload-status.json）
    console.log('📤 上传中...\n')
    const uploadResult = await uploadToServer(errorLogsDir)
    if (!uploadResult.success) {
      return uploadResult
    }

    // 4. 更新状态为 completed
    await updateUploadStatus(errorLogsDir, uploadId, 'completed')

    // 5. 单独上传更新后的状态文件到服务器
    const { host, port, user, remotePath, identityFile } = debugConfig
    const identityOption = identityFile ? `-i ${identityFile} ` : ''
    const statusFile = path.join(errorLogsDir, 'upload-status.json')
    const sshCommand = `scp ${identityOption}-P ${port} ${statusFile} ${user}@${host}:${remotePath}/`

    await new Promise((resolve, reject) => {
      exec(sshCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ 上传状态文件失败: ${error.message}`)
          reject(error)
          return
        }
        resolve()
      })
    })

    console.log(`\n${'='.repeat(60)}`)
    console.log(`✅ 上传任务完成`)
    console.log(`📋 上传ID: ${uploadId}`)
    console.log(`${'='.repeat(60)}\n`)

    return { success: true, uploadId, message: '上传完成' }
  } catch (error) {
    console.error(`❌ 上传过程异常: ${error.message}`)
    return { success: false, uploadId, error: error.message }
  }
}

module.exports = {
  uploadToServer,
  uploadErrorLogs
}
