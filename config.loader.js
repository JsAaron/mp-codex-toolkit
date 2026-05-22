/**
 * 配置加载器
 *
 * 加载逻辑：
 * 1. 加载 config.js（默认配置，提交到 Git）
 * 2. 尝试加载 config.local.js（私有配置，不提交）
 * 3. 将 config.local.js 的配置深度合并到 config.js
 *
 * 使用方式：
 * const config = require('./config.loader')
 */

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target }

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // 递归合并对象
        result[key] = deepMerge(result[key] || {}, source[key])
      } else {
        // 直接覆盖（包括数组、基本类型）
        result[key] = source[key]
      }
    }
  }

  return result
}

// 加载默认配置
const defaultConfig = require('./config')

// 尝试加载本地配置
let localConfig = {}
try {
  localConfig = require('./config.local')
  console.log('✅ 已加载本地配置 config.local.js')
} catch (e) {
  console.log('ℹ️  未找到 config.local.js，使用默认配置')
}

// 合并配置
const finalConfig = deepMerge(defaultConfig, localConfig)

module.exports = finalConfig
