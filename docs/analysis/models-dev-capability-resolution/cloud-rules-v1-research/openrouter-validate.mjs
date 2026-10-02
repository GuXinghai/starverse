// Research-only: real decoders, no DB, runtime, release, or native module access.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const workspace = process.cwd();
const external = fs.mkdtempSync(path.join(os.tmpdir(), 'openrouter-research-validation-'));
const bundle = path.join(external, 'decoder.mjs');
await build({
  stdin: { contents: `export { decodeCapabilityRuleCoreRuleV1, decodeCapabilityRuleCorePackV1 } from './src/next/generation-v2/capability-rules/capabilityRuleCoreV1.ts'; export { CANONICAL_MODEL_FACT_PATHS_V1 } from './src/next/generation-v2/model-facts/canonicalSourceFactsV1.ts';`, resolveDir: workspace },
  outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
});
const core = await import(pathToFileURL(bundle));
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''));
const rules = read('candidates/openrouter.json');
const facts = read('facts/openrouter.json');
const ledger = fs.readFileSync(path.join(root, 'evidence/openrouter.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const evidence = new Set(ledger.map(x => x.evidenceId));
const known = new Set(read('evidence/openrouter-models-public-snapshot.json').data.map(x => x.id));
const findings = [];
const check = (ok, message) => { if (!ok) findings.push(message); };
for (const rule of rules) {
  try { core.decodeCapabilityRuleCoreRuleV1(rule); } catch (error) { findings.push(`${rule.ruleId}: decoder ${error.message}`); }
  check(rule.providerAuthorityId === 'openrouter' && rule.endpointProfileId === 'openrouter-first-party-v1', `${rule.ruleId}: authority/profile mismatch`);
  check(rule.evidence !== null && evidence.has(rule.evidence.evidenceSourceRef) && evidence.has(rule.evidence.identityEvidenceSourceRef), `${rule.ruleId}: missing evidence reference`);
  const source = ledger.find(x => x.evidenceId === rule.evidence?.evidenceSourceRef);
  check(source?.url.startsWith('https://openrouter.ai/'), `${rule.ruleId}: non-first-party assertion source`);
  const identity = ledger.find(x => x.evidenceId === rule.evidence?.identityEvidenceSourceRef);
  check(rule.selector.nativeModelIds.every(x => identity?.exactModelsNamed.includes(x)), `${rule.ruleId}: catalog identity linkage`);
  check(rule.selector.kind === 'exact' && rule.selector.nativeModelIds.every(x => known.has(x)), `${rule.ruleId}: unknown identity or regex`);
  const linked = facts.filter(f => f.proposedRuleIds.includes(rule.ruleId));
  check(linked.length === 1 && linked[0].classification === 'RULE_CANDIDATE', `${rule.ruleId}: fact linkage`);
  if (linked.length === 1) check(linked[0].canonicalPath === rule.assertion.path && JSON.stringify(linked[0].canonicalValue) === JSON.stringify(rule.assertion.value), `${rule.ruleId}: assertion/fact mismatch`);
}
const subjectPaths = new Map();
for (const r of rules) for (const id of r.selector.nativeModelIds) {
  const key = `${id}|${r.assertion.path}`;
  const value = JSON.stringify(r.assertion.value);
  check(!subjectPaths.has(key), `Duplicate/conflicting candidate subject path: ${key}`);
  subjectPaths.set(key, value);
}
check(new Set(facts.map(x => x.factId)).size === facts.length, 'Duplicate factId');
check(new Set(ledger.map(x => x.evidenceId)).size === ledger.length, 'Duplicate evidenceId');
for (const f of facts) {
  check(f.evidenceRefs.every(x => evidence.has(x)), `${f.factId}: source missing`);
  check(f.inferredHighModels.length === 0 && f.regexCandidate === null, `${f.factId}: unexpected inference`);
  check(f.proposedRuleIds.every(x => rules.some(r => r.ruleId === x)), `${f.factId}: missing Rule`);
}
try {
  // Ephemeral decoder fixture only; not a persisted or recommended Pack organization.
  core.decodeCapabilityRuleCorePackV1({ schemaVersion: 1, packId: 'openrouter-research-decoder-fixture', displayName: 'Research decoder fixture', description: null, priority: 0, mode: 'default_only', target: 'disabled', rules });
} catch (error) { findings.push(`Pack decoder: ${error.message}`); }
const result = { verifiedAt: new Date().toISOString(), command: 'node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/openrouter-validate.mjs', actualRuleDecoder: 'decodeCapabilityRuleCoreRuleV1', actualPackDecoder: 'decodeCapabilityRuleCorePackV1', ruleCount: rules.length, factCount: facts.length, evidenceCount: ledger.length, canonicalPaths: core.CANONICAL_MODEL_FACT_PATHS_V1, exactSubjectPathCount: subjectPaths.size, schemaValid: findings.length === 0, findings, databaseAccess: false, nativeModuleAccess: false, publication: false, temporaryBundleDirectory: external };
fs.writeFileSync(path.join(root, 'evidence/openrouter-validation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, canonicalPaths: result.canonicalPaths.length }, null, 2));
if (findings.length) process.exitCode = 1;
