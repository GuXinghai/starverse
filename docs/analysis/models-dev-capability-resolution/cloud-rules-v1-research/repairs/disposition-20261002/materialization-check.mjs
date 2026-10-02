// Audit only. All writes stay beside this script; no DB, release or existing-artifact writes.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { loadResearchContracts, researchRoot, repoRoot } from '../../research-code.mjs'
const out = path.dirname(fileURLToPath(import.meta.url))
const read = async p => JSON.parse((await fs.readFile(path.join(researchRoot,p),'utf8')).replace(/^\uFEFF/u,''))
const c = await loadResearchContracts()
const built = await build({stdin:{contents:[
  "export * from './src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1.ts'",
  "export * from './src/next/generation-v2/model-facts/sourceSnapshotBuilderV1.ts'",
].join('\n'),resolveDir:repoRoot,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'})
const m = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const packs = await read('final/candidate-corpus.json')
const projected = c.projectCapabilityRuleOwnershipSnapshotV1({schemaVersion:1,ownership:'cloud',ownerId:'read-only-semantic-audit',packs})
const rows = (await read('final/fact-decisions.json')).rows
const selected = rows.filter(r=>r.candidateRuleId)
const key = r=>JSON.stringify([r.providerAuthorityId,r.endpointProfileId,r.nativeModelId,r.canonicalPath])
const subjects = [...new Map(selected.map(r=>[JSON.stringify([r.providerAuthorityId,r.endpointProfileId,r.nativeModelId]),{
  providerAuthorityId:r.providerAuthorityId,endpointProfileId:r.endpointProfileId,nativeModelId:r.nativeModelId,
}])).values()]
// Synthetic exact subjects exercise matching only. This is not account membership evidence.
const payload = {schemaVersion:1,authoritativeSubjectSetRevision:'authoritative-model-subject-set-v1:'+'0'.repeat(64),subjects,
  defaultActivationPolicies:{cloud:'enabled',user:'disabled'},ownershipSnapshots:[{snapshotRevision:projected.snapshotRevision,snapshot:projected.definition}]}
const raw = c.sanitizeRawSourcePayloadV1({recordKey:'read-only-audit-fixture',payload})
const rawSnapshot = c.buildRawSourceSnapshotRefV1({sourceKind:'capability_rule',sourceScopeId:'read-only-audit-fixture',recordSetCompleteness:'complete',rawEnvelopeRefs:[raw.ref]})
const adapter = m.createMaterializedCapabilityRuleSourceAdapterV1({rawPayloadReader:{readRawPayload:()=>raw.persistedPayload}})
const publication = m.buildEnumerableSourcePublicationV1({adapter,rawSnapshot})
const claims = publication.subjectFacts.flatMap(e=>e.payload.outcomes.filter(o=>o.currentObservation.kind==='present_valid').map(o=>({
  ...e.payload.subject,canonicalPath:o.path,value:o.currentObservation.assertion.value,
  ruleId:o.currentObservation.assertion.provenance.ruleClaim.ruleId,
  evidenceRefs:o.currentObservation.assertion.provenance.evidenceRefs,
  assertionKind:o.currentObservation.assertion.provenance.assertionKind,
})))
const expected = new Map(selected.map(r=>[key(r),r]))
const problems = []; const observed = new Set()
for(const claim of claims){
  const k=key(claim), r=expected.get(k)
  if(observed.has(k)) problems.push({kind:'duplicate_materialized_claim',claim})
  observed.add(k)
  if(!r || claim.ruleId!==r.candidateRuleId || c.canonicalSourceFactDigestV1(claim.value)!==c.canonicalSourceFactDigestV1(c.canonicalizeCanonicalFactValueV1(r.canonicalPath,r.canonicalValue))) problems.push({kind:'materialization_mismatch',claim,row:r})
}
for(const [k,r] of expected) if(!observed.has(k)) problems.push({kind:'missing_materialized_claim',row:r})
const normalizations=[]
for(const provider of ['gemini','deepseek','openai','anthropic','openrouter']){
  const document=await read(`facts/${provider}.json`)
  for(const fact of Array.isArray(document)?document:document.facts){
    if(fact.canonicalValue===null||!c.isCanonicalSemanticPathV1(fact.canonicalPath)) continue
    const normalized=c.canonicalizeCanonicalFactValueV1(fact.canonicalPath,fact.canonicalValue)
    if(JSON.stringify(normalized)!==JSON.stringify(fact.canonicalValue)) normalizations.push({provider,factId:fact.factId,path:fact.canonicalPath,rawValue:fact.canonicalValue,normalizedValue:normalized})
  }
}
const schemaProbes=[]
for(const p of ['modalities.output','reasoning.modes.nativeValues','reasoning.effort.nativeValues','generation.effort.nativeValues']){
  const value=p==='modalities.output'?{kind:'media_kind_set',values:['text'],completeness:'partial'}:{kind:'native_string_set',values:['disabled'],completeness:'partial'}
  try{c.canonicalizeCanonicalFactValueV1(p,value);schemaProbes.push({path:p,value,accepted:true})}catch(e){schemaProbes.push({path:p,value,accepted:false,error:e.message})}
}
await fs.writeFile(path.join(out,'normalization-audit.json'),JSON.stringify(normalizations,null,2)+'\n')
await fs.writeFile(path.join(out,'materialized-claims.jsonl'),claims.map(v=>JSON.stringify(v)).join('\n')+'\n')
const result={status:problems.length?'FAIL':'PASS',packCount:packs.length,ruleCount:packs.reduce((n,p)=>n+p.rules.length,0),syntheticExactSubjects:subjects.length,selectedRows:selected.length,materializedClaims:claims.length,uniqueMaterializedClaims:observed.size,problems,schemaProbes,
 boundary:'Pure current decoder and actual materialization adapter in memory, with synthetic supplied subjects. No DB writes, account membership proof, stored source pointer, release construction, publication or Apply. Per-member research inference is not derivation metadata; assertionKind explicit means direct Rule assertion.'}
await fs.writeFile(path.join(out,'materialization-validation.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
