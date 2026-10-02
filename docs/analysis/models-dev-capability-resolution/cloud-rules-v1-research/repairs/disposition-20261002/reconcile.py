"""Current fact-to-rule reconciliation against the frozen pre-repair audit."""
import collections
import hashlib
import json
import pathlib
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parent.parent
REPO = ROOT.parents[3]
PROVIDERS = ['gemini', 'deepseek', 'openai', 'anthropic', 'openrouter']


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def value_key(value):
    value = dict(value) if isinstance(value, dict) else value
    if isinstance(value, dict) and 'values' in value:
        value['values'] = sorted(value['values'], key=lambda item: json.dumps(item, sort_keys=True))
    return json.dumps(value, sort_keys=True)


def key(r):
    return (r['providerAuthorityId'], r['endpointProfileId'], r['nativeModelId'], r['canonicalPath'])


def rule_claims(packs):
    result = {}
    for pack in packs:
        for rule in pack['rules']:
            assert rule['selector']['kind'] == 'exact'
            for model in rule['selector']['nativeModelIds']:
                k = (rule['providerAuthorityId'], rule['endpointProfileId'], model, rule['assertion']['path'])
                assert k not in result, ('duplicate/overlap', k)
                result[k] = {'ruleId': rule['ruleId'], 'value': rule['assertion']['value']}
    return result


baseline = read('repairs/disposition-20261002/baseline.json')
packs = read('final/candidate-corpus.json')
rows = read('final/fact-decisions.json')['rows']
before_rows = [json.loads(line) for line in (ROOT / 'audits/fact-to-rule-20261002/row-to-rule-trace.jsonl').read_text(encoding='utf-8').splitlines()]
before_index = {(r['provider'], r['factId'], r['subject']['nativeModelId']): r for r in before_rows}
after_index = {(r['provider'], r['factId'], r['nativeModelId']): r for r in rows}
assert len(rows) == len(after_index) == 6333
assert before_index.keys() == after_index.keys(), 'Lost or invented research rows'
facts = {}
fact_counts = {}
for provider in PROVIDERS:
    document = read(f'facts/{provider}.json')
    fs = document if isinstance(document, list) else document['facts']
    fact_counts[provider] = len(fs)
    for f in fs:
        facts[provider, f['factId']] = f
assert sum(fact_counts.values()) == 1350
assert set(facts) == {(r['provider'], r['factId']) for r in rows}
old_claims = rule_claims(baseline['baselineCorpus'])
new_claims = rule_claims(packs)
selected = {key(r): r for r in rows if r['candidateRuleId']}
assert len(selected) == len(new_claims) == 1029
for k, claim in new_claims.items():
    assert selected[k]['candidateRuleId'] == claim['ruleId']
    assert value_key(selected[k]['canonicalValue']) == value_key(claim['value'])
    f = facts[selected[k]['provider'], selected[k]['factId']]
    assert claim['ruleId'] in f['proposedRuleIds']
    assert set(selected[k]['evidenceRefs']) <= set(f['evidenceRefs'])

added = sorted(new_claims.keys() - old_claims.keys())
removed = sorted(old_claims.keys() - new_claims.keys())
changed = [k for k in old_claims.keys() & new_claims.keys()
           if old_claims[k]['ruleId'] != new_claims[k]['ruleId'] or value_key(old_claims[k]['value']) != value_key(new_claims[k]['value'])]
assert len(added) == 16 and len(removed) == 4 and not changed
assert collections.Counter(k[3] for k in added) == {'modalities.output': 14, 'reasoning.modes.nativeValues': 1, 'modalities.input': 1}
four = {'claude-fable-5-1', 'claude-mythos-5-1', 'claude-fable-5', 'claude-mythos-5'}
assert {k[2] for k in removed} == four and all(k[3] == 'search.web.support' for k in removed)

