/**
 * 持久化保存优化测试脚本
 * 
 * 使用方法：
 * 1. 打开浏览器开发者工具控制台
 * 2. 复制此文件内容并粘贴到控制台
 * 3. 运行测试函数
 */

// 监控保存次数的工具
class SaveMonitor {
  constructor() {
    this.saveCount = 0
    this.lastSaveTime = null
    this.saveHistory = []
    this.originalSave = null
  }

  start() {
    // 如果已经在运行，先停止
    if (this.originalSave) {
      this.stop()
    }

    console.log('🔍 开始监控持久化保存...')
    this.saveCount = 0
    this.saveHistory = []
    this.lastSaveTime = Date.now()

    // 获取 chatStore 实例（需要在 Vue 组件上下文中运行）
    const chatStore = window.__VUE_APP__?.config?.globalProperties?.$pinia?.state?.value?.chat
    
    if (!chatStore) {
      console.error('❌ 无法获取 chatStore，请确保在 Vue 应用中运行此脚本')
      return
    }

    // 拦截 saveConversations
    this.originalSave = chatStore.saveConversations
    chatStore.saveConversations = () => {
      this.saveCount++
      const now = Date.now()
      const timeSinceLastSave = this.lastSaveTime ? now - this.lastSaveTime : 0
      this.lastSaveTime = now

      this.saveHistory.push({
        index: this.saveCount,
        time: new Date(now).toISOString(),
        timeSinceLastSave
      })

      console.log(`💾 [SaveMonitor] 第 ${this.saveCount} 次保存 (距上次 ${timeSinceLastSave}ms)`)
      
      // 调用原始函数
      return this.originalSave.call(chatStore)
    }

    console.log('✅ 监控已启动，执行操作以观察保存行为')
  }

  stop() {
    if (!this.originalSave) {
      console.warn('⚠️ 监控尚未启动')
      return
    }

    const chatStore = window.__VUE_APP__?.config?.globalProperties?.$pinia?.state?.value?.chat
    if (chatStore) {
      chatStore.saveConversations = this.originalSave
    }

    console.log('🛑 监控已停止')
    this.showReport()
    
    this.originalSave = null
  }

  showReport() {
    console.log('\n📊 保存统计报告')
    console.log('='.repeat(50))
    console.log(`总保存次数: ${this.saveCount}`)
    console.log(`监控时长: ${this.lastSaveTime - this.saveHistory[0]?.time || 0}ms`)
    
    if (this.saveHistory.length > 0) {
      console.log('\n保存历史:')
      console.table(this.saveHistory)
    }
    
    console.log('='.repeat(50) + '\n')
  }
}

// 创建全局实例
window.saveMonitor = new SaveMonitor()

// 测试套件
const SaveOptimizationTests = {
  // 测试 1：快速新建多个对话
  async testRapidCreate() {
    console.log('\n🧪 测试 1: 快速新建 5 个对话')
    console.log('-'.repeat(50))
    
    window.saveMonitor.start()
    
    // 模拟快速点击新建按钮
    for (let i = 0; i < 5; i++) {
      document.querySelector('[data-test="create-conversation"]')?.click()
      await this.sleep(50) // 50ms 间隔
    }
    
    await this.sleep(300) // 等待防抖完成
    window.saveMonitor.stop()
    
    console.log('✅ 测试完成')
    console.log('预期结果: 只保存 1 次（优化前会保存 10 次）\n')
  },

  // 测试 2：快速切换标签
  async testRapidSwitch() {
    console.log('\n🧪 测试 2: 快速切换标签 10 次')
    console.log('-'.repeat(50))
    
    window.saveMonitor.start()
    
    const tabs = document.querySelectorAll('[data-test="chat-tab"]')
    if (tabs.length < 2) {
      console.warn('⚠️ 需要至少 2 个打开的标签才能测试')
      window.saveMonitor.stop()
      return
    }
    
    // 快速来回切换
    for (let i = 0; i < 10; i++) {
      tabs[i % tabs.length].click()
      await this.sleep(50)
    }
    
    await this.sleep(300) // 等待防抖完成
    window.saveMonitor.stop()
    
    console.log('✅ 测试完成')
    console.log('预期结果: 只保存 1 次（优化前会保存 10 次）\n')
  },

  // 测试 3：快速关闭标签
  async testRapidClose() {
    console.log('\n🧪 测试 3: 快速关闭 3 个标签')
    console.log('-'.repeat(50))
    
    window.saveMonitor.start()
    
    const closeButtons = document.querySelectorAll('[data-test="close-tab"]')
    if (closeButtons.length < 3) {
      console.warn('⚠️ 需要至少 3 个打开的标签才能测试')
      window.saveMonitor.stop()
      return
    }
    
    // 快速关闭 3 个标签
    for (let i = 0; i < 3; i++) {
      closeButtons[i].click()
      await this.sleep(50)
    }
    
    await this.sleep(300) // 等待防抖完成
    window.saveMonitor.stop()
    
    console.log('✅ 测试完成')
    console.log('预期结果: 只保存 1 次（优化前会保存 3 次）\n')
  },

  // 辅助函数：延迟
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  },

  // 运行所有测试
  async runAll() {
    console.clear()
    console.log('🚀 开始运行持久化优化测试套件')
    console.log('='.repeat(50))
    
    await this.testRapidCreate()
    await this.sleep(500)
    
    await this.testRapidSwitch()
    await this.sleep(500)
    
    await this.testRapidClose()
    
    console.log('\n✅ 所有测试完成！')
  }
}

// 暴露到全局
window.SaveOptimizationTests = SaveOptimizationTests

// 使用说明
console.log(`
📖 持久化保存优化测试工具已加载

使用方法：
1. 手动监控：
   saveMonitor.start()  // 开始监控
   // ... 执行你的操作 ...
   saveMonitor.stop()   // 停止并查看报告

2. 自动测试：
   SaveOptimizationTests.testRapidCreate()   // 测试快速新建
   SaveOptimizationTests.testRapidSwitch()   // 测试快速切换
   SaveOptimizationTests.testRapidClose()    // 测试快速关闭
   SaveOptimizationTests.runAll()            // 运行所有测试

注意：
- 某些测试需要先打开足够的标签页
- 测试结果会在控制台显示
- 请在真实使用场景中观察效果
`)
