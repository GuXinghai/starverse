// Research-only closed-schema/registry/evidence/overlap validation; no Apply or DB.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { loadResearchContracts, researchRoot } from './research-code.mjs'

const input = path.resolve(process.argv[2] ?? path.join(researchRoot, 'final/candidate-corpus.json'))
const c = await loadResearchContracts()
const packs = JSON.parse((await readFile(input, 'utf8')).replace(/^\uFEFF/u, ''))
if (!Array.isArray(packs)) throw new Error('Corpus must be an array of actual Pack definitions')
const decoded = c.decodeCapabilityRuleOwnershipSnapshotV1({ schemaVersion: 1, ownership: 'cloud',
  ownerId: 'official-research-preview', packs })
const ledger = []
for (const p of ['gemini', 'deepseek', 'openai', 'anthropic', 'openrouter']) {
  const lines = (await readFile(path.join(researchRoot, `evidence/${p}.jsonl`), 'utf8')).replace(/^\uFEFF/u, '').split(/\r?\n/u)
  ledger.push(...lines.filter(s => s.trim()).map(s => JSON.parse(s)))
}
const refs = new Map(ledger.map(e => [e.evidenceId, e]))
if (refs.size !== ledger.length) throw new Error('Duplicate evidence identities')
const rules = decoded.packs.flatMap(p => p.rules)
const finalDecisions = JSON.parse((await readFile(path.join(researchRoot, 'final/fact-decisions.json'), 'utf8')).replace(/^\uFEFF/u, '')).rows
const manual = JSON.parse(await readFile(path.join(researchRoot, 'final/manual-review.json'), 'utf8'))
const hostPolicies = {
  'google-ai-studio': ['ai.google.dev', 'deepmind.google', 'developers.google.com'],
  deepseek: ['api-docs.deepseek.com', 'deepseek.com'],
  openai: ['developers.openai.com', 'platform.openai.com', 'openai.com'],
  anthropic: ['platform.claude.com', 'docs.claude.com', 'docs.anthropic.com', 'anthropic.com'],
  openrouter: ['openrouter.ai'],
}
const inventories = new Map()
const collect = (value, into) => {
  if (typeof value === 'string') into.add(value)
  else if (Array.isArray(value)) value.forEach(v => collect(v, into))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collect(v, into))
}
for (const p of ['gemini', 'deepseek', 'openai', 'anthropic', 'openrouter']) {
  const data = JSON.parse((await readFile(path.join(researchRoot, `facts/${p}.json`), 'utf8')).replace(/^\uFEFF/u, ''))
  const authority = { gemini: 'google-ai-studio', deepseek: 'deepseek', openai: 'openai', anthropic: 'anthropic', openrouter: 'openrouter' }[p]
  const known = new Set()
  collect(data.inventory ?? data.modelInventory ?? [], known)
  ledger.filter(e => e.provider === p).forEach(e => collect(e.exactModelsNamed, known))
  inventories.set(authority, known)
}
const firstParty = (url, authority) => {
  const u = new URL(url)
  if (u.protocol !== 'https:') return false
  if (hostPolicies[authority].some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return true
  if (authority === 'deepseek' && u.hostname === 'arxiv.org' && u.pathname === '/html/2609.19969') return true // independently verified DeepSeek-authored report
  return u.hostname === 'github.com' && ((authority === 'openrouter' && u.pathname.startsWith('/OpenRouterTeam/')) || (authority === 'openai' && u.pathname.startsWith('/openai/')) || (authority === 'anthropic' && u.pathname.startsWith('/anthropics/')) || (authority === 'google-ai-studio' && (u.pathname.startsWith('/google/') || u.pathname.startsWith('/google-gemini/'))))
}
const exactClaims = new Map()
for (const rule of rules) {
  const authority = c.PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1.find(a => a.providerAuthorityId === rule.providerAuthorityId)
  if (!authority?.executionBindings.some(b => b.endpointProfileKind === rule.endpointProfileId)) {
    throw new Error(`Unregistered authority/profile: ${rule.ruleId}`)
  }
  if (!rule.evidence || rule.evidence.derivation !== null) throw new Error(`Missing/direct evidence policy: ${rule.ruleId}`)
  for (const ref of [rule.evidence.evidenceSourceRef, rule.evidence.identityEvidenceSourceRef]) {
    if (!refs.has(ref)) throw new Error(`Unresolved evidence ref ${ref} in ${rule.ruleId}`)
    if (!firstParty(refs.get(ref).url, rule.providerAuthorityId)) throw new Error(`Not reviewed first-party Rule authority: ${ref}`)
  }
  if (!rule.evidence.provenanceUrl || !firstParty(rule.evidence.provenanceUrl, rule.providerAuthorityId)) throw new Error(`Missing first-party provenance: ${rule.ruleId}`)
  if (rule.priority !== 0 || rule.configured !== 'default') throw new Error(`Unreviewed nondefault rule baseline: ${rule.ruleId}`)
  if (rule.selector.kind === 'exact') {
    for (const model of rule.selector.nativeModelIds) {
      if (!inventories.get(rule.providerAuthorityId)?.has(model)) throw new Error(`Unrecorded exact model identity: ${model}`)
      const audit = finalDecisions.filter(d => d.candidateRuleId === rule.ruleId && d.nativeModelId === model && d.providerAuthorityId === rule.providerAuthorityId && d.endpointProfileId === rule.endpointProfileId && d.canonicalPath === rule.assertion.path)
      if (audit.length !== 1 || !['RULE_CANDIDATE', 'REDUNDANT_BUT_USEFUL'].includes(audit[0].classification) || c.canonicalSourceFactDigestV1(c.canonicalizeCanonicalFactValueV1(rule.assertion.path, audit[0].canonicalValue)) !== c.canonicalSourceFactDigestV1(rule.assertion.value)) throw new Error(`No unique approved fact/model/path/value link: ${rule.ruleId} / ${model}`)
      if (audit[0].classification === 'REDUNDANT_BUT_USEFUL' && !audit[0].reason.startsWith('COORDINATOR REDUNDANCY APPROVAL:')) throw new Error(`No concrete redundancy approval: ${rule.ruleId}`)
      if (['INFERRED_MEDIUM', 'INFERRED_LOW'].includes(audit[0].coverageBasis)) throw new Error(`Low confidence inclusion: ${rule.ruleId}`)
      if (audit[0].coverageBasis === 'INFERRED_HIGH' && !manual.inferences.some(i => i.factId === audit[0].factId && i.nativeModelId === model && i.verdict === 'APPROVE_INFERRED_HIGH')) throw new Error(`Unapproved high inference: ${rule.ruleId}`)
      const key = JSON.stringify([rule.providerAuthorityId, rule.endpointProfileId, model, rule.assertion.path])
      const value = c.canonicalSourceFactDigestV1(rule.assertion.value)
      if (exactClaims.has(key)) throw new Error(`Duplicate or conflicting exact model/path: ${rule.ruleId}; ${exactClaims.get(key).ruleId}`)
      exactClaims.set(key, { value, ruleId: rule.ruleId })
    }
  }
}
const overlaps = []
if (rules.some(r => r.selector.kind === 'regex')) throw new Error('No future-series-safe regex received coordinator approval in this research run')
for (const rule of rules.filter(r => r.selector.kind === 'regex')) {
  const re = new RegExp(rule.selector.pattern, 'u')
  for (const [key, claim] of exactClaims) {
    const [authority, profile, model, factPath] = JSON.parse(key)
    if (authority === rule.providerAuthorityId && profile === rule.endpointProfileId &&
      factPath === rule.assertion.path && re.test(model)) overlaps.push({ regex: rule.ruleId, exact: claim.ruleId, model })
  }
}
if (overlaps.length) throw new Error(`Unresolved regex/exact overlap: ${JSON.stringify(overlaps)}`)
const result = { status: 'PASS', checkedAt: new Date().toISOString(), input: path.relative(researchRoot,input).replaceAll('\\','/'), corpusArtifactSha256: createHash('sha256').update(await readFile(input)).digest('hex'), packCount: packs.length, ruleCount: rules.length,
  exactRuleCount: rules.filter(r => r.selector.kind === 'exact').length,
  regexRuleCount: rules.filter(r => r.selector.kind === 'regex').length,
  exactModelPathClaims: exactClaims.size, evidenceRecords: ledger.length,
  validation: 'Current Rule/Pack/ownership decoder; canonical values; global IDs; registered provider/profile pairs; recorded exact identities; non-null first-party direct evidence; unique approved fact/model/path/value links; explicit redundancy and high-inference approvals; baselines; duplicate/overlap exclusion.',
  boundary: 'Artifact hash is integrity only, not release contentRevision. No release envelope; no database; no materialization publication or Apply.' }
await writeFile(path.join(researchRoot,'final/validation-result.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result, null, 2))
