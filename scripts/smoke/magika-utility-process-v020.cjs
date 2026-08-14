const { app, utilityProcess } = require('electron')
const { mkdtemp, rm, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

async function run() {
  await app.whenReady()
  process.stderr.write('[magika-smoke] electron-ready\n')
  const root = path.resolve('.artifacts/plugin-packages/staging/starverse-plugin-magika-0.2.0-any-any/engine')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'starverse-magika-utility-smoke-'))
  try {
    const input = path.join(temp, 'input.txt')
    await writeFile(input, 'Starverse Electron utility process smoke\n')
    const child = utilityProcess.fork(path.join(root, 'runtime', 'magika-pure-js-runtime.mjs'), [
      '--model-dir', path.join(root, 'model', 'standard_v3_3'),
      '--config-dir', path.join(root, 'model', 'standard_v3_3'),
      '--input', input, '--output-json',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'], serviceName: 'Starverse Magika Smoke',
      allowLoadingUnsignedLibraries: false, env: { ...process.env, SV_MAGIKA_SMOKE_TRACE: '1' },
    })
    process.stderr.write('[magika-smoke] utility-forked\n')
    const output = await new Promise((resolve, reject) => {
      const stdout = []; const stderr = []
      let messageOutput = null
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`utility process smoke timed out: ${Buffer.concat(stderr).toString('utf8')}`))
      }, 60_000)
      child.stdout.on('data', value => stdout.push(value))
      child.stderr.on('data', value => { stderr.push(value); process.stderr.write(value) })
      child.on('message', message => {
        if (!message || message.kind !== 'starverse-magika-result-v1' || typeof message.json !== 'string') return
        messageOutput = message.json
      })
      child.once('error', reject)
      child.once('exit', code => {
        clearTimeout(timer)
        if (code !== 0) reject(new Error(`utility process exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`))
        else resolve(JSON.parse(messageOutput ?? Buffer.concat(stdout).toString('utf8')))
      })
    })
    if (!output || typeof output.label !== 'string' || typeof output.score !== 'number') throw new Error('invalid utility process output')
    console.log(JSON.stringify({ ok: true, label: output.label, score: output.score, modelVersion: output.modelVersion ?? null }))
  } finally {
    try { await rm(temp, { recursive: true, force: true }) } finally { app.exit(process.exitCode ?? 0) }
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
