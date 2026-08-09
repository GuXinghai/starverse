import packageMetadata from '../package.json'

export type StarversePackagedIdentityChannel = 'production' | 'development' | 'e2e'

export type StarverseProductIdentity = Readonly<{
  packageName: string
  productName: string
  productDirectory: string
  applicationId: string
  channel: StarversePackagedIdentityChannel
}>

function requireMetadataString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`STARVERSE_PRODUCT_IDENTITY_INVALID:${field}`)
  }
  return value
}

const packageName = requireMetadataString(packageMetadata.name, 'packageName')
const productName = requireMetadataString(packageMetadata.productName, 'productName')
const productionApplicationId = requireMetadataString(packageMetadata.build?.appId, 'applicationId')

if (productName === '.' || productName === '..' || /[\\/\u0000-\u001f]/u.test(productName)) {
  throw new Error('STARVERSE_PRODUCT_IDENTITY_INVALID:productName')
}
if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u.test(productionApplicationId)) {
  throw new Error('STARVERSE_PRODUCT_IDENTITY_INVALID:applicationId')
}
if (productionApplicationId.endsWith('.dev') || productionApplicationId.endsWith('.e2e')) {
  throw new Error('STARVERSE_PRODUCT_IDENTITY_INVALID:productionApplicationId')
}

export const STARVERSE_PACKAGE_NAME = packageName
export const STARVERSE_PRODUCT_NAME = productName
export const STARVERSE_PACKAGED_APP_ID = productionApplicationId

export function resolveStarverseProductIdentity(
  channel: StarversePackagedIdentityChannel,
): StarverseProductIdentity {
  if (channel !== 'production' && channel !== 'development' && channel !== 'e2e') {
    throw new Error('STARVERSE_PRODUCT_IDENTITY_INVALID:channel')
  }
  const suffix = channel === 'production' ? '' : channel === 'development' ? '.dev' : '.e2e'
  return Object.freeze({
    packageName: STARVERSE_PACKAGE_NAME,
    productName: STARVERSE_PRODUCT_NAME,
    productDirectory: STARVERSE_PRODUCT_NAME,
    applicationId: `${STARVERSE_PACKAGED_APP_ID}${suffix}`,
    channel,
  })
}
