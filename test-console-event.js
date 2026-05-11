const automator = require('miniprogram-automator');

async function test() {
  console.log('测试console事件监听...\n');
  
  try {
    const miniProgram = await automator.connect({
      wsEndpoint: 'ws://localhost:9420'
    });
    
    console.log('✅ 已连接\n');
    console.log('监听console事件...\n');
    
    let messageCount = 0;
    
    miniProgram.on('console', (msg) => {
      messageCount++;
      console.log(`收到console消息 #${messageCount}:`);
      console.log(`  type: ${msg.type}`);
      console.log(`  text: ${msg.text}`);
      console.log(`  args: ${JSON.stringify(msg.args)}\n`);
    });
    
    console.log('等待30秒接收消息...');
    console.log('请在小程序中触发一些console.log、console.error等\n');
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log(`\n总共收到 ${messageCount} 条console消息`);
    
    await miniProgram.disconnect();
  } catch (error) {
    console.error('错误:', error.message);
  }
  
  process.exit(0);
}

test();