output_ids = {'anthropic-F-current-output', 'anthropic-F-mythos51-output', 'anthropic-F-opus45-output'}
supersessions = []
for r in rows:
    f = facts[r['provider'], r['factId']]
    if not f.get('supersededCandidateRuleIds') or r['classification'] != 'REDUNDANT_BUT_USEFUL' or r['candidateRuleId']:
        continue
    replacement = new_claims.get(key(r))
    assert replacement and r['selectedReplacementRuleIds'] == [replacement['ruleId']]
    exact = value_key(replacement['value']) == value_key(r['canonicalValue'])
    subset = (r['canonicalValue'].get('completeness') == 'partial'
              and replacement['value']['kind'] == r['canonicalValue']['kind']
              and set(r['canonicalValue']['values']) <= set(replacement['value']['values']))
    assert exact or subset
    supersessions.append({'factId': r['factId'], 'model': r['nativeModelId'], 'selectedReplacementRuleId': replacement['ruleId'], 'equivalentAssertion': exact, 'positiveContainment': subset})
six = [r for r in rows if r['factId'] in output_ids]
assert len(six) == 6 and all(r['selectedReplacementRuleIds'] == ['anthropic-v1-active-output'] for r in six)
assert all(r['canonicalValue']['completeness'] == 'partial' for r in six)

inputs = [r for r in rows if r['provider'] == 'openai' and facts['openai', r['factId']].get('repairId') == 'disposition-20261002']
assert len(inputs) == 28
assert collections.Counter(r['classification'] for r in inputs) == {'ALREADY_MODELS_DEV': 26, 'RULE_CANDIDATE': 1, 'TEMPORALLY_UNSAFE': 1}
for r in inputs:
    assert r['canonicalValue']['completeness'] == 'partial'
    if r['classification'] == 'ALREADY_MODELS_DEV':
        assert not r['candidateRuleId']
        assert set(r['canonicalValue']['values']) <= set(r['modelsDev']['value']['values'])
        assert r['conflictStatus'] == 'none_observed'
sonnet = next(r for r in rows if r['factId'] == 'anthropic-F-sonnet55-modes')
assert sonnet['candidateRuleId'] == 'anthropic-v1-sonnet55-modes'
assert sonnet['canonicalValue'] == {'kind': 'native_string_set', 'values': ['adaptive'], 'completeness': 'partial'}
condition = facts['anthropic', 'anthropic-F-between-tools-constraints']
original_anthropic = json.loads(subprocess.check_output(['git', 'show', baseline['head'] + ':' + str((ROOT / 'facts/anthropic.json').relative_to(REPO)).replace('\\', '/')], cwd=REPO))
assert condition == next(f for f in original_anthropic['facts'] if f['factId'] == condition['factId'])
assert condition['classification'] == 'ONTOLOGY_GAP'
for r in rows:
    if r['factId'] == 'anthropic-F-modern-websearch' and r['nativeModelId'] in four:
        assert not r['candidateRuleId'] and r['coverageBasis'] == 'INFERRED_MEDIUM' and r['classification'] == 'AMBIGUOUS_DEFER'

manual = read('final/manual-review.json')
assert sum(1 for v in manual['inferences'] if v['factId'].startswith('anthropic-')) == 332
for r in selected.values():
    if r['coverageBasis'] == 'INFERRED_HIGH':
        assert any(v['factId'] == r['factId'] and v['nativeModelId'] == r['nativeModelId'] and v['verdict'] == 'APPROVE_INFERRED_HIGH' for v in manual['inferences'])
assert not any(v['nativeModelId'] in v.get('explicitSiblings', []) for v in manual['inferences'] if v['factId'].startswith('anthropic-'))

semantic_rows = []
for k, r in after_index.items():
    old = before_index[k]
    changes = {field: {'before': old[field], 'after': r[field]} for field in ['canonicalValue', 'classification', 'coverageBasis'] if old[field] != r[field]}
    if old['ruleId'] != r['candidateRuleId']:
        changes['selectedRuleId'] = {'before': old['ruleId'], 'after': r['candidateRuleId']}
    if changes:
        assert r['factId'] in output_ids | {'anthropic-F-active-output', 'anthropic-F-sonnet55-modes', 'anthropic-F-modern-websearch'} or (r['provider'] == 'openai' and r in inputs)
        semantic_rows.append({'provider': r['provider'], 'factId': r['factId'], 'model': r['nativeModelId'], 'changes': changes})
assert len(semantic_rows) == 53
audit_hashes = [v for v in baseline['files'] if v['path'].startswith('audits/')]
assert len(audit_hashes) == 26 and all(digest(ROOT / v['path']) == v['sha256'] for v in audit_hashes)
assert digest(REPO / 'pelican-bicycle.html') == baseline['pelicanSha256']
for item in read('final/contract-baseline.json')['contracts']:
    assert digest(REPO / item['path']) == item['sha256'], ('Contract changed', item['path'])
