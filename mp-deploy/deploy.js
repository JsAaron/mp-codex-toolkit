const { spawn } = require('child_process')
const fs = require('fs-extra')
const path = require('path')

const sharedConfig = require('../config.loader')
const config = sharedConfig.mpDeploy

// 执行 CLI 命令
function execCli(args) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 执行命令: ${config.cliPath} ${args.join(' ')}\n`)

    const process = spawn(config.cliPath, args)

    let output = ''
    let errorOutput = ''

    process.stdout.on('data', data => {
      const text = data.toString()
      output += text
      console.log(text.trim())
    })

    process.stderr.on('data', data => {
      const text = data.toString()
      errorOutput += text
      console.error(text.trim())
    })

    process.on('close', code => {
      if (code === 0) {
        resolve(output)
      } else {
        reject(new Error(`命令执行失败，退出码: ${code}\n${errorOutput}`))
      }
    })

    process.on('error', err => {
      reject(err)
    })
  })
}

// 1. 编译小程序
async function build() {
  console.log('📦 开始编译小程序...\n')

  try {
    await execCli(['build-npm', '--project', config.projectPath])

    console.log('\n✅ 编译完成\n')
    return true
  } catch (e) {
    console.error('\n❌ 编译失败:', e.message, '\n')
    return false
  }
}

// 2. 上传小程序
async function upload(version, desc) {
  console.log('📤 开始上传小程序...\n')

  const uploadVersion = version || config.version
  const uploadDesc = desc || config.desc

  try {
    await execCli(['upload', '--project', config.projectPath, '-v', uploadVersion, '-d', uploadDesc])

    console.log('\n✅ 上传完成\n')
    console.log(`📋 版本号: ${uploadVersion}`)
    console.log(`📝 描述: ${uploadDesc}\n`)
    console.log('💡 提示: 如需更新版本号，请修改 config.js 中的 deploy.version\n')

    return true
  } catch (e) {
    console.error('\n❌ 上传失败:', e.message, '\n')
    return false
  }
}

// 3. 预览小程序
async function preview(qrFormat = 'terminal', qrOutput) {
  console.log('👀 生成预览二维码...\n')

  // 如果没有指定输出路径，默认保存到当前目录
  const defaultQrPath = path.join(__dirname, `preview-qr-${Date.now()}.png`)
  const finalQrOutput = qrOutput || (qrFormat === 'image' ? defaultQrPath : null)

  const args = ['preview', '--project', config.projectPath, '--qr-format', qrFormat]

  if (finalQrOutput) {
    args.push('--qr-output', finalQrOutput)
  }

  try {
    await execCli(args)

    console.log('\n✅ 预览二维码已生成\n')
    if (finalQrOutput) {
      console.log(`📁 二维码保存路径: ${finalQrOutput}\n`)
    }
    return true
  } catch (e) {
    console.error('\n❌ 生成预览失败:', e.message, '\n')
    return false
  }
}

// 3.1 生成预览二维码（同时显示在终端和保存为图片）
async function previewBoth() {
  console.log('👀 生成预览二维码（终端+图片）...\n')

  const qrPath = path.join(__dirname, `preview-qr-${Date.now()}.png`)

  try {
    // 先生成图片
    await execCli(['preview', '--project', config.projectPath, '--qr-format', 'image', '--qr-output', qrPath])

    console.log(`\n✅ 二维码图片已保存: ${qrPath}`)

    // 再在终端显示
    await execCli(['preview', '--project', config.projectPath, '--qr-format', 'terminal'])

    console.log('\n✅ 终端二维码已显示\n')
    return true
  } catch (e) {
    console.error('\n❌ 生成预览失败:', e.message, '\n')
    return false
  }
}

// 4. 自动登录
async function login() {
  console.log('🔐 开始登录...\n')

  try {
    await execCli(['login', '--login-qr-output', path.join(__dirname, 'login-qr.png')])

    console.log('\n✅ 登录成功\n')
    return true
  } catch (e) {
    console.error('\n❌ 登录失败:', e.message, '\n')
    return false
  }
}

// 5. 完整流程：编译 + 上传
async function deploy(version, desc) {
  console.log('🎯 开始完整部署流程...\n')
  console.log('='.repeat(60))

  // 步骤 1: 编译
  const buildSuccess = await build()
  if (!buildSuccess) {
    console.error('❌ 部署失败：编译阶段出错\n')
    return false
  }

  console.log('='.repeat(60))

  // 步骤 2: 上传
  const uploadSuccess = await upload(version, desc)
  if (!uploadSuccess) {
    console.error('❌ 部署失败：上传阶段出错\n')
    return false
  }

  console.log('='.repeat(60))
  console.log('🎉 部署完成！\n')
  return true
}

// 6. 显示配置
function showConfig() {
  console.log('📋 当前配置:\n')
  console.log(`项目路径: ${config.projectPath}`)
  console.log(`CLI 路径: ${config.cliPath}`)
  console.log(`当前版本: ${config.version}`)
  console.log(`默认描述: ${config.desc}\n`)
  console.log('💡 提示: 如需修改配置，请编辑 config.js 文件\n')
}

// 命令行参数解析
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command) {
    console.log(`
📱 微信小程序自动部署工具

使用方法:
  node deploy.js <command> [options]

命令列表:
  build                     编译小程序
  upload [version] [desc]   上传小程序
  preview [format] [output] 生成预览二维码
  preview:both              同时生成终端二维码和图片文件
  deploy [version] [desc]   完整部署（编译+上传）
  login                     登录微信开发者工具
  config                    显示当前配置

示例:
  node deploy.js build
  node deploy.js upload 1.0.1 "修复bug"
  node deploy.js preview terminal
  node deploy.js preview image ./qr.png
  node deploy.js preview:both
  node deploy.js deploy 1.0.2 "新增功能"
`)
    return
  }

  try {
    switch (command) {
      case 'build':
        await build()
        break

      case 'upload':
        await upload(args[1], args[2])
        break

      case 'preview':
        await preview(args[1] || 'terminal', args[2])
        break

      case 'preview:both':
        await previewBoth()
        break

      case 'deploy':
        await deploy(args[1], args[2])
        break

      case 'login':
        await login()
        break

      case 'config':
        showConfig()
        break

      default:
        console.error(`❌ 未知命令: ${command}\n`)
        console.log('运行 "node deploy.js" 查看帮助\n')
    }
  } catch (e) {
    console.error('❌ 执行失败:', e.message, '\n')
    process.exit(1)
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main()
}

module.exports = {
  build,
  upload,
  preview,
  previewBoth,
  deploy,
  login,
  showConfig
}
