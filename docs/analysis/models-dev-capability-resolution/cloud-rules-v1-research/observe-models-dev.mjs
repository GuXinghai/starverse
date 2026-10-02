// node <this-file> <repo-external-api-snapshot> <repo-external-observation-output>
import { readFile, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { loadResearchContracts } from './research-code.mjs'

const [snapshotPath, outputPath] = process.argv.slice(2)
if (!snapshotPath || !outputPath) throw new Error('Expected snapshot and output paths')
const source = await readFile(snapshotPath)
const retrievedAt = (await stat(snapshotPath)).mtime.toISOString()
const c = await loadResearchContracts()
const raw = c.sanitizeRawSourcePayloadV1({ payload: JSON.parse(source), recordKey: 'research-models-dev-api' })
const rawSnapshot = c.buildRawSourceSnapshotRefV1({ sourceKind: 'models_dev', sourceScopeId: 'research-only',
  recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })
const adapter = c.createModelsDevSourceAdapterV1({ rawPayloadReader: { readRawPayload: () => raw.persistedPayload } })
const sourceRevision = c.buildSourceRevisionForAdapterV1({ adapter, rawSnapshot })
const index = adapter.indexRawRecords(rawSnapshot)
const subjects = index.exactSubjects.map(subject => {
  const record = adapter.adaptExactSubject({ rawSnapshot, sourceRevision, subject })
  return { subject, recordOutcome: record.recordOutcome,
    outcomes: record.outcomes.map(o => ({ path: o.path, state: o.currentObservation.kind,
      value: o.currentObservation.kind === 'present_valid' ? o.currentObservation.assertion.value : null })),
    unmappedFields: record.unmappedSourceFields.map(f => ({ reasonCode: f.reasonCode,
      candidateCanonicalPath: f.candidateCanonicalPath ?? null,
      sourceFieldPaths: f.sourceFieldRefs.map(r => r.sourceFieldPath) })) }
})
const output = { purpose: 'Research comparison only; not applied to Starverse; not model identity authority',
  sourceUrl: 'https://models.dev/api.json', retrievedAt,
  snapshotSha256: createHash('sha256').update(source).digest('hex'),
  adapterRevision: adapter.adapterRevision, registryRevision: c.PROVIDER_AUTHORITY_REGISTRY_REVISION_V1,
  invalidRecordRefCount: index.invalidRecordRefs.length,
  note: 'Public source snapshot transformed by current adapter in memory; local DB/current source state unverified. Anthropic is unmapped by registry.', subjects }
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ subjects: subjects.length, invalidRecordRefCount: index.invalidRecordRefs.length,
  retrievedAt, outputPath }))