for name in ['final/validation-result.json', 'final/research-validation-result.json', 'repairs/disposition-20261002/materialization-validation.json']:
    assert read(name)['status'] == 'PASS'
mat = read('repairs/disposition-20261002/materialization-validation.json')
assert mat['materializedClaims'] == mat['uniqueMaterializedClaims'] == len(new_claims)
cyber = next(r for p in packs for r in p['rules'] if r['ruleId'] == 'cloud.openai.gpt-5.6-cyber.modalities.input')
cyber_source = next(json.loads(line) for line in (ROOT / 'evidence/openai.jsonl').read_text(encoding='utf-8-sig').splitlines()
                    if json.loads(line)['evidenceId'] == cyber['evidence']['evidenceSourceRef'])
assert cyber['evidence']['verifiedAt'] == cyber_source['retrievedAt']
for v in manual['inferences']:
    if v['factId'] == 'anthropic-F-modern-websearch' and v['nativeModelId'] in four:
        assert v['semanticSeries'] == v['providerAudit']['sameSemanticSeriesRationale']

old_rules = {r['ruleId']: r for p in baseline['baselineCorpus'] for r in p['rules']}
new_rules = {r['ruleId']: r for p in packs for r in p['rules']}
rule_changes = []
for rid in sorted(old_rules.keys() | new_rules.keys()):
    old, new = old_rules.get(rid), new_rules.get(rid)
    if old == new:
        continue
    fields = [k for k in (old or {}).keys() | (new or {}).keys() if (old or {}).get(k) != (new or {}).get(k)]
    rule_changes.append({'ruleId': rid, 'operation': 'added' if not old else 'removed' if not new else 'changed',
                         'changedFields': sorted(fields), 'old': old, 'new': new,
                         'semanticChange': not old or not new or old['assertion'] != new['assertion'] or old['selector'] != new['selector']})
assert [v['ruleId'] for v in rule_changes if v['operation'] == 'added'] == ['anthropic-v1-active-output', 'anthropic-v1-sonnet55-modes', 'cloud.openai.gpt-5.6-cyber.modalities.input']
assert not any(v['operation'] == 'removed' for v in rule_changes)
save('rule-changes.json', rule_changes)
save('row-transitions.json', semantic_rows)
save('selected-claim-changes.json', {'added': [{'key': list(k), **new_claims[k]} for k in added], 'removed': [{'key': list(k), **old_claims[k]} for k in removed], 'changed': changed})
result = {'status': 'PASS', 'old': {'rules': len(old_rules), 'claims': len(old_claims)},
          'new': {'packs': len(packs), 'rules': len(new_rules), 'claims': len(new_claims), 'facts': sum(fact_counts.values()), 'dispositionRows': len(rows), 'evidenceRecords': 264},
          'classifications': dict(collections.Counter(r['classification'] for r in rows)),
          'selectedBasis': dict(collections.Counter(r['coverageBasis'] for r in selected.values())),
          'changedSemanticRows': len(semantic_rows), 'claimsAdded': len(added), 'claimsRemoved': len(removed), 'retainedClaimValuesChanged': len(changed),
          'rulesAdded': 3, 'rulesRemoved': 0, 'rulesSplit': 0, 'rulesMerged': 0,
          'existingRulesChanged': sum(v['operation'] == 'changed' for v in rule_changes),
          'supersessionChecks': supersessions, 'sixFailedSupersessionsFixed': True,
          'openaiInputDispositions': dict(collections.Counter(r['classification'] for r in inputs)),
          'conditionalBetweenToolsFactPreserved': True, 'fourWebSearchJoinsDeferred': sorted(four),
          'duplicateSelectedKeys': 0, 'selectedOverlaps': 0, 'regexRules': 0,
          'originalAuditFilesUnchanged': len(audit_hashes), 'productionContractHashesUnchanged': True, 'pelicanUnchanged': True,
          'boundary': 'Full current fact/row/selected-claim closure plus targeted before/after semantics. No production, schema, source priority, DB, release-state or Apply change.'}
save('reconciliation.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'supersessionChecks'}, indent=2))
