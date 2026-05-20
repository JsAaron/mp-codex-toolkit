/**
 * 测试脚本 - 验证能否捕获console错误
 */

const { spawn } = require('child_process')
const automator = require('miniprogram-automator')
const config = require('./config')

async function test() {
  console.log('启动测试...\n')

  // 启动CLI
  const autoPort = 9420
  const cliProcess = spawn(config.cliPath, ['auto', '--project', config.projectPath, '--auto-port', String(autoPort)])

  await new Promise(resolve => setTimeout(resolve, 10000))

  // 连接
  const miniProgram = await automator.connect({
    wsEndpoint: `ws://localhost:${autoPort}`
  })

  console.log('✅ 已连接\n')

  // 测试1: 获取当前页面
  const page = await miniProgram.currentPage()
  console.log('当前页面:', page.path)

  // 测试2: 注入简单的测试代码
  console.log('\n测试注入...')
  await miniProgram.evaluate(() => {
    console.log('✅ evaluate 可以执行')
    window.__test = 'hello'
  })

  // 测试3: 读取注入的值
  const result = await miniProgram.evaluate(() => {
    return window.__test
  })
  console.log('读取结果:', result)

  // 测试4: 注入错误收集器
  console.log('\n注入错误收集器...')
  await miniProgram.evaluate(() => {
    window.__errors = []
    const originalError = console.error
    console.error = function (...args) {
      originalError.apply(console, args)
      window.__errors.push({
        message: args.join(' '),
        time: Date.now()
      })
    }
    console.log('✅ 错误收集器已注入')
  })

  // 测试5: 手动触发一个错误
  console.log('\n手动触发错误...')
  await miniProgram.evaluate(() => {
    console.error('这是一个测试错误')
  })

  // 等待1秒
  await new Promise(resolve => setTimeout(resolve, 1000))

  // 测试6: 读取收集的错误
  console.log('\n读取收集的错误...')
  const errors = await miniProgram.evaluate(() => {
    return window.__errors
  })

  console.log('收集到的错误:', JSON.stringify(errors, null, 2))

  if (errors && errors.length > 0) {
    console.log('\n✅ 成功！可以捕获错误')
  } else {
    console.log('\n❌ 失败！无法捕获错误')
  }

  // 清理
  await miniProgram.disconnect()
  cliProcess.kill()
}

test().catch(console.error)
