import {
  canonicalSourceFactDigestV1,
} from '../model-facts/canonicalSourceFactsV1'
import {
  decodeCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleCorePackV1,
  type CapabilityRuleOwnershipSnapshotV1,
} from './capabilityRuleCoreV1'

export const CLOUD_RULES_OFFICIAL_REPOSITORY_OWNER_V1 = 'GuXinghai' as const
export const CLOUD_RULES_OFFICIAL_REPOSITORY_NAME_V1 = 'starverse' as const
export const CLOUD_RULES_OFFICIAL_REPOSITORY_V1 =
  `${CLOUD_RULES_OFFICIAL_REPOSITORY_OWNER_V1}/${CLOUD_RULES_OFFICIAL_REPOSITORY_NAME_V1}` as const
export const CLOUD_RULES_OFFICIAL_REPOSITORY_URL_V1 =
  `https://github.com/${CLOUD_RULES_OFFICIAL_REPOSITORY_V1}` as const
export const CLOUD_RULES_RELEASE_TAG_PREFIX_V1 = 'cloud-rules-v' as const
export const CLOUD_RULES_RELEASE_ASSET_NAME_V1 = 'starverse-cloud-rules.json' as const
export const CLOUD_RULES_OFFICIAL_OWNER_ID_V1 = 'official' as const
export const CLOUD_RULES_CONTENT_REVISION_PREFIX_V1 = 'sha256:' as const

// Short aliases keep the fixed source values easy to consume without changing their V1 identities.
export const CLOUD_RULES_OFFICIAL_REPOSITORY = CLOUD_RULES_OFFICIAL_REPOSITORY_V1
export const CLOUD_RULES_RELEASE_TAG_PREFIX = CLOUD_RULES_RELEASE_TAG_PREFIX_V1
export const CLOUD_RULES_RELEASE_ASSET_NAME = CLOUD_RULES_RELEASE_ASSET_NAME_V1
export const CLOUD_RULES_OFFICIAL_OWNER_ID = CLOUD_RULES_OFFICIAL_OWNER_ID_V1

export type CloudRulesStableSemVerV1 = Readonly<{
  major: number
  minor: number
  patch: number
  value: string
}>

export type CloudRulesReleaseAssetV1 = Readonly<{
  assetId: string
  name: string
  state: string
  apiUrl: string
  browserDownloadUrl: string
  sizeBytes: number
  githubDigest: string | null
}>

export type CloudRulesGitHubReleaseV1 = Readonly<{
  releaseId: string
  tagName: string
  releaseVersion: string
  version: CloudRulesStableSemVerV1
  draft: false
  prerelease: false
  publishedAt: string
  htmlUrl: string
  name: string | null
  notes: string | null
  assets: readonly CloudRulesReleaseAssetV1[]
}>

export type CloudRulesReleaseDocumentV1 = Readonly<{
  schemaVersion: 1
  releaseVersion: string
  contentRevision: string
  packs: readonly CapabilityRuleCorePackV1[]
}>

export type CloudRulesValidatedPublicationV1 = Readonly<{
  document: CloudRulesReleaseDocumentV1
  ownershipSnapshot: CapabilityRuleOwnershipSnapshotV1
  release: CloudRulesGitHubReleaseV1
  asset: CloudRulesReleaseAssetV1
}>

export type CloudRulesReleaseMetadataV1 = Readonly<{
  releaseId: string
  releaseVersion: string
  tagName: string
  publishedAt: string
  htmlUrl: string
  name: string | null
  notes: string | null
  assetId: string
  assetApiUrl: string
  assetBrowserDownloadUrl: string
  assetSizeBytes: number
  githubAssetDigest: string | null
}>

export type CloudRulesReleaseV1ErrorCode =
  | 'GENERATION_V2_CLOUD_RULES_SEMVER_INVALID'
  | 'GENERATION_V2_CLOUD_RULES_RELEASE_INVALID'
  | 'GENERATION_V2_CLOUD_RULES_ASSET_INVALID'
  | 'GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID'
  | 'GENERATION_V2_CLOUD_RULES_CONTENT_REVISION_INVALID'

export class CloudRulesReleaseV1Error extends Error {
  constructor(readonly code: CloudRulesReleaseV1ErrorCode) {
    super(code)
    this.name = 'CloudRulesReleaseV1Error'
  }
}

function invalid(code: CloudRulesReleaseV1ErrorCode): never {
  throw new CloudRulesReleaseV1Error(code)
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], code: CloudRulesReleaseV1ErrorCode): void {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(code)
}

