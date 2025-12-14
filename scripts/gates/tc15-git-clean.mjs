import { spawnSync } from 'node:child_process'
import process from 'node:process'

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function main() {
  section('TC-15 — git clean working tree')

  const res = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
  if (res.error) {
    console.error(`FAIL: failed to run git: ${res.error.message}`)
    process.exit(1)
  }
  if (typeof res.status === 'number' && res.status !== 0) {
    console.error(`FAIL: git status exited with code ${res.status}`)
    process.exit(1)
  }

  const out = (res.stdout || '').trimEnd()
  if (out.length > 0) {
    console.error('FAIL: working tree is dirty (modified/untracked files found)')
    console.error(out)
    process.exit(1)
  }

  console.log('PASS: working tree is clean')
}

main()

