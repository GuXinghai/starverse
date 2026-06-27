import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const helperPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dpapi-helper.ps1')

/**
 * @typedef {{
 *   powershellPath?: string
 *   timeoutMs?: number
 * }} DpapiOptions
 */

/**
 * @param {string} plaintext
 * @param {DpapiOptions} [options]
 * @returns {Promise<string>}
 */
export async function protectUtf8(plaintext, options = {}) {
  const plaintextBase64 = Buffer.from(plaintext, 'utf8').toString('base64')
  return runDpapiHelper('protect', plaintextBase64, options)
}

/**
 * @param {string} ciphertextBase64
 * @param {DpapiOptions} [options]
 * @returns {Promise<string>}
 */
export async function unprotectUtf8(ciphertextBase64, options = {}) {
  const plaintextBase64 = await runDpapiHelper('unprotect', ciphertextBase64, options)
  return Buffer.from(plaintextBase64, 'base64').toString('utf8')
}

/**
 * @param {'protect' | 'unprotect'} mode
 * @param {string} inputBase64
 * @param {DpapiOptions} options
 * @returns {Promise<string>}
 */
async function runDpapiHelper(mode, inputBase64, options) {
  if (process.platform !== 'win32') {
    throw new Error('Windows DPAPI is only available on Windows.')
  }

  const powershellPath = options.powershellPath ?? process.env.PROVIDER_KEY_VAULT_POWERSHELL ?? 'powershell.exe'
  const timeoutMs = options.timeoutMs ?? 15000

  return new Promise((resolve, reject) => {
    const child = spawn(
      powershellPath,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath, mode],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      child.kill()
      reject(new Error('DPAPI helper timed out.'))
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      reject(new Error(`DPAPI helper could not start: ${error.message}`))
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      const detail = stderr.trim().split(/\r?\n/, 1)[0] ?? 'DPAPI helper failed.'
      reject(new Error(detail))
    })

    child.stdin.end(inputBase64)
  })
}
