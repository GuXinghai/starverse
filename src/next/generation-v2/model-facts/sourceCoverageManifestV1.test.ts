import { describe, expect, it } from 'vitest'
import {
  defineSourceMappingCoverageManifestV1,
  MODELS_DEV_COVERAGE_MANIFEST_V1,
  PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1,
  SourceCoverageManifestV1Error,
} from './sourceCoverageManifestV1'

describe('source coverage manifests V1', () => {
  it('keeps no coverage distinct from observable missing', () => {
    expect(PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['openai-models-v1'].mappings).toEqual([])
    expect(PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['deepseek-stable-models-v1'].mappings).toEqual([])
    expect(PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['gemini-models-v1beta'].mappings)
      .toContainEqual(expect.objectContaining({ mappingId: 'google.thinking.v1', absenceSemantics: 'missing' }))
  })

  it('contains only the frozen Google topK omission exception', () => {
    const google = PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['gemini-models-v1beta'].mappings
    expect(google).toContainEqual(expect.objectContaining({ mappingId: 'google.top-k-support.v1',
      canonicalPath: 'sampling.topK.support', absenceSemantics: 'explicit_unsupported' }))
    expect([...google, ...MODELS_DEV_COVERAGE_MANIFEST_V1.mappings]
      .filter((mapping) => mapping.absenceSemantics === 'explicit_unsupported')).toHaveLength(1)
  })

  it('rejects unregistered paths and malformed manifest semantics', () => {
    expect(() => defineSourceMappingCoverageManifestV1({ sourceSurfaceId: 'bad', mappings: [{
      mappingId: 'bad', sourceFieldPaths: ['x'], canonicalPath: 'not.registered' as never,
      absenceSemantics: 'missing', nullSemantics: 'invalid', collectionCompleteness: 'not_a_collection',
    }] })).toThrowError(SourceCoverageManifestV1Error)
  })
})
