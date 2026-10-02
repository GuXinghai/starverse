// Coordinator-owned research audit assembly. Explicit inclusion policy below;
// this does not apply a Rule, create subjects, or construct a release envelope.
import fs from 'node:fs/promises'
import path from 'node:path'
import { researchRoot, loadResearchContracts } from './research-code.mjs'

const providers = ['gemini', 'deepseek', 'openai', 'anthropic', 'openrouter']
const external = process.argv[2]
if (!external) throw new Error('Expected directory containing saved adapter observations')
const read = async p => JSON.parse((await fs.readFile(p, 'utf8')).replace(/^\uFEFF/u, ''))
const write = async (p, value) => fs.writeFile(path.join(researchRoot, p), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n')
const c = await loadResearchContracts()
const normalizedValue = (factPath, value) => value === null || !c.isCanonicalSemanticPathV1(factPath) ? value : c.canonicalizeCanonicalFactValueV1(factPath, value)
const md = await read(path.join(external, 'models-dev-canonical-observations.json'))
const native = await read(path.join(external, 'openrouter-native-canonical-observations.json'))
const manual = await read(path.join(researchRoot, 'final/manual-review.json'))
const observation = (snapshot, authority, model, factPath) => snapshot.subjects.find(s => s.subject.providerAuthorityId === authority && s.subject.nativeModelId === model)?.outcomes.find(o => o.path === factPath) ?? { state: 'exact_subject_or_path_missing', value: null }
const id = m => typeof m === 'string' ? m : m.nativeModelId
const ids = f => [...new Set(['explicitModels', 'inferredHighModels', 'inferredMediumModels', 'inferredLowModels'].flatMap(k => (f[k] ?? []).map(id)))]
const basis = (f, m) => (f.inferredHighModels ?? []).map(id).includes(m) ? 'INFERRED_HIGH' : (f.inferredMediumModels ?? []).map(id).includes(m) ? 'INFERRED_MEDIUM' : (f.inferredLowModels ?? []).map(id).includes(m) ? 'INFERRED_LOW' : 'EXPLICIT_MODEL'
const flatRules = x => Array.isArray(x) ? x.flatMap(v => v.rules ?? [v]) : x.rules ?? x.packs?.flatMap(p => p.rules) ?? []
const manifests = { gemini: 'gemini-models-v1beta', deepseek: 'deepseek-stable-models-v1', openai: 'openai-models-v1', anthropic: 'anthropic-models-2023-06-01', openrouter: 'openrouter-chat-models-v1' }
const semanticHolds = {
  'anthropic-v1-current-input': 'More informative documented PDF partial input claim covers this subset; avoid overlapping collections.',
  'anthropic-v1-current-output': 'Duplicate of documented all-active complete text output claim.',
  'anthropic-v1-mythos51-output': 'Duplicate of all-active complete text output claim.',
  'anthropic-v1-opus45-output': 'Duplicate of all-active complete text output claim.',
  'anthropic-v1-current-tool-calling': 'Duplicate of all-active tool-calling support claim.',
}
const previews = /(?:preview|experimental|(?:^|[-/:])exp(?:$|[-/:])|auto-beta)/u
const research = [], rows = [], decisions = [], packs = [], overlapAudit = [], sourceConflicts = [], allInferences = [], regexAudits = [], inventories = {}
const claims = new Map()
for (const p of providers) {
  const document = await read(path.join(researchRoot, `facts/${p}.json`))
  const facts = Array.isArray(document) ? document : document.facts
  const proposals = flatRules(await read(path.join(researchRoot, `candidates/${p}.json`)))
  const ledger = (await fs.readFile(path.join(researchRoot, `evidence/${p}.jsonl`), 'utf8')).replace(/^\uFEFF/u, '').split(/\r?\n/u).filter(Boolean).map(JSON.parse)
  const refs = new Map(ledger.map(e => [e.evidenceId, e]))
  const inventory = p === 'openrouter' ? (await read(path.join(researchRoot, 'evidence/openrouter-models-all-public-snapshot.json'))).data.map(v => ({ nativeModelId: v.id, status: 'public_catalog_advertisement', expirationDate: v.expiration_date ?? null })) : document.inventory ?? document.modelInventory ?? []
  inventories[p] = inventory
  sourceConflicts.push(...(document.conflicts ?? document.sourceConflicts ?? []).map(v => ({ provider: p, ...v })))
  sourceConflicts.push(...(document.officialSourceConflicts ?? []).map(v => ({ provider: p, ...v })))
  if (p === 'openrouter') sourceConflicts.push(...(await read(path.join(researchRoot, 'evidence/openrouter-conflict-audit.json'))).conflicts.map(v => ({ provider: p, ...v })))
  sourceConflicts.push(...facts.filter(f=>f.sourceConflictAudit).map(f=>({provider:p,factId:f.factId,...f.sourceConflictAudit})))
  allInferences.push(...(document.inferenceAudits ?? document.inferenceAudit ?? []).map(v => ({ provider: p, ...v })))
  allInferences.push(...facts.flatMap(f => (f.inferenceAudits ?? []).map(v => ({ provider: p, factId: f.factId, canonicalPath: f.canonicalPath, ...v, coordinatorVerdict: manual.inferences.find(i => i.factId === f.factId && i.nativeModelId === v.nativeModelId)?.verdict ?? 'DEFER_NOT_APPROVED' }))))
  regexAudits.push(...(document.regexAudits ?? document.regexAudit ?? document.regexAnalysis ?? []).map(v => ({ provider: p, ...v })))
  const mappingPaths = new Set(c.PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1[manifests[p]].mappings.map(m => m.canonicalPath))
  const accepted = []
  for (const rawFact of facts) {
    const f = { ...rawFact, canonicalValue: normalizedValue(rawFact.canonicalPath, rawFact.canonicalValue) }
    const proposalRules = proposals.filter(r => (f.proposedRuleIds ?? []).includes(r.ruleId))
    const covered = ids(f)
    const sourceRecords = f.evidenceRefs.map(ref => refs.get(ref)).filter(Boolean)
    for (const model of covered.length ? covered : [null]) {
      let classification = f.classification
      let reason = 'Provider research classification retained after coordinator review; see first-party evidence references.'
      const matching = model ? proposalRules.filter(r => r.selector.kind === 'exact' && r.selector.nativeModelIds.includes(model)) : []
      let rule = matching[0] ?? null
      const inv = (Array.isArray(inventory) ? inventory : inventory.currentPrimary ?? []).find(v => id(v) === model)
      const perModel = (f.perModelTemporal ?? []).find(v => v.nativeModelId === model)
      const temporal = { temporalClass: inv?.temporalClass ?? 'unknown', validFrom: inv?.releaseDate ?? null, validThrough: inv?.expirationDate ?? inv?.retirementDate ?? inv?.shutdownDate ?? null, recheckAfter: null, deprecatedAfter: inv?.deprecatedAfter ?? null, supersededBy: inv?.supersededBy ?? null, ...f.temporalAssessment, ...perModel }
      if (inv?.expirationDate || inv?.retirementDate || inv?.shutdownDate) temporal.validThrough ??= inv.expirationDate ?? inv.retirementDate ?? inv.shutdownDate
      if (/deprecated|retired|shutdown/iu.test(inv?.status ?? '')) temporal.temporalClass = 'deprecation_bound'
      const evidenceTemporal = sourceRecords.some(e => e.temporalClass === 'preview')
      const isDeprecated = temporal.temporalClass === 'deprecation_bound' || /deprecated|retired|shutdown/iu.test(inv?.status ?? '') || Boolean(inv?.expirationDate)
      const isPreview = temporal.temporalClass === 'preview' || (model && previews.test(model)) || evidenceTemporal
      const mdObservation = model ? observation(md, f.providerAuthorityId, model, f.canonicalPath) : { state: 'no_exact_claim', value: null }
      const nativeObservation = p === 'openrouter' && model ? observation(native, f.providerAuthorityId, model, f.canonicalPath) : { state: mappingPaths.has(f.canonicalPath) ? 'mapped_if_payload_supplies_UNOBSERVED' : 'not_mapped', value: null }
      const coverageBasis = model ? basis(f, model) : 'NO_MODEL_COVERAGE'
      if (classification === 'RULE_CANDIDATE' || classification === 'REDUNDANT_BUT_USEFUL') {
        if (manual.factHolds?.[f.factId]) { classification = manual.factHolds[f.factId].classification; reason = manual.factHolds[f.factId].reason; rule = null }
        else if (!rule && f.supersededCandidateRuleIds?.length) { classification = 'REDUNDANT_BUT_USEFUL'; reason = f.ruleOmittedReason ?? 'Superseded by a more informative or duplicate provider fact; retained for traceability without an additional Rule.' }
        else if (!rule) { classification = 'AMBIGUOUS_DEFER'; reason = 'No complete provider proposal linked to this fact/model; no direct webpage-to-final Rule conversion.' }
        else if (semanticHolds[rule.ruleId]) { classification = 'REDUNDANT_BUT_USEFUL'; reason = semanticHolds[rule.ruleId]; rule = null }
        else if (isPreview || isDeprecated || temporal.temporalClass === 'time_limited') { classification = 'TEMPORALLY_UNSAFE'; reason = 'First corpus excludes preview, deprecated and time-limited coverage until Owner lifecycle approval; recheck required.'; rule = null }
        else if (p === 'openai' && f.canonicalPath === 'modalities.input' && f.canonicalValue?.completeness === 'complete') { classification = 'AMBIGUOUS_DEFER'; reason = 'Native modality table is not exhaustive of canonical PDF/file input support; complete set would overstate exclusions.'; rule = null }
        else if (p === 'gemini' && (f.canonicalPath?.startsWith('reasoning.effort.') || f.canonicalPath === 'reasoning.budgetTokens.domain')) { classification = 'ONTOLOGY_GAP'; reason = 'ThinkingLevel and sentinel-bearing budget wire semantics need the deferred semantic/source vertical slice; decoder acceptance alone does not approve projection.'; rule = null }
        else if (p === 'anthropic' && ['contextManagement.support', 'contextManagement.actions.nativeValues'].includes(f.canonicalPath)) { classification = 'TEMPORALLY_UNSAFE'; reason = 'Beta header, strategy and model-version conditions require lifecycle/execution review before first corpus inclusion.'; rule = null }
        else if (p === 'openai' && /-latest$/u.test(model ?? '')) { classification = 'TEMPORALLY_UNSAFE'; reason = 'Floating latest identity needs Owner lifecycle review and target recheck before first release.'; rule = null }
        else if (coverageBasis === 'INFERRED_MEDIUM' || coverageBasis === 'INFERRED_LOW') { classification = 'AMBIGUOUS_DEFER'; reason = 'Confidence below official corpus threshold.'; rule = null }
        else if (coverageBasis === 'INFERRED_HIGH' && !manual.inferences.some(v => v.factId === f.factId && v.nativeModelId === model && v.verdict.startsWith('APPROVE_INFERRED_HIGH'))) { classification = 'AMBIGUOUS_DEFER'; reason = 'No independent coordinator high-inference approval.'; rule = null }
        else {
          reason = classification === 'REDUNDANT_BUT_USEFUL' ? 'COORDINATOR REDUNDANCY APPROVAL: Anthropic has no models.dev registry binding; documented exact fallback supplies missing/null Native metadata and preserves direct API provenance. This is potential fallback, not verified local absence.' : 'Approved exact first-party documented assertion filling an observed models.dev gap or an unmapped canonical path; source disagreements remain visible.'
        }
      } else rule = null
      if (rule && classification === 'RULE_CANDIDATE' && mdObservation.state === 'present_valid' && c.canonicalSourceFactDigestV1(mdObservation.value) === c.canonicalSourceFactDigestV1(f.canonicalValue) && p !== 'openrouter') {
        classification = 'ALREADY_MODELS_DEV'; reason = 'Current real adapter public snapshot already supplies equal value; additional Rule adds little value.'; rule = null
      }
      const claimKey = JSON.stringify([f.providerAuthorityId, f.endpointProfileId, model, f.canonicalPath])
      if (rule && claims.has(claimKey)) {
        const previous = claims.get(claimKey)
        const same = c.canonicalSourceFactDigestV1(previous.value) === c.canonicalSourceFactDigestV1(f.canonicalValue)
        overlapAudit.push({ provider: p, model, path: f.canonicalPath, ruleA: previous.ruleId, ruleB: rule.ruleId, sameValue: same, disposition: same ? 'deduplicate identical assertion' : 'hold later overlapping assertion for review' })
        classification = same ? 'REDUNDANT_BUT_USEFUL' : 'AMBIGUOUS_DEFER'; reason = same ? 'Duplicate exact assertion already covered by selected Rule; no second fallback benefit.' : 'Overlapping unequal assertion; no implicit source choice or union.'; rule = null
      }
      if (rule) {
        claims.set(claimKey, { ruleId: rule.ruleId, value: f.canonicalValue })
        const existing = accepted.find(r => r.ruleId === rule.ruleId)
        if (existing) existing.selector.nativeModelIds.push(model)
        else { const copy = structuredClone(rule); copy.selector = { kind: 'exact', nativeModelIds: [model] }; copy.assertion.value = f.canonicalValue; if (coverageBasis === 'INFERRED_HIGH') copy.evidence.evidenceNote = copy.evidence.evidenceNote.replace(/coordinator approval pending/iu, 'independently reviewed and approved in final/manual-review.json'); accepted.push(copy) }
      }
      const conflict = model && mdObservation.state === 'present_valid' && f.canonicalValue && c.canonicalSourceFactDigestV1(mdObservation.value) !== c.canonicalSourceFactDigestV1(f.canonicalValue)
      const row = { provider: p, factId: f.factId, providerAuthorityId: f.providerAuthorityId, endpointProfileId: f.endpointProfileId, nativeModelId: model, canonicalPath: f.canonicalPath, canonicalValue: f.canonicalValue,
        originalClassification: f.classification, classification, reason, candidateRuleId: rule?.ruleId ?? null, coverageBasis,
        providerNative: nativeObservation, modelsDev: mdObservation, temporalAssessment: temporal,
        conflictStatus: conflict ? 'SOURCE_VALUE_DISAGREEMENT_OR_COMPLETENESS_DIFFERENCE' : 'none_observed', evidenceRefs: f.evidenceRefs, officialSources: sourceRecords.map(e=>({ evidenceId:e.evidenceId,url:e.url,retrievedAt:e.retrievedAt,updatedAt:e.updatedAt,apiSurface:e.apiSurface })),
        remainingGap: rule ? 'Native/current local state unverified; no automatic override or execution guarantee.' : f.ambiguityNotes ?? f.modelCoverageRationale }
      rows.push(row)
    }
    research.push({ provider: p, ...f })
  }
  accepted.sort((a, b) => a.ruleId.localeCompare(b.ruleId))
  if (accepted.length) packs.push({ schemaVersion: 1, packId: `research.${p}.documented-gaps.v1`, displayName: `${p} documented gaps — research candidate`, description: 'Coordinator-reviewed research candidate; not an official release. Exact documented coverage only; publication requires fresh subject/source and lifecycle review.', priority: 0, mode: 'no_control', target: 'enabled', rules: accepted })
  decisions.push({ provider: p, evidenceRecords: ledger.length, factRecords: facts.length, proposedRuleCount: proposals.length, approvedRuleCount: accepted.length, classifications: rows.filter(r => r.provider === p).reduce((a, r) => (a[r.classification] = (a[r.classification] ?? 0) + 1, a), {}) })
}
await write('final/candidate-corpus.json', packs)
await write('final/model-inventories.json', inventories)
await write('final/fact-decisions.json', { purpose: 'Definitive coordinator classifications at exact-model/path granularity; provider files retain original proposals', policy: 'Conservative first corpus; no preview/deprecated/beta or unapproved inference; never alter production semantics', rows })
await write('final/audit-summary.json', { decisions, packInventory: packs.map(p => ({ packId: p.packId, provider: p.rules[0].providerAuthorityId, rules: p.rules.length, paths: p.rules.reduce((a,r)=>(a[r.assertion.path]=(a[r.assertion.path]??0)+1,a),{}) })), overlaps: overlapAudit, providerDocumentConflicts: sourceConflicts, inferenceAudits: allInferences, regexAudits, inventoryCounts: Object.fromEntries(Object.entries(inventories).map(([p, i])=>[p, Array.isArray(i) ? i.length : null])) })
await write('final/models-dev-observations.json', JSON.stringify(md)+'\n')
await write('final/openrouter-native-observations.json', JSON.stringify(native)+'\n')
const cell = v => String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ')
const table = (headers, data) => `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${data.map(row=>`| ${row.map(cell).join(' | ')} |`).join('\n')}\n`
const lines = rows.map(r=>[r.provider, r.endpointProfileId, r.nativeModelId ?? '(API concept)', r.canonicalPath ?? '(no canonical path)', `${r.providerNative.state}: ${JSON.stringify(r.providerNative.value)}`, `${r.modelsDev.state}: ${JSON.stringify(r.modelsDev.value)}`, r.candidateRuleId ? `yes ${r.candidateRuleId}; ${JSON.stringify(r.canonicalValue)}` : 'no', r.coverageBasis, r.temporalAssessment.temporalClass, r.conflictStatus, r.classification, r.remainingGap])
await write('final/coverage-matrix.md', '# Exact model/path coverage matrix\n\nPublic snapshots transformed by current real adapters in memory; this is not local database or runtime observation. Native mappings without a fetched payload are explicitly unobserved. Missing is unknown, never unsupported. All candidate and deferred model/path rows are also in fact-decisions.json. An API-concept row with no model ID is not Rule coverage.\n\n'+table(['Provider','API/profile','Exact model','Canonical path','Provider Native state/value','models.dev state/value','Cloud candidate/value','Coverage basis','Temporal','Conflict','Disposition','Remaining gap'], lines))
const deferred = rows.filter(r=>['AMBIGUOUS_DEFER','TEMPORALLY_UNSAFE'].includes(r.classification))
await write('final/deferred.md', '# Deferred assertions\n\nNo rows here enter the candidate corpus. Silence, prefix similarity, missing parameters, rounded labels and conventional gateway defaults never become unsupported or exact model facts. Partial bounds do not establish missing upper bounds.\n\n'+table(['Provider','Fact','Model','Path','Classification','Basis','Reason','Evidence refs'], deferred.map(r=>[r.provider,r.factId,r.nativeModelId,r.canonicalPath,r.classification,r.coverageBasis,r.reason+' '+cell(r.remainingGap),r.evidenceRefs])))
const gaps = rows.filter(r=>r.classification==='ONTOLOGY_GAP')
await write('final/ontology-gaps.md', '# Ontology and projection gaps\n\nResearch only. No canonical path, adapter or projection changes are implemented. Proposed future concepts below are questions, not accepted schema designs.\n\n'+table(['Provider','Model','Official concept / current path','Official sources','Why current contract is insufficient','Future direction'], gaps.map(r=>[r.provider,r.nativeModelId,r.canonicalPath??r.factId,r.officialSources.map(s=>s.url),r.reason+' '+cell(r.remainingGap),'Operation/condition-aware facts or distinct native control semantics; Owner design decision required.'])))
await write('final/conflict-audit.md', '# Conflict and overlap audit\n\nCloud priority remains default/zero. A different higher-priority Native/models.dev value is not automatically corrected by a fallback Rule. Different partial sets are not automatically incompatible; final corpus avoids overlapping exact model/path assertions. No inferred union or priority increase resolves a disagreement.\n\n## Provider documents\n\n'+table(['Provider','Conflict record'],sourceConflicts.map(r=>[r.provider,r]))+'\n## Proposal overlap decisions\n\n'+table(['Provider','Model','Path','Rule A','Rule B','Same value','Disposition'], overlapAudit.map(r=>[r.provider,r.model,r.path,r.ruleA,r.ruleB,r.sameValue,r.disposition]))+'\n## Public models.dev disagreements\n\n'+table(['Provider','Model','Path','Official candidate value','Observed models.dev','Final classification','Disposition'],rows.filter(r=>r.conflictStatus!=='none_observed').map(r=>[r.provider,r.nativeModelId,r.canonicalPath,r.canonicalValue,r.modelsDev.value,r.classification,r.reason])))
const temporal = ['stable','preview','version_bound','deprecation_bound','time_limited','unknown'].map(group=>`## ${group}\n\n`+table(['Provider','Fact','Model','End/deprecated date','Recheck','Superseding model/version','Publication block','Flag'], rows.filter(r=>r.temporalAssessment.temporalClass===group).map(r=>[r.provider,r.factId,r.nativeModelId,r.temporalAssessment.validThrough??r.temporalAssessment.deprecatedAfter??'unknown',r.temporalAssessment.recheckAfter??'before publication',r.temporalAssessment.supersededBy??'unknown',r.classification==='TEMPORALLY_UNSAFE'?'yes — Owner lifecycle review':r.candidateRuleId?'fresh source/subject check required':'not selected',group==='stable'?'source recheck before publication':'REQUIRES_EXPIRY_REVIEW']))).join('\n')
await write('final/temporal-audit.md', '# Temporal audit\n\nAs-of 2026-10-02; Rules have no invented expiry field. Dates/flags remain research metadata. Preview/deprecated/time-limited and beta lifecycle coverage is excluded from this first-corpus recommendation. A pinned version still needs an expiry/replacement recheck. Unknown end dates mean unknown, not permanent validity. Detailed inventory lifecycle records remain in provider fact documents.\n\n'+temporal)
await write('final/inference-audit.md', '# Coordinator inference and regex audit\n\nIdentity grammar and capability inheritance were reviewed separately. No final regex is approved: dated naming establishes syntax but not this assertion’s future stability. Gemini dated/previews have documented retirements/changed limits; OpenAI snapshots warn that context can differ; Anthropic modern dateless IDs are pinned; DeepSeek aliases switch serving versions; OpenRouter IDs, routes and variants do not establish upstream inheritance. All final selectors are KNOWN_MEMBERS_ONLY exact lists.\n\n## Independent coordinator verdicts\n\n'+table(['Model / fact','Verdict','Full rationale'],manual.inferences.map(r=>[`${r.nativeModelId} / ${r.factId}`,r.verdict,r]))+'\n## Provider inference records, including deferred expansions\n\n'+table(['Provider','Audit'],allInferences.map(r=>[r.provider,r]))+'\n## Provider per-series regex reviews\n\n'+table(['Provider','Audit'],regexAudits.map(r=>[r.provider,r]))+'\n## Every researched inferred model/path\n\n'+table(['Provider','Model','Path','Basis','Coordinator verdict','Reason'],rows.filter(r=>/INFERRED/gu.test(r.coverageBasis)).map(r=>[r.provider,r.nativeModelId,r.canonicalPath,r.coverageBasis,r.candidateRuleId?'APPROVED_FINAL':r.classification,r.reason])))
console.log(JSON.stringify({ packs: packs.length, rules: packs.reduce((n,p)=>n+p.rules.length,0), modelPathRows: rows.length, decisions },null,2))
