const fs = require('fs-extra')
const path = require('path')
const { writeFixTask } = require('../auto-fix/task-writer')
const { createFlowActions } = require('./flow-actions')

function createFlowRunner(options) {
  const {
    mpConfig,
    cliOptions,
    miniProgramRef,
    readAppJson,
    collectTabPagesFromAppJson,
    openSmokeTestPage,
    safeFileName,
    getDateString,
    getTimeString
  } = options

  const flowActions = createFlowActions({
    miniProgramRef,
    openSmokeTestPage,
    safeFileName
  })

  async function writeFlowFixTask(flowResult, failedStep) {
    const autoFixConfig = mpConfig.automation.autoFix || {}
    if (!autoFixConfig.suggestAfterTest) return null
    if (!failedStep || failedStep.status !== 'failed') return null

    const miniProgram = miniProgramRef()
    const page = await miniProgram.currentPage().catch(() => null)
    const pagePath = page?.path || 'unknown'
    const errorDir = path.dirname(flowResult.resultFile)
    const errorJsonPath = path.join(errorDir, `${safeFileName(flowResult.name)}.fix-error.json`)
    const screenshotPath = failedStep.screenshot || null

    const errorData = {
      type: 'flow-smoke-test',
      message: [
        `页面 TDD 流程失败: ${flowResult.name}`,
        `失败步骤: ${failedStep.name}`,
        `失败动作: ${failedStep.action}`,
        `错误信息: ${failedStep.error}`
      ].join('\n'),
      page: pagePath,
      time: new Date().toISOString(),
      errorDir,
      errorJsonPath,
      screenshotPath,
      pageLogFile: null,
      raw: {
        flow: flowResult.name,
        resultFile: flowResult.resultFile,
        failedStep,
        steps: flowResult.steps
      }
    }

    await fs.writeJson(errorJsonPath, errorData, { spaces: 2 })
    return writeFixTask(errorData)
  }

  async function runFlowSmokeTest() {
    const flowConfig = mpConfig.automation.flowSmokeTest
    if (!flowConfig || !flowConfig.enabled) return

    const allFlows = flowConfig.flows || []
    if (cliOptions.listFlows) {
      console.log('\n🧾 可用业务流程:')
      allFlows.forEach(flow => {
        const enabledText = flow.enabled === false ? 'disabled' : 'enabled'
        console.log(`- ${flow.name} [${enabledText}]`)
      })
      console.log('')
      return
    }

    const flows = cliOptions.flow
      ? allFlows.filter(flow => flow.name.includes(cliOptions.flow))
      : allFlows.filter(flow => flow.enabled !== false)

    if (flows.length === 0) return

    const appJson = await readAppJson()
    const tabPages = collectTabPagesFromAppJson(appJson)
    const outputDir = path.join(__dirname, mpConfig.automation.logs.dir, flowConfig.outputDir || 'flow-smoke-test')
    if (flowConfig.clearOutputBeforeRun) {
      await fs.emptyDir(outputDir)
    } else {
      await fs.ensureDir(outputDir)
    }

    const summary = []
    console.log(`\n🧭 开始业务流程巡检，共 ${flows.length} 条流程`)

    for (const flow of flows) {
      const flowResult = {
        name: flow.name,
        status: 'passed',
        startedAt: new Date().toISOString(),
        steps: []
      }

      console.log(`➡️  执行流程: ${flow.name}`)
      const steps = flow.steps || []
      const vars = {}

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        const stepLabel = step.name || `${i + 1}-${step.action}`
        const started = Date.now()
        const stepResult = {
          index: i + 1,
          name: stepLabel,
          action: step.action,
          status: 'passed',
          startedAt: new Date(started).toISOString()
        }

        try {
          const detail = await flowActions.runFlowStep(step, {
            flow,
            flowConfig,
            outputDir,
            tabPages,
            vars
          })
          Object.assign(stepResult, detail)
          if (detail?.skippedFlow) {
            stepResult.status = 'skipped'
            flowResult.status = 'skipped'
            console.log(`   ⏭️  ${stepLabel}: ${detail.reason}`)
          } else {
            console.log(`   ✅ ${stepLabel}`)
          }
        } catch (e) {
          stepResult.status = 'failed'
          stepResult.error = e.message
          flowResult.status = 'failed'
          console.warn(`   ❌ ${stepLabel}: ${e.message}`)

          if (flowConfig.screenshot) {
            try {
              stepResult.screenshot = await flowActions.saveFlowScreenshot(outputDir, flow.name, `${stepLabel}-failed`)
            } catch (screenshotError) {
              stepResult.screenshotError = screenshotError.message
            }
          }
        } finally {
          stepResult.durationMs = Date.now() - started
          stepResult.finishedAt = new Date().toISOString()
          flowResult.steps.push(stepResult)
        }

        if (stepResult.status === 'failed' || stepResult.status === 'skipped') break
        if (flowConfig.stepDelay && step.action !== 'tap' && step.action !== 'wait') {
          await new Promise(resolve => setTimeout(resolve, flowConfig.stepDelay))
        }
      }

      flowResult.finishedAt = new Date().toISOString()
      flowResult.durationMs = new Date(flowResult.finishedAt).getTime() - new Date(flowResult.startedAt).getTime()
      const resultPath = path.join(outputDir, `${safeFileName(flow.name)}.json`)
      flowResult.resultFile = resultPath
      await fs.writeFile(resultPath, JSON.stringify(flowResult, null, 2), 'utf-8')

      const failedStep = flowResult.steps.find(step => step.status === 'failed')
      if (failedStep) {
        try {
          const fixTaskResult = await writeFlowFixTask(flowResult, failedStep)
          if (fixTaskResult) {
            flowResult.fixTask = fixTaskResult.latestRequestPath
            await fs.writeFile(resultPath, JSON.stringify(flowResult, null, 2), 'utf-8')
            console.log(`   🧩 已生成 Codex 修复任务: ${fixTaskResult.latestRequestPath}`)
          }
        } catch (taskError) {
          console.warn(`   ⚠️ 生成流程修复任务失败: ${taskError.message}`)
        }
      }

      summary.push(flowResult)
    }

    const summaryPath = path.join(outputDir, `summary-${getDateString()}-${getTimeString()}.json`)
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8')
    const failedCount = summary.filter(flow => flow.status === 'failed').length
    const skippedCount = summary.filter(flow => flow.status === 'skipped').length
    console.log(`✅ 业务流程巡检完成: ${summaryPath}，失败 ${failedCount}/${summary.length}，跳过 ${skippedCount}/${summary.length}\n`)
  }

  return {
    runFlowSmokeTest
  }
}

module.exports = {
  createFlowRunner
}
