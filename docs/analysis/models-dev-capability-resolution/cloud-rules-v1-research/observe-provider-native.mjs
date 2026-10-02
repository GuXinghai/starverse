// Research-only public payload observation; no authenticated account or DB access.
// node <this-file> <surface-id> <saved-payload.json> <output.json>
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { loadResearchContracts } from './research-code.mjs'

const [sourceSurfaceId, input, output] = process.argv.slice(2)
if (!sourceSurfaceId || !input || !output) throw new Error('Expected surface, payload and output')
const bytes = await readFile(input)
const c = await loadResearchContracts()
const raw = c.sanitizeRawSourcePayloadV1({ payload: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')), recordKey: 'research-public-provider-catalog' })
const rawSnapshot = c.buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId: 'research-only', recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })
const adapter = c.createProviderNativeSourceAdapterV1({ sourceSurfaceId, rawPayloadReader: { readRawPayload: () => raw.persistedPayload } })
const sourceRevision = c.buildSourceRevisionForAdapterV1({ adapter, rawSnapshot })
const index = adapter.indexRawRecords(rawSnapshot)
const subjects = index.exactSubjects.map(subject => {
  const record = adapter.adaptExactSubject({ rawSnapshot, sourceRevision, subject })
  return { subject, recordOutcome: record.recordOutcome, outcomes: record.outcomes.map(o => ({ path: o.path, state: o.currentObservation.kind,
    value: o.currentObservation.kind === 'present_valid' ? o.currentObservation.assertion.value : null })) }
})
await writeFile(output, JSON.stringify({ purpose: 'Public payload transformed in memory; not local active source state or authoritative subject creation', sourceSurfaceId,
  snapshotSha256: createHash('sha256').update(bytes).digest('hex'), adapterRevision: adapter.adapterRevision,
  invalidRecordRefCount: index.invalidRecordRefs.length, subjects }, null, 2) + '\n')
console.log(JSON.stringify({ sourceSurfaceId, subjects: subjects.length, invalidRecordRefCount: index.invalidRecordRefs.length, output }))
