// Research-only, pure decoder validation. Does not load the database or mutate files.
const fs = require('node:fs');
const path = require('node:path');
const ts = require(path.resolve('node_modules/typescript'));
require.extensions['.ts'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  mod._compile(output, filename);
};
const root = __dirname;
const core = require(path.resolve('src/next/generation-v2/capability-rules/capabilityRuleCoreV1.ts'));
const ontology = require(path.resolve('src/next/generation-v2/model-facts/canonicalSourceFactsV1.ts'));
const rules = JSON.parse(fs.readFileSync(path.join(root,'candidates/anthropic.json'),'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(root,'facts/anthropic.json'),'utf8'));
const evidence = fs.readFileSync(path.join(root,'evidence/anthropic.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const failures = [];
const ids = new Set();
const evidenceIds = new Set(evidence.map(x=>x.evidenceId));
const collisions = new Map();
for (const rule of rules) {
  try { core.decodeCapabilityRuleCoreRuleV1(rule); } catch(error) { failures.push({ruleId:rule.ruleId,code:error.code??error.message}); }
  if(ids.has(rule.ruleId)) failures.push({duplicateRuleId:rule.ruleId});
  ids.add(rule.ruleId);
  const facts = data.facts.filter(x=>x.proposedRuleIds.includes(rule.ruleId));
  if(facts.length!==1) failures.push({ruleId:rule.ruleId,factTraceCount:facts.length});
  if(!rule.evidence || !evidenceIds.has(rule.evidence.evidenceSourceRef)|| !evidenceIds.has(rule.evidence.identityEvidenceSourceRef)) failures.push({ruleId:rule.ruleId,evidenceTrace:'missing'});
  if(rule.providerAuthorityId!=='anthropic'||rule.endpointProfileId!=='anthropic-developer-api-2023-06-01') failures.push({ruleId:rule.ruleId,identity:'wrong scope'});
  for(const modelId of rule.selector.nativeModelIds??[]) {
    const inventory=data.inventory.find(x=>x.nativeModelId===modelId);
    if(!inventory || inventory.status==='retired'||inventory.status==='convenience_alias'||modelId==='claude-mythos-preview') failures.push({ruleId:rule.ruleId,modelId,inventory:'invalid scope'});
    const key=modelId+'|'+rule.assertion.path;
    if(collisions.has(key)) failures.push({modelPathCollision:key,ruleIds:[collisions.get(key),rule.ruleId]});
    collisions.set(key,rule.ruleId);
  }
}
for(const fact of data.facts) {
  if(!fact.factId||!Array.isArray(fact.proposedRuleIds)) failures.push({factTrace:'missing'});
  for(const id of fact.proposedRuleIds)if(!ids.has(id))failures.push({factId:fact.factId,missingRule:id});
  for(const id of fact.evidenceRefs)if(!evidenceIds.has(id))failures.push({factId:fact.factId,missingEvidence:id});
  if((fact.inferredHighModels??[]).length!==(fact.inferenceAudits??[]).length)failures.push({factId:fact.factId,inferenceAudit:'missing'});
}
for(const p of ontology.CANONICAL_MODEL_FACT_PATHS_V1)if(!data.facts.some(x=>x.canonicalPath===p))failures.push({missingCanonicalPath:p});
const regexAudit=[];
for(const regex of data.regexAnalysis??[]) {
  const probe={...rules[0],selector:{kind:'regex',pattern:regex.pattern,positiveExamples:regex.positiveExamples,negativeExamples:regex.negativeExamples}};
  try{core.decodeCapabilityRuleCoreRuleV1(probe);regexAudit.push({pattern:regex.pattern,decoderAccepted:true});}catch(error){failures.push({pattern:regex.pattern,code:error.code??error.message});}
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),rules:rules.length,facts:data.facts.length,evidence:evidence.length,canonicalPaths:ontology.CANONICAL_MODEL_FACT_PATHS_V1.length,modelPathClaims:collisions.size,regexAudit,failures},null,2));
if(failures.length)process.exitCode=1;
