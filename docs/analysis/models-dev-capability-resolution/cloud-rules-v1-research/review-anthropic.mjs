// Coordinator decisions after independent official-page review on 2026-10-02.
// Preserves provider facts; no schema, source authority, or application change.
import fs from 'node:fs/promises'
import path from 'node:path'
import { researchRoot } from './research-code.mjs'
const read = async p => JSON.parse(await fs.readFile(path.join(researchRoot,p),'utf8'))
const data = await read('facts/anthropic.json')
const manual = await read('final/manual-review.json')
const ledger = (await fs.readFile(path.join(researchRoot,'evidence/anthropic.jsonl'),'utf8')).trim().split(/\r?\n/u).map(JSON.parse)
const urls = new Map(ledger.map(e=>[e.evidenceId,e.url]))
const holdReasons = {
  'anthropic-F-opus5-optional': 'Opus 5 disabled thinking depends on selected effort. An unconditional required=false claim loses that dependency; defer the scalar until conditional projection review.',
  'anthropic-F-opus5-toggle': 'Opus 5 rejects disabled thinking at xhigh/max. The model-level scalar does not retain this dependency; defer before publication.',
  'anthropic-F-sonnet55-modes': 'between_tools is restricted to high or lower effort and rejects additional thinking fields. Hold the complete model-level domain until conditional execution semantics are reviewed.',
  'anthropic-F-legacy-temperature-support': 'Legacy sampling is accepted with thinking off and rejected with thinking on. Preserve the documented conditional fact without emitting an unconditional control assertion.',
  'anthropic-F-legacy-temperature-default': 'Default applies to legacy Messages sampling when applicable. Thinking-mode dependency needs review before it becomes an unconditional model default.',
  'anthropic-F-legacy-temperature-max': 'Accepted maximum applies with thinking disabled. Hold conditional model maximum until execution/projection review.',
  'anthropic-F-legacy-topk-support': 'Legacy top_k acceptance depends on thinking disabled. Hold the unconditional support scalar.',
  'anthropic-F-active-output': 'Intro documents text output support, but does not explicitly declare an exhaustive canonical output set. Preserve positive text evidence; hold the complete-set proposal.',
  'anthropic-F-context-editing': 'Context editing requires beta execution headers and action/model conditions; hold for Owner lifecycle review.',
  'anthropic-F-context-actions': 'Context-management actions require beta headers; first-corpus publication held.',
  'anthropic-F-modern-context-actions': 'Editing and compaction action union requires their respective beta headers; first-corpus publication held.',
  'anthropic-F-compaction-action': 'Separate beta compaction surface; no standalone complete provider Rule proposal and no first-corpus lifecycle approval.',
}
// These reviewed positive subsets no longer assert the former complete domains.
for (const factId of ['anthropic-F-active-output','anthropic-F-sonnet55-modes']) {
  const fact = data.facts.find(f=>f.factId===factId)
  if (fact?.repairId === 'disposition-20261002' && fact.canonicalValue?.completeness === 'partial') {
    delete holdReasons[factId]
    delete manual.factHolds?.[factId]
  }
}
manual.factHolds = { ...(manual.factHolds ?? {}), ...Object.fromEntries(Object.entries(holdReasons).map(([factId,reason])=>[factId,{classification: /context|compaction/u.test(factId)?'TEMPORALLY_UNSAFE':'AMBIGUOUS_DEFER',reason}])) }
manual.inferences = manual.inferences.filter(v=>!v.factId.startsWith('anthropic-'))
for (const f of data.facts) for (const audit of f.inferenceAudits ?? []) {
  const inv=data.inventory.find(v=>v.nativeModelId===audit.nativeModelId)
  if(!inv) throw new Error('Inference lacks exact inventory identity: '+audit.nativeModelId)
  const lifecycle = inv.status!=='active'
  const held=holdReasons[f.factId]
  manual.inferences.push({factId:f.factId,nativeModelId:audit.nativeModelId,
    verdict:lifecycle?'DEFER_LIFECYCLE_REVIEW':held?'DEFER_CONDITIONAL_OR_INCOMPLETE_CLAIM':audit.classification==='INFERRED_MEDIUM'?'DEFER_INFERRED_MEDIUM':'APPROVE_INFERRED_HIGH',
    canonicalPath:f.canonicalPath,sourceClaim:audit.finalInferenceRationale,
    primarySource:urls.get(audit.primaryEvidence),identityBridge:urls.get('anthropic-E002'),
    corroboration:[...new Set([...f.evidenceRefs,...audit.corroboratingEvidence])].map(e=>urls.get(e)).filter(Boolean),
    explicitSiblings:audit.explicitlyDocumentedSiblingModels??[],exactIdentityTarget:audit.nativeModelId,documentedModelLabel:audit.nativeModelId.replace(/^claude-/u,'Claude ').replaceAll('-',' '),
    semanticSeries:audit.repairId==='disposition-20261002'&&audit.classification==='INFERRED_MEDIUM'?audit.sameSemanticSeriesRationale:'Known pinned release joined to its named compatibility row or a closed all-active quantifier; this is identity-to-document coverage, not sibling capability inheritance.',
    variantReview:'Only direct Claude API profile. No Bedrock/Vertex/Foundry inheritance, preview, convenience aliases, future members or gateway IDs. Mythos invitation access remains unverified; a Rule never creates entitlement or subjects.',
    exceptionSearch:'Independently checked current thinking matrix, output ceilings, effort availability/defaults, Messages sampling HTTP reference, structured/code compatibility, PDF/citations all-active quantifiers, batch/token-count restrictions, context guide and lifecycle/ID-versioning documentation.',
    temporalAssumption:`As of 2026-10-02; ${inv.status}; release ${inv.releaseDate ?? 'unknown'}; retirement ${inv.retirementDate ?? 'unknown'}. Recheck before publication and by 2026-10-16. Pinned weights do not freeze hosted infrastructure.`,
    rationale:lifecycle?'Exact identity is deprecated/retired; evidence review does not authorize first-corpus coverage.':held??(audit.repairId==='disposition-20261002'?audit.finalInferenceRationale:'Independent source review supports the bounded exact model/path assertion. Complete effort domains use explicit named availability; other sets stay partial. Context is total input plus output, not input maximum; technical Japanese decimal limits corroborate SI values. Output maxima are ordinary Messages ceilings, excluding the 300k Batches beta. No absence-to-unsupported inference.'),
    providerAudit:audit,
  })
}
manual.reviewedAt=new Date().toISOString()
manual.status='Independent coordinator review complete; every researched Anthropic model/path join has an explicit approval or deferral, including downgraded MEDIUM joins.'
await fs.writeFile(path.join(researchRoot,'final/manual-review.json'),JSON.stringify(manual,null,2)+'\n')
const independent=[
 ['structured','https://platform.claude.com/docs/en/build-with-claude/structured-outputs','Named compatibility supports exact released models; JSON and strict tools are distinct; citations plus strict JSON conflict is retained as an execution condition.'],
 ['code','https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool','Named compatibility includes Haiku base execution; Haiku REPL/programmatic restrictions do not negate base execution.'],
 ['citations','https://platform.claude.com/docs/en/build-with-claude/citations','Closed all-active support quantifier; deprecated Sonnet 4.5 excluded.'],
 ['pdf','https://platform.claude.com/docs/en/build-with-claude/pdf-support','Closed all-active PDF quantifier; retain partial input kinds and attachment support only, not arbitrary binary formats.'],
 ['intro','https://platform.claude.com/docs/en/intro','Current-model input/output/tool positives; text output alone does not establish exhaustive canonical output domain.'],
 ['effort','https://platform.claude.com/docs/en/build-with-claude/effort','Per-model availability provides exact generation-wide effort sets and defaults; Opus 5.5 medium, other compatible models high.'],
 ['thinking','https://platform.claude.com/docs/en/build-with-claude/thinking','Per-model matrix and output ceiling; sampling negative applies every request to named newer models. Opus 5 conditions, Sonnet 5.5 between_tools conditions and legacy sampling claims remain held; bounded Sonnet 5.5 adaptive can be represented as a positive partial subset.'],
 ['context-ja','https://platform.claude.com/docs/ja/build-with-claude/context-windows','Technical total-context limits specify 100万 and 20万 tokens; exact decimal conversion corroborates 1000000 and 200000; no input ceiling substituted.'],
 ['messages','https://platform.claude.com/docs/en/api/messages/create','Legacy temperature HTTP default/maximum1; conditional thinking restriction held. New top_k rejection differs in wording from guide; both prohibit tunable top_k.'],
 ['batch','https://platform.claude.com/docs/en/build-with-claude/batch-processing','All-active batch support; stream/speed/max_tokens0 restrictions retained outside partial operation support.'],
 ['count','https://platform.claude.com/docs/en/build-with-claude/token-counting','All-active count support; server tools and URL/file input exceptions do not negate operation existence.'],
 ['web','https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool','The retained known Opus/Sonnet scope is distinct from the four deferred Fable/Mythos joins; generic release taxonomy or shared specifications does not directly establish this capability-specific bridge. Organization/tool-version restrictions remain; no future inheritance.'],
 ['budget','https://platform.claude.com/docs/en/build-with-claude/extended-thinking','Minimum1024 is explicit; upper bound remains absent and request-dependent; partial_bounds retains that uncertainty.'],
 ['lifecycle','https://platform.claude.com/docs/en/about-claude/model-deprecations','Exact lifecycle inventory; deprecated/preview members and convenience aliases held.'],
 ['ids','https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions','Modern dateless IDs are pinned releases, older convenience aliases roll; infrastructure can change despite pinned weights.'],
]
const at=new Date().toISOString()
const file=path.join(researchRoot,'final/coordinator-evidence.jsonl')
const existing=(await fs.readFile(file,'utf8')).split(/\r?\n/u).filter(Boolean).map(JSON.parse).filter(e=>!e.evidenceId.startsWith('coordinator.anthropic.final.'))
await fs.writeFile(file,[...existing,...independent.map(([key,url,factSummary])=>({evidenceId:`coordinator.anthropic.final.${key}`,provider:'anthropic',url,sourceType:'official_docs',pageTitle:key,retrievedAt:at,publishedAt:null,updatedAt:null,apiSurface:'Direct Claude API',exactModelsNamed:[],seriesNamed:[],factSummary,canonicalPathCandidate:null,canonicalValueCandidate:null,temporalClass:'version_bound',validFrom:null,validThrough:null,recheckAfter:'2026-10-16',deprecatedAfter:null,supersededBy:null,contradictions:[],notes:'Root independent web review; provider per-model bridge and detailed exceptions remain in manual-review.json.'}))].map(e=>JSON.stringify(e)).join('\n')+'\n')
console.log(JSON.stringify({anthropicVerdicts:manual.inferences.filter(v=>v.factId.startsWith('anthropic-')).reduce((a,v)=>(a[v.verdict]=(a[v.verdict]??0)+1,a),{}),factHolds:Object.keys(holdReasons).length}))