function parseSemVerParts(value: unknown): CloudRulesStableSemVerV1 {
  if (typeof value !== 'string') invalid('GENERATION_V2_CLOUD_RULES_SEMVER_INVALID')
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value)
  if (!match) invalid('GENERATION_V2_CLOUD_RULES_SEMVER_INVALID')
  const parts = match.slice(1).map(Number)
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    invalid('GENERATION_V2_CLOUD_RULES_SEMVER_INVALID')
  }
  return Object.freeze({ major: parts[0]!, minor: parts[1]!, patch: parts[2]!, value })
}

export function parseCloudRulesStableSemVerV1(value: unknown): CloudRulesStableSemVerV1 {
  return parseSemVerParts(value)
}

export function tryParseCloudRulesStableSemVerV1(value: unknown): CloudRulesStableSemVerV1 | null {
  try {
    return parseSemVerParts(value)
  } catch (error) {
    if (error instanceof CloudRulesReleaseV1Error &&
        error.code === 'GENERATION_V2_CLOUD_RULES_SEMVER_INVALID') return null
    throw error
  }
}

export function compareCloudRulesStableSemVerV1(
  left: CloudRulesStableSemVerV1 | string,
  right: CloudRulesStableSemVerV1 | string,
): number {
  const leftVersion = typeof left === 'string' ? parseSemVerParts(left) : left
  const rightVersion = typeof right === 'string' ? parseSemVerParts(right) : right
  if (leftVersion.major !== rightVersion.major) return leftVersion.major < rightVersion.major ? -1 : 1
  if (leftVersion.minor !== rightVersion.minor) return leftVersion.minor < rightVersion.minor ? -1 : 1
  if (leftVersion.patch !== rightVersion.patch) return leftVersion.patch < rightVersion.patch ? -1 : 1
  return 0
}

function releaseVersionFromTag(tagName: unknown): Readonly<{
  tagName: string
  releaseVersion: string
  version: CloudRulesStableSemVerV1
}> {
  if (typeof tagName !== 'string' || !tagName.startsWith(CLOUD_RULES_RELEASE_TAG_PREFIX_V1)) {
    invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  }
  const releaseVersion = tagName.slice(CLOUD_RULES_RELEASE_TAG_PREFIX_V1.length)
  const version = tryParseCloudRulesStableSemVerV1(releaseVersion)
  if (!version) invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  return Object.freeze({ tagName, releaseVersion, version })
}

function decodeReleaseAsset(value: unknown): CloudRulesReleaseAssetV1 {
  if (!plainObject(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 0 ||
      typeof value.name !== 'string' || value.name.length < 1 ||
      typeof value.state !== 'string' || value.state.length < 1 ||
      typeof value.url !== 'string' || typeof value.browser_download_url !== 'string' ||
      !Number.isSafeInteger(value.size) || (value.size as number) < 0 ||
      (value.digest !== undefined && value.digest !== null && typeof value.digest !== 'string')) {
    invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  }
  return Object.freeze({
    assetId: String(value.id),
    name: value.name,
    state: value.state,
    apiUrl: value.url,
    browserDownloadUrl: value.browser_download_url,
    sizeBytes: value.size as number,
    githubDigest: value.digest === undefined || value.digest === null ? null : value.digest,
  })
}

function decodePublishedAt(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || !Number.isFinite(Date.parse(value))) {
    invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  }
  return value
}

