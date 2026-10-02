// Durable artifact integrity validation; uses pure current contracts, no DB.
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadResearchContracts, researchRoot } from './research-code.mjs'
const c=await loadResearchContracts()
const read=async p=>JSON.parse((await fs.readFile(path.join(researchRoot,p),'utf8')).replace(/^\uFEFF/u,''))
const providers=['gemini','deepseek','openai','anthropic','openrouter']
const classifications=new Set(['RULE_CANDIDATE','ALREADY_PROVIDER_NATIVE','ALREADY_MODELS_DEV','REDUNDANT_BUT_USEFUL','ONTOLOGY_GAP','AMBIGUOUS_DEFER','TEMPORALLY_UNSAFE'])
const evidenceKeys=['evidenceId','provider','url','sourceType','pageTitle','retrievedAt','publishedAt','updatedAt','apiSurface','exactModelsNamed','seriesNamed','factSummary','canonicalPathCandidate','canonicalValueCandidate','temporalClass','validFrom','validThrough','recheckAfter','deprecatedAfter','supersededBy','contradictions','notes']
const factKeys=['factId','providerAuthorityId','endpointProfileId','canonicalPath','canonicalValue','explicitModels','inferredHighModels','inferredMediumModels','inferredLowModels','regexCandidate','identityPatternConfidence','capabilityInheritanceConfidence','modelCoverageRationale','evidenceRefs','temporalAssessment','classification','ambiguityNotes']
const required=['README.md',...providers.flatMap(p=>[`providers/${p}.md`,`evidence/${p}.jsonl`,`facts/${p}.json`,`candidates/${p}.json`]),...['coverage-matrix.md','inference-audit.md','conflict-audit.md','temporal-audit.md','ontology-gaps.md','deferred.md','candidate-corpus.json','release-recommendation.md'].map(p=>'final/'+p)]
for(const p of required) await fs.access(path.join(researchRoot,p))
const allIds=new Set(), results=[]
for(const provider of providers){
 const evidence=(await fs.readFile(path.join(researchRoot,`evidence/${provider}.jsonl`),'utf8')).replace(/^\uFEFF/u,'').trim().split(/\r?\n/u).map(JSON.parse)
 const refs=new Set()
 for(const e of evidence){for(const k of evidenceKeys) if(!(k in e))throw new Error(`${provider} evidence ${e.evidenceId} missing ${k}`);if(allIds.has(e.evidenceId))throw new Error('Duplicate evidence '+e.evidenceId);allIds.add(e.evidenceId);refs.add(e.evidenceId);new URL(e.url);const dateOnly=e.retrievedAt===null&&/^\d{4}-\d{2}-\d{2}$/u.test(e.retrievedAtDate??'')&&/(?:date_only|clock_unavailable)/u.test(String(e.retrievalTimestampPrecision));const expectedProvider=provider==='gemini'?'google-ai-studio':provider;if(![provider,expectedProvider].includes(e.provider)||!Array.isArray(e.exactModelsNamed)||(!Number.isFinite(Date.parse(e.retrievedAt))&&!dateOnly))throw new Error('Invalid ledger metadata '+e.evidenceId)}
 const data=await read(`facts/${provider}.json`); const facts=Array.isArray(data)?data:data.facts
 const factsById=new Map()
 for(const f of facts){for(const k of factKeys)if(!(k in f))throw new Error(`${provider} fact ${f.factId} missing ${k}`);if(factsById.has(f.factId))throw new Error('Duplicate fact '+f.factId);factsById.set(f.factId,f);if(!classifications.has(f.classification))throw new Error('Invalid classification '+f.factId);for(const ref of f.evidenceRefs)if(!refs.has(ref))throw new Error('Unresolved fact reference '+ref)}
 const proposals=await read(`candidates/${provider}.json`)
 const rules=Array.isArray(proposals)?proposals.flatMap(p=>p.rules??[p]):proposals.rules??proposals.packs.flatMap(p=>p.rules)
 for(const r of rules){c.decodeCapabilityRuleCoreRuleV1(r);if(!facts.some(f=>(f.proposedRuleIds??[]).includes(r.ruleId)))throw new Error('Orphan proposal '+r.ruleId)}
 for(const p of Array.isArray(proposals)?proposals:proposals.packs??[])if(p.rules)c.decodeCapabilityRuleCorePackV1(p)
 results.push({provider,evidenceRecords:evidence.length,factRecords:facts.length,proposalRules:rules.length})
}
const summary=await read('final/audit-summary.json'),manual=await read('final/manual-review.json')
const rows=(await read('final/fact-decisions.json')).rows
for(const row of rows){if(!classifications.has(row.classification))throw new Error('Invalid final classification');if(row.candidateRuleId&&['preview','deprecation_bound','time_limited'].includes(row.temporalAssessment.temporalClass))throw new Error('Unsafe selected lifecycle '+row.candidateRuleId)}
const nested=summary.inferenceAudits.filter(v=>v.provider==='anthropic')
if(nested.length!==332||nested.some(v=>v.coordinatorVerdict==='PENDING'||!manual.inferences.some(i=>i.factId===v.factId&&i.nativeModelId===v.nativeModelId)))throw new Error('Incomplete Anthropic independent inference audit')
const result={status:'PASS',checkedAt:new Date().toISOString(),requiredArtifacts:required.length,providers:results,totalEvidenceRecords:allIds.size,totalFactRecords:results.reduce((n,r)=>n+r.factRecords,0),finalModelPathRows:rows.length,anthropicNestedInferenceAudits:nested.length,boundary:'Structure and traceability validation; semantic approval is recorded separately in manual-review and fact-decisions. No database or release operations.'}
await fs.writeFile(path.join(researchRoot,'final/research-validation-result.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
