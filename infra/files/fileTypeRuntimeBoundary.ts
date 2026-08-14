/** Approved infrastructure boundary for Electron-main file-type runtime use. */
export { evaluateExternalProcessPolicy } from '../../src/next/file-type/externalProcessPolicy'
export type { ExternalProcessRunResult } from '../../src/next/file-type/externalProcessRunner'
export { runExternalProcess } from '../../src/next/file-type/externalProcessRunner'
export type { MagikaProcessRunner } from '../../src/next/file-type/magikaClassifyRunner'
export {
  createMagikaClassifyCallback,
  detectBasicFileTypeV2,
  discoverMagikaManagedPlugin,
  MagikaRuntimeClassificationError,
  mapMagikaOutputToEvidence,
} from '../../src/next/file-type'
export type {
  FileTypeEvidence,
  FileTypeMagikaState,
} from '../../src/next/file-type'
export { getActiveTrustedRoots } from '../../src/next/file-type/officialPluginTrustedRoots'