export function decodeCloudRulesGitHubReleaseV1(value: unknown): CloudRulesGitHubReleaseV1 {
  if (!plainObject(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 0 ||
      typeof value.tag_name !== 'string' || typeof value.html_url !== 'string' ||
      (value.name !== null && typeof value.name !== 'string') ||
      (value.body !== null && typeof value.body !== 'string') ||
      typeof value.draft !== 'boolean' || typeof value.prerelease !== 'boolean' ||
      !Array.isArray(value.assets)) {
    invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  }
  const tag = releaseVersionFromTag(value.tag_name)
  const publishedAt = decodePublishedAt(value.published_at)
  const assets = Object.freeze(value.assets.map(decodeReleaseAsset))
  if (value.draft || value.prerelease) invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  return Object.freeze({
    releaseId: String(value.id),
    tagName: tag.tagName,
    releaseVersion: tag.releaseVersion,
    version: tag.version,
    draft: false as const,
    prerelease: false as const,
    publishedAt,
    htmlUrl: value.html_url,
    name: value.name,
    notes: value.body,
    assets,
  })
}

function tryDecodeCloudRulesGitHubReleaseV1(value: unknown): CloudRulesGitHubReleaseV1 | null {
  try {
    return decodeCloudRulesGitHubReleaseV1(value)
  } catch (error) {
    if (error instanceof CloudRulesReleaseV1Error &&
        (error.code === 'GENERATION_V2_CLOUD_RULES_RELEASE_INVALID' ||
          error.code === 'GENERATION_V2_CLOUD_RULES_SEMVER_INVALID')) return null
    throw error
  }
}

export function decodeCloudRulesGitHubReleaseListingV1(value: unknown): readonly CloudRulesGitHubReleaseV1[] {
  if (!Array.isArray(value)) invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  const releases = value.flatMap((entry) => {
    const decoded = tryDecodeCloudRulesGitHubReleaseV1(entry)
    return decoded ? [decoded] : []
  })
  return Object.freeze(releases)
}

export function selectHighestCloudRulesReleaseV1(value: unknown): CloudRulesGitHubReleaseV1 | null {
  if (!Array.isArray(value)) invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  let highestRaw: unknown = null
  let highestVersion: CloudRulesStableSemVerV1 | null = null
  for (const entry of value) {
    if (!plainObject(entry) || typeof entry.tag_name !== 'string' ||
        !entry.tag_name.startsWith(CLOUD_RULES_RELEASE_TAG_PREFIX_V1)) continue
    const version = tryParseCloudRulesStableSemVerV1(
      entry.tag_name.slice(CLOUD_RULES_RELEASE_TAG_PREFIX_V1.length))
    if (!version || entry.draft === true || entry.prerelease === true || entry.published_at === null) continue
    if (!highestVersion || compareCloudRulesStableSemVerV1(version, highestVersion) > 0) {
      highestRaw = entry
      highestVersion = version
    }
  }
  return highestRaw === null ? null : decodeCloudRulesGitHubReleaseV1(highestRaw)
}

export function selectCloudRulesReleaseAssetV1(
  release: CloudRulesGitHubReleaseV1,
): CloudRulesReleaseAssetV1 {
  const matches = release.assets.filter((asset) => asset.name === CLOUD_RULES_RELEASE_ASSET_NAME_V1)
  if (matches.length !== 1 || matches[0]!.state !== 'uploaded') {
    invalid('GENERATION_V2_CLOUD_RULES_ASSET_INVALID')
  }
  return matches[0]!
}

function contentRevisionForNormalizedPacks(packs: readonly CapabilityRuleCorePackV1[]): string {
  return `${CLOUD_RULES_CONTENT_REVISION_PREFIX_V1}${canonicalSourceFactDigestV1(packs)}`
}

export function computeCloudRulesContentRevisionV1(packs: unknown): string {
  if (!Array.isArray(packs)) invalid('GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  let ownershipSnapshot: CapabilityRuleOwnershipSnapshotV1
  try {
    ownershipSnapshot = decodeCapabilityRuleOwnershipSnapshotV1({
      schemaVersion: 1,
      ownership: 'cloud',
      ownerId: CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
      packs,
    })
  } catch {
    invalid('GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  }
  return contentRevisionForNormalizedPacks(ownershipSnapshot.packs)
}

function decodeCloudOwnershipSnapshot(packs: unknown): CapabilityRuleOwnershipSnapshotV1 {
  try {
    return decodeCapabilityRuleOwnershipSnapshotV1({
      schemaVersion: 1,
      ownership: 'cloud',
      ownerId: CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
      packs,
    })
  } catch {
    invalid('GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  }
}

function decodeContentRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    invalid('GENERATION_V2_CLOUD_RULES_CONTENT_REVISION_INVALID')
  }
  return value
}

export function decodeCloudRulesReleaseDocumentV1(
  value: unknown,
  expectedReleaseVersion?: string,
): CloudRulesReleaseDocumentV1 {
  if (!plainObject(value)) invalid('GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  exactKeys(value, ['schemaVersion', 'releaseVersion', 'contentRevision', 'packs'],
    'GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  if (value.schemaVersion !== 1) invalid('GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  const releaseVersion = parseSemVerParts(value.releaseVersion).value
  if (expectedReleaseVersion !== undefined &&
      parseSemVerParts(expectedReleaseVersion).value !== releaseVersion) {
    invalid('GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID')
  }
  const contentRevision = decodeContentRevision(value.contentRevision)
  const ownershipSnapshot = decodeCloudOwnershipSnapshot(value.packs)
  const recomputed = contentRevisionForNormalizedPacks(ownershipSnapshot.packs)
  if (contentRevision !== recomputed) invalid('GENERATION_V2_CLOUD_RULES_CONTENT_REVISION_INVALID')
  return Object.freeze({
    schemaVersion: 1,
    releaseVersion,
    contentRevision,
    packs: ownershipSnapshot.packs,
  })
}

export function validateCloudRulesReleasePublicationV1(input: Readonly<{
  release: unknown
  document: unknown
}>): CloudRulesValidatedPublicationV1 {
  const release = decodeCloudRulesGitHubReleaseV1(input.release)
  return validateDecodedCloudRulesReleasePublicationV1({ release, document: input.document })
}

export function validateDecodedCloudRulesReleasePublicationV1(input: Readonly<{
  release: CloudRulesGitHubReleaseV1
  document: unknown
}>): CloudRulesValidatedPublicationV1 {
  const release = input.release
  const asset = selectCloudRulesReleaseAssetV1(release)
  const document = decodeCloudRulesReleaseDocumentV1(input.document, release.releaseVersion)
  const ownershipSnapshot = decodeCloudOwnershipSnapshot(document.packs)
  return Object.freeze({ document, ownershipSnapshot, release, asset })
}

export function projectCloudRulesReleaseMetadataV1(
  publication: Pick<CloudRulesValidatedPublicationV1, 'release' | 'asset'>,
): CloudRulesReleaseMetadataV1 {
  return Object.freeze({
    releaseId: publication.release.releaseId,
    releaseVersion: publication.release.releaseVersion,
    tagName: publication.release.tagName,
    publishedAt: publication.release.publishedAt,
    htmlUrl: publication.release.htmlUrl,
    name: publication.release.name,
    notes: publication.release.notes,
    assetId: publication.asset.assetId,
    assetApiUrl: publication.asset.apiUrl,
    assetBrowserDownloadUrl: publication.asset.browserDownloadUrl,
    assetSizeBytes: publication.asset.sizeBytes,
    githubAssetDigest: publication.asset.githubDigest,
  })
}

export function decodeCloudRulesReleaseMetadataV1(value: unknown): CloudRulesReleaseMetadataV1 {
  if (!plainObject(value)) invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  exactKeys(value, ['releaseId', 'releaseVersion', 'tagName', 'publishedAt', 'htmlUrl', 'name', 'notes',
    'assetId', 'assetApiUrl', 'assetBrowserDownloadUrl', 'assetSizeBytes', 'githubAssetDigest'],
  'GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  const releaseVersion = parseSemVerParts(value.releaseVersion).value
  if (value.tagName !== `${CLOUD_RULES_RELEASE_TAG_PREFIX_V1}${releaseVersion}` ||
      typeof value.releaseId !== 'string' || !/^\d+$/u.test(value.releaseId) ||
      typeof value.assetId !== 'string' || !/^\d+$/u.test(value.assetId) ||
      typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt)) ||
      typeof value.htmlUrl !== 'string' || typeof value.assetApiUrl !== 'string' ||
      typeof value.assetBrowserDownloadUrl !== 'string' ||
      (value.name !== null && typeof value.name !== 'string') ||
      (value.notes !== null && typeof value.notes !== 'string') ||
      !Number.isSafeInteger(value.assetSizeBytes) || (value.assetSizeBytes as number) < 0 ||
      (value.githubAssetDigest !== null && typeof value.githubAssetDigest !== 'string')) {
    invalid('GENERATION_V2_CLOUD_RULES_RELEASE_INVALID')
  }
  return Object.freeze({
    releaseId: value.releaseId,
    releaseVersion,
    tagName: value.tagName,
    publishedAt: value.publishedAt,
    htmlUrl: value.htmlUrl,
    name: value.name,
    notes: value.notes,
    assetId: value.assetId,
    assetApiUrl: value.assetApiUrl,
    assetBrowserDownloadUrl: value.assetBrowserDownloadUrl,
    assetSizeBytes: value.assetSizeBytes as number,
    githubAssetDigest: value.githubAssetDigest,
  })
}

export const decodeAndValidateCloudRulesReleasePublicationV1 = validateCloudRulesReleasePublicationV1
