const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { app } = require('electron')

app.whenReady().then(() => {
  const addonPathArg = process.argv.find((value) => value.startsWith('--addon-path='))
  const addonPath = addonPathArg
    ? path.resolve(addonPathArg.slice('--addon-path='.length))
    : path.resolve(
        __dirname,
        '..',
        '..',
        'dist-native',
        'win32-x64',
        'starverse_epoch_win32.node',
      )
  const addon = require(addonPath)
  const result = addon.selfTest()
  if (!result || result.win32 !== true || !Number.isInteger(result.napiVersion)) {
    throw new Error('EPOCH2_WIN32_NATIVE_CONTRACT_INVALID')
  }
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-native-electron-'))
  const digest = crypto.createHash('sha256')
    .update(`starverse-epoch-2\0${path.resolve(appDataRoot).normalize('NFC').toLowerCase()}`, 'utf8')
    .digest('hex')
  const lease = addon.acquireEpochRootLease({
    mutexName: `Local\\Starverse.Epoch2.${digest}`,
    appDataRoot,
    productDirectory: 'Starverse',
    transitionDirectory: '.epoch-transition',
    lockFileName: 'epoch-transition.lock',
  })
  try {
    const bytes = Buffer.from('{"smoke":true}\n', 'utf8')
    if (lease.writeTransitionFile('root-manifest.json', bytes, false) !== true) {
      throw new Error('EPOCH2_WIN32_NATIVE_MANIFEST_PUBLISH_INVALID')
    }
    const read = lease.readTransitionFile('root-manifest.json', 4096)
    if (!Buffer.isBuffer(read) || !read.equals(bytes)) {
      throw new Error('EPOCH2_WIN32_NATIVE_FILE_IO_INVALID')
    }
  } finally {
    lease.release()
    fs.rmSync(appDataRoot, { recursive: true, force: true })
  }
  console.log(`[epoch-native-electron-smoke] passed napi=${result.napiVersion}`)
  app.quit()
}).catch((error) => {
  console.error(`[epoch-native-electron-smoke] failed ${error instanceof Error ? error.message : String(error)}`)
  app.exit(1)
})
