// Pure grammar verification; audited patterns are not approved capability Rules.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadResearchContracts, researchRoot } from './research-code.mjs'
const c = await loadResearchContracts()
const g = JSON.parse(await readFile(path.join(researchRoot, 'facts/gemini.json'), 'utf8'))
const base = JSON.parse(await readFile(path.join(researchRoot, 'candidates/gemini.json'), 'utf8'))[0]
const rows = g.familyGrammar.filter(f=>f.pattern).map(f=> {
  const selector = { kind: 'regex', pattern: f.pattern, positiveExamples: f.positiveExamples, negativeExamples: f.negativeExamples }
  c.decodeCapabilityRuleCoreRuleV1({ ...base, ruleId: 'research.grammar-check.' + f.familyId, selector })
  const re = new RegExp(f.pattern, 'u')
  if (!f.positiveExamples.every(s=>re.test(s)) || !f.negativeExamples.every(s=>!re.test(s))) throw new Error(f.familyId)
  return { familyId: f.familyId, selector, decoder: 'PASS', examples: 'PASS', identityRationale: f.identityRationale,
    currentMatchingIds: f.currentMatchingIds, coordinatorVerdict: 'KNOWN_MEMBERS_ONLY; grammar does not establish future assertion inheritance; no Rule emitted' }
})
await writeFile(path.join(researchRoot, 'final/regex-decoder-audit.json'), JSON.stringify({ status: 'PASS', evaluatedAt: new Date().toISOString(),
  purpose: 'Grammar verification only; no capability assertion or materialization', rows }, null, 2) + '\n')
console.log(JSON.stringify({ patterns: rows.length, status: 'PASS' }))
