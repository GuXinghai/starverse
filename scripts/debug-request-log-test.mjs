/**
 * 验收测试脚本 - 打印 OpenRouter 请求体日志
 * 
 * 用途：验证 openrouterFetch 是否正确打印了完整的请求体，
 * 以及 reasoning 参数是否按预期构建。
 * 
 * 用法:
 *   node scripts/debug-request-log-test.mjs
 * 
 * 验收用例：
 * 1. 推理关闭：reasoning.effort = "none"
 * 2. 推理 medium：reasoning.effort = "medium" 
 * 3. 推理 high 且不回显：reasoning.effort = "high" + reasoning.exclude = true
 */

import { buildOpenRouterChatCompletionsRequest } from '../src/next/openrouter/buildRequest.ts'
import { openrouterFetch } from '../src/next/transport/openrouterFetch.ts'

const DUMMY_API_KEY = 'sk-or-test-key-1234567890'
const DUMMY_MODEL = 'openrouter/auto'

async function testCase1() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║           测试用例 1: 推理关闭 (reasoning OFF)                  ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const body = buildOpenRouterChatCompletionsRequest({
    model: DUMMY_MODEL,
    messages: [{ role: 'user', content: 'Hello, reasoning OFF test' }],
    stream: true,
    reasoning: { effort: 'none' }
  })

  console.log('Expected: reasoning.effort = "none"\n')

  try {
    await openrouterFetch({
      apiKey: DUMMY_API_KEY,
      body,
      requestId: 'test-case-1',
    })
  } catch (err) {
    // 预期会失败（因为是 dummy key），但日志已经打印
    console.log(`(Expected failure: ${err.type || err.message})\n`)
  }
}

async function testCase2() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║        测试用例 2: 推理 medium (reasoning medium)             ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const body = buildOpenRouterChatCompletionsRequest({
    model: DUMMY_MODEL,
    messages: [{ role: 'user', content: 'Hello, reasoning medium test' }],
    stream: true,
    reasoning: { effort: 'medium' }
  })

  console.log('Expected: reasoning.effort = "medium"\n')

  try {
    await openrouterFetch({
      apiKey: DUMMY_API_KEY,
      body,
      requestId: 'test-case-2',
    })
  } catch (err) {
    console.log(`(Expected failure: ${err.type || err.message})\n`)
  }
}

async function testCase3() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║   测试用例 3: 推理 high 且不回显 (high + exclude)             ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const body = buildOpenRouterChatCompletionsRequest({
    model: DUMMY_MODEL,
    messages: [{ role: 'user', content: 'Hello, reasoning high exclude test' }],
    stream: true,
    reasoning: { effort: 'high', exclude: true }
  })

  console.log('Expected: reasoning.effort = "high", reasoning.exclude = true\n')

  try {
    await openrouterFetch({
      apiKey: DUMMY_API_KEY,
      body,
      requestId: 'test-case-3',
    })
  } catch (err) {
    console.log(`(Expected failure: ${err.type || err.message})\n`)
  }
}

async function testCase4() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║   测试用例 4: 推理 max_tokens (Anthropic 风格)                ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  const body = buildOpenRouterChatCompletionsRequest({
    model: DUMMY_MODEL,
    messages: [{ role: 'user', content: 'Hello, max_tokens test' }],
    stream: true,
    reasoning: { max_tokens: 4000, exclude: false }
  })

  console.log('Expected: reasoning.max_tokens = 4000, reasoning.exclude = false\n')

  try {
    await openrouterFetch({
      apiKey: DUMMY_API_KEY,
      body,
      requestId: 'test-case-4',
    })
  } catch (err) {
    console.log(`(Expected failure: ${err.type || err.message})\n`)
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  OpenRouter 请求体日志验收测试')
  console.log('  目标：验证 reasoning 参数是否正确构建并打印')
  console.log('═══════════════════════════════════════════════════════════════\n')

  await testCase1()
  await testCase2()
  await testCase3()
  await testCase4()

  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║                     测试完成                                   ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log('\n请查看上面的日志输出，确认：')
  console.log('1. 每个请求都有 OPENROUTER_REQUEST_BEGIN/END 边界')
  console.log('2. 完整的请求体 JSON（包含 reasoning 参数）')
  console.log('3. OR_REQ 摘要行显示了正确的 reasoning 值')
  console.log('4. API Key 已脱敏（只显示 ***7890）\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
