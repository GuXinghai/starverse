const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { app } = require('electron')
const packageMetadata = require('../../package.json')

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
    productDirectory: packageMetadata.productName,
    transitionDirectory: '.epoch-transition',
    lockFileName: 'epoch-transition.lock',
  })
  try {
    const epochRoot = path.join(
      appDataRoot,
      packageMetadata.productName,
      'workspace',
      'epoch-2',
    ).normalize('NFC').toLowerCase()
    const rootId = crypto.createHash('sha256')
      .update(`starverse\0${packageMetadata.build.appId}\0${epochRoot}`, 'utf8')
      .digest('hex')
    const bytes = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      dataEpoch: 2,
      applicationId: packageMetadata.build.appId,
      productDirectory: packageMetadata.productName,
      rootId,
    }, null, 2)}\n`, 'utf8')
    if (lease.writeTransitionFile('root-manifest.json', bytes, false) !== true) {
      throw new Error('EPOCH2_WIN32_NATIVE_MANIFEST_PUBLISH_INVALID')
    }
    const read = lease.readTransitionFile('root-manifest.json', 4096)
    if (!Buffer.isBuffer(read) || !read.equals(bytes)) {
      throw new Error('EPOCH2_WIN32_NATIVE_FILE_IO_INVALID')
    }
    const legacyConfig = path.join(appDataRoot, packageMetadata.productName, 'config.json')
    fs.writeFileSync(legacyConfig, '{"legacy":true}\n')
    const configOperationId = '123e4567-e89b-42d3-a456-426614174000'
    const configSnapshot = lease.readLegacyConfig(configOperationId)
    const projectedConfig = Buffer.from('{"language":"zh-CN"}\n', 'utf8')
    if (!configSnapshot || !Buffer.isBuffer(configSnapshot.bytes) ||
        typeof configSnapshot.snapshotId !== 'string' ||
        lease.replaceLegacyConfig(
          configOperationId,
          configSnapshot.snapshotId,
          projectedConfig,
        ) !== true ||
        !fs.readFileSync(legacyConfig).equals(projectedConfig)) {
      throw new Error('EPOCH2_WIN32_NATIVE_CONFIG_REPLACE_INVALID')
    }
    const configBackup = path.join(
      appDataRoot,
      packageMetadata.productName,
      'config.backup.2026-07-17T12-34-56-789Z.json',
    )
    fs.writeFileSync(configBackup, 'backup-smoke')
    if (lease.deleteLegacyConfigBackups() !== 1 || fs.existsSync(configBackup)) {
      throw new Error('EPOCH2_WIN32_NATIVE_CONFIG_BACKUP_INVALID')
    }
    const legacyDb = path.join(appDataRoot, packageMetadata.productName, 'chat.db')
    fs.writeFileSync(legacyDb, 'delete-smoke')
    const deleted = lease.deleteOwnedTarget('legacy_chat_db')
    if (!deleted || deleted.exists !== true || fs.existsSync(legacyDb)) {
      throw new Error('EPOCH2_WIN32_NATIVE_DELETE_INVALID')
    }
    const tempName = `.svtmp-${'a'.repeat(32)}`
    const tempPath = path.join(
      appDataRoot,
      packageMetadata.productName,
      '.epoch-transition',
      tempName,
    )
    fs.writeFileSync(tempPath, 'cleanup-smoke')
    if (lease.cleanupTransitionTemps() !== 1 || fs.existsSync(tempPath)) {
      throw new Error('EPOCH2_WIN32_NATIVE_TEMP_CLEANUP_INVALID')
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
