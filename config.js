module.exports = {
  projectPath: '/Users/chenwen/work/长沙新学堂项目/项目-高分派/微信/gaofenwx',

  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',

  aiConfig: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  },

  maxRetries: 3,

  waitTime: 3000,

  automatorPort: 59092
}
