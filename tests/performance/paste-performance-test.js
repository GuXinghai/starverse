/**
 * 粘贴性能测试工具
 * 
 * 使用方法：
 * 1. 在浏览器中打开应用
 * 2. 打开开发者工具控制台
 * 3. 复制并运行此脚本
 * 4. 在聊天输入框中粘贴大段文本
 * 5. 查看控制台输出的性能数据
 */

(function() {
  console.log('🔍 粘贴性能分析工具已加载');
  console.log('请在输入框中粘贴一些文本，然后查看性能报告...\n');

  // ========== 1. 监控 updateConversationDraft 调用 ==========
  let draftUpdateCount = 0;
  let lastDraftUpdateTime = 0;
  const draftUpdateTimes = [];

  // 尝试拦截 chatStore 方法
  setTimeout(() => {
    try {
      const app = document.querySelector('#app').__vue_app__;
      if (app && app.config && app.config.globalProperties) {
        const stores = app.config.globalProperties.$pinia?._s;
        if (stores) {
          const chatStore = Array.from(stores.values()).find(s => s.updateConversationDraft);
          if (chatStore) {
            const originalUpdate = chatStore.updateConversationDraft;
            chatStore.updateConversationDraft = function(...args) {
              const now = performance.now();
              draftUpdateCount++;
              
              if (lastDraftUpdateTime > 0) {
                const interval = now - lastDraftUpdateTime;
                draftUpdateTimes.push(interval);
              }
              
              lastDraftUpdateTime = now;
              console.log(`📝 updateConversationDraft 调用 #${draftUpdateCount}`);
              
              return originalUpdate.apply(this, args);
            };
            console.log('✅ 已拦截 updateConversationDraft');
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ 无法拦截 store 方法:', e.message);
    }
  }, 1000);

  // ========== 2. 监控 textarea input 事件 ==========
  let inputEventCount = 0;
  let lastInputTime = 0;
  const inputIntervals = [];

  document.addEventListener('input', (e) => {
    if (e.target.tagName === 'TEXTAREA') {
      const now = performance.now();
      inputEventCount++;
      
      if (lastInputTime > 0) {
        const interval = now - lastInputTime;
        inputIntervals.push(interval);
      }
      
      lastInputTime = now;
      
      // 检测粘贴操作（input 事件后紧跟着大量文本）
      if (e.target.value.length > 100 && inputEventCount === 1) {
        console.log(`📋 检测到粘贴操作 (${e.target.value.length} 字符)`);
        
        // 开始性能监控
        console.time('⏱️ 粘贴到页面响应完成');
        
        // 等待所有更新完成
        requestAnimationFrame(() => {
          setTimeout(() => {
            console.timeEnd('⏱️ 粘贴到页面响应完成');
            printReport();
          }, 100);
        });
      }
    }
  }, true);

  // ========== 3. 监控 ChatView 实例数量 ==========
  const checkInstances = () => {
    const instances = document.querySelectorAll('[data-test-id="chat-view"]');
    return instances.length;
  };

  // ========== 4. 性能报告 ==========
  const printReport = () => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 粘贴性能分析报告');
    console.log('='.repeat(60));
    
    console.log(`\n🎯 基本信息:`);
    console.log(`  - ChatView 实例数: ${checkInstances()}`);
    console.log(`  - input 事件触发次数: ${inputEventCount}`);
    console.log(`  - updateConversationDraft 调用次数: ${draftUpdateCount}`);
    
    if (draftUpdateTimes.length > 0) {
      const avgInterval = draftUpdateTimes.reduce((a, b) => a + b, 0) / draftUpdateTimes.length;
      const minInterval = Math.min(...draftUpdateTimes);
      const maxInterval = Math.max(...draftUpdateTimes);
      
      console.log(`\n⏱️ updateConversationDraft 调用间隔:`);
      console.log(`  - 平均间隔: ${avgInterval.toFixed(2)}ms`);
      console.log(`  - 最小间隔: ${minInterval.toFixed(2)}ms`);
      console.log(`  - 最大间隔: ${maxInterval.toFixed(2)}ms`);
      
      if (avgInterval < 50) {
        console.log(`  ⚠️ 警告: 调用频率过高！建议添加防抖 (当前平均 ${avgInterval.toFixed(0)}ms)`);
      }
    }
    
    console.log(`\n💡 优化建议:`);
    if (draftUpdateCount === inputEventCount) {
      console.log(`  🔴 每次输入都触发 updateConversationDraft (无防抖)`);
      console.log(`  建议: 添加 300-500ms 防抖`);
    }
    
    const instances = checkInstances();
    if (instances > 1) {
      console.log(`  🟡 有 ${instances} 个 ChatView 实例在 DOM 中`);
      console.log(`  建议: 确保只有激活的实例处理输入`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // 重置计数器
    draftUpdateCount = 0;
    inputEventCount = 0;
    draftUpdateTimes.length = 0;
    inputIntervals.length = 0;
  };

  // ========== 5. 手动触发报告 ==========
  window.showPasteReport = printReport;
  console.log('\n💡 提示: 粘贴文本后，可以手动调用 showPasteReport() 查看报告');

  // ========== 6. 性能测试函数 ==========
  window.testPastePerformance = (textLength = 5000) => {
    const textarea = document.querySelector('textarea');
    if (!textarea) {
      console.error('❌ 找不到 textarea 元素');
      return;
    }

    console.log(`\n🧪 开始测试 (${textLength} 字符)...`);
    console.time('⏱️ 模拟粘贴性能');
    
    // 重置计数器
    draftUpdateCount = 0;
    inputEventCount = 0;
    
    // 模拟粘贴
    const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(Math.ceil(textLength / 56));
    textarea.value = longText.substring(0, textLength);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 等待更新完成
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.timeEnd('⏱️ 模拟粘贴性能');
        printReport();
      }, 150);
    });
  };

  console.log('\n🧪 使用 testPastePerformance(5000) 可以模拟粘贴 5000 字符');
})();
