const path = require('node:path')
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
  console.log(`[epoch-native-electron-smoke] passed napi=${result.napiVersion}`)
  app.quit()
}).catch((error) => {
  console.error(`[epoch-native-electron-smoke] failed ${error instanceof Error ? error.message : String(error)}`)
  app.exit(1)
})
