import { app } from 'electron'

const appDataOverride = String(process.env.SV_GENERATION_V2_REAL_SMOKE_APP_DATA_DIR ?? '').trim()
if (appDataOverride) app.setPath('appData', appDataOverride)
await import('../../dist-electron/epoch2MainEntry.js')
