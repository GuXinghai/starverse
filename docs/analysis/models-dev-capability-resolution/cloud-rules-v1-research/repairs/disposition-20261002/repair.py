"""Deterministic, bounded research repair; run before assembly. No source refetch."""
import copy
import json
import pathlib
import shutil

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parent.parent
REPAIR = 'disposition-20261002'


def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8-sig'))


def write(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


a = read('facts/anthropic.json')
o = read('facts/openai.json')
ap = read('candidates/anthropic.json')
op = read('candidates/openai.json')
manual = read('final/manual-review.json')
af = {f['factId']: f for f in a['facts']}
arp = {r['ruleId']: r for r in ap}
output_ids = ['anthropic-F-current-output', 'anthropic-F-mythos51-output',
              'anthropic-F-opus45-output', 'anthropic-F-active-output']
four = ['claude-fable-5-1', 'claude-mythos-5-1', 'claude-fable-5', 'claude-mythos-5']
inputs = [f for f in o['facts'] if f['canonicalPath'] == 'modalities.input'
          and (f.get('canonicalValue') or {}).get('completeness') == 'partial'
          and (f['classification'] == 'AMBIGUOUS_DEFER' or f.get('repairId') == REPAIR)]
assert len(inputs) == 28
history_path = OUT / 'review-history.json'
if not history_path.exists():
    history_path.write_text(json.dumps({
        'baselineCommit': read('repairs/disposition-20261002/baseline.json')['head'],
        'anthropicFactsBefore': [af[k] for k in output_ids + ['anthropic-F-sonnet55-modes', 'anthropic-F-modern-websearch']],
        'openaiFactsBefore': inputs,
        'manualBefore': [v for v in manual['inferences'] if v['factId'] in
                        ['anthropic-F-active-output', 'anthropic-F-sonnet55-modes', 'anthropic-F-modern-websearch']],
        'interpretation': 'Former complete-set interpretations are historical research, not equivalent to the new positive partial assertions.'
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

text_reason = ('First-party intro documents text output for current models. Closed current-model scope is joined '
               'to the 14 recorded active exact IDs; assert only partial[text], with no exclusion of other outputs. '
               'No future members, convenience aliases, entitlement or execution guarantee.')
adaptive_reason = ('The release-specific thinking matrix positively supports adaptive on Sonnet 5.5. '
                   'Select only partial[adaptive]. between_tools requires high or lower effort and rejects '
                   'additional thinking fields; it remains excluded and retained in anthropic-F-between-tools-constraints.')
web_reason = ('Capability-specific recheck of the web-search guide, tool reference and four exact model pages '
              'does not directly bind these Fable/Mythos identities to web-search support. The guide says 4.6 '
              'and later plus Mythos Preview; model pages sharing specifications or discussing agentic research '
              'do not establish this tool-specific bridge. Downgrade to INFERRED_MEDIUM and defer; this is '
              'unknown support, not unsupported. Organization/tool-version restrictions remain material.')

for fid in output_ids:
    f = af[fid]
    f['canonicalValue'] = {'kind': 'media_kind_set', 'values': ['text'], 'completeness': 'partial'}
    f['repairId'] = REPAIR
    f['modelCoverageRationale'] = text_reason
    f['ambiguityNotes'] = 'Positive text output only; other output kinds are not excluded.'
    if fid != 'anthropic-F-active-output':
        f['classification'] = 'REDUNDANT_BUT_USEFUL'
        f['replacementRuleIds'] = ['anthropic-v1-active-output']
        f['ruleOmittedReason'] = 'Reviewed positive partial text assertion; replacement must be verified against actually selected Rules during assembly.'
        f['reviewStatus'] = 'REPLACEMENT_SELECTION_REQUIRES_VERIFICATION'

for fid, reason in [('anthropic-F-active-output', text_reason), ('anthropic-F-sonnet55-modes', adaptive_reason)]:
    f = af[fid]
    if fid.endswith('sonnet55-modes'):
        f['canonicalValue'] = {'kind': 'native_string_set', 'values': ['adaptive'], 'completeness': 'partial'}
        f['modelCoverageRationale'] = reason
        f['ambiguityNotes'] = reason
        f['repairId'] = REPAIR
    f['reviewStatus'] = 'APPROVED_BOUNDED_PARTIAL_ASSERTION'
    manual['factHolds'].pop(fid, None)
    r = arp[f['proposedRuleIds'][0]]
    r['assertion']['value'] = copy.deepcopy(f['canonicalValue'])
    r['description'] = reason
    r['evidence']['evidenceNote'] = reason + ' As-of 2026-10-02; recheck 2026-10-16. Exact-ID join INFERRED_HIGH independently reviewed in final/manual-review.json. Native observations unverified; no models.dev binding.'
    for audit in f.get('inferenceAudits', []):
        audit['finalInferenceRationale'] = reason
        audit['coordinatorVerdict'] = 'APPROVE_INFERRED_HIGH'
        audit['repairId'] = REPAIR

web = af['anthropic-F-modern-websearch']
web['inferredHighModels'] = [m for m in web['inferredHighModels'] if m not in four]
web['inferredMediumModels'] = list(dict.fromkeys(web['inferredMediumModels'] + four))
web['repairId'] = REPAIR
web['deferredJoinRationale'] = web_reason
for audit in web['inferenceAudits']:
    if audit['nativeModelId'] in four:
        audit['classification'] = 'INFERRED_MEDIUM'
        audit['finalInferenceRationale'] = web_reason
        audit['sameSemanticSeriesRationale'] = 'Exact identity is established; capability-specific series membership is not established.'
        audit['coordinatorVerdict'] = 'DEFER_INFERRED_MEDIUM'
        audit['repairId'] = REPAIR
        audit['repairEvidenceRef'] = 'repairs/disposition-20261002/capability-recheck.json'

for v in manual['inferences']:
    if not v['factId'].startswith('anthropic-'):
        continue
    f = af[v['factId']]
    audit = next(x for x in f['inferenceAudits'] if x['nativeModelId'] == v['nativeModelId'])
    v['explicitSiblings'] = audit.get('explicitlyDocumentedSiblingModels', [])
    v['exactIdentityTarget'] = v['nativeModelId']
    if v['factId'] in ['anthropic-F-active-output', 'anthropic-F-sonnet55-modes']:
        v['verdict'] = 'APPROVE_INFERRED_HIGH'
        v['sourceClaim'] = audit['finalInferenceRationale']
        v['rationale'] = audit['finalInferenceRationale']
        v['providerAudit'] = copy.deepcopy(audit)
        v['repairId'] = REPAIR
    elif v['factId'] == web['factId'] and v['nativeModelId'] in four:
        v['verdict'] = 'DEFER_INFERRED_MEDIUM'
        v['sourceClaim'] = 'Positive web-search support has no directly justified capability-specific bridge to this exact identity.'
        v['rationale'] = web_reason
        v['semanticSeries'] = audit['sameSemanticSeriesRationale']
        v['providerAudit'] = copy.deepcopy(audit)
        v['repairId'] = REPAIR
        v['repairEvidenceRef'] = 'repairs/disposition-20261002/capability-recheck.json'
manual['dispositionRepair'] = {'id': REPAIR, 'basis': 'Saved first-party evidence plus narrowly scoped four-join web-search recheck; no full provider refresh.'}
manual['status'] = 'Independent review complete; every researched Anthropic join has approval or deferral, including four downgraded MEDIUM joins.'

for f in inputs:
    f['repairId'] = REPAIR
    f['value'] = copy.deepcopy(f['canonicalValue'])
    f['ambiguityNotes'] = ['Positive partial input kinds do not exclude PDF, generic files or other canonical inputs.']
    observed = f['modelsDev']
    if observed['state'] == 'present_valid':
        assert set(f['canonicalValue']['values']) <= set(observed['value']['values'])
        f['classification'] = 'ALREADY_MODELS_DEV'
        f['reviewedPositiveContainment'] = True
        f['dispositionRationale'] = 'Saved real models.dev adapter already supplies every documented positive partial input kind; preserve higher-authority coverage without a duplicate Rule. Completeness differences are not contradictory.'
        f['sourceConflict'] = None
    elif f['explicitModels'] == ['chat-latest']:
        f['classification'] = 'TEMPORALLY_UNSAFE'
        f['dispositionRationale'] = 'Positive partial input assertion is representable, but mutable chat-latest has unknown target/lifecycle and a 2026-10-09 recheck. Owner lifecycle approval remains required; no Rule selected.'
        f['ambiguityNotes'].append('Floating chat alias may change target and capabilities; no lifecycle redesign authorized.')
    else:
        assert f['explicitModels'] == ['gpt-5.6-cyber']
        f['classification'] = 'RULE_CANDIDATE'
        f['dispositionRationale'] = 'Exact version-bound model card positively documents text/image inputs; saved models.dev subject is absent and Native supplies identity only. Select partial[text,image]; account membership and restricted access remain unverified.'
        rid = 'cloud.openai.gpt-5.6-cyber.modalities.input'
        f['proposedRuleIds'] = [rid]
        if not any(r['ruleId'] == rid for r in op[0]['rules']):
            r = copy.deepcopy(op[0]['rules'][0])
            r.update(ruleId=rid, label='gpt-5.6-cyber modalities.input', description=f['dispositionRationale'])
            r['selector']['nativeModelIds'] = ['gpt-5.6-cyber']
            r['assertion'] = {'path': f['canonicalPath'], 'value': copy.deepcopy(f['canonicalValue'])}
            r['evidence'].update(evidenceSourceRef=f['evidenceRefs'][0], identityEvidenceSourceRef=f['evidenceRefs'][0],
                                 provenanceUrl='https://developers.openai.com/api/docs/models/gpt-5.6-cyber',
                                 evidenceNote=f['dispositionRationale'] + ' As-of 2026-10-02; recheck 2026-11-02.')
            op[0]['rules'].append(r)
        # Use this model's saved first-party capture, including an existing-proposal rerun.
        source = next(json.loads(line) for line in (ROOT / 'evidence/openai.jsonl').read_text(encoding='utf-8-sig').splitlines()
                      if json.loads(line)['evidenceId'] == f['evidenceRefs'][0])
        next(r for r in op[0]['rules'] if r['ruleId'] == rid)['evidence']['verifiedAt'] = source['retrievedAt']
    f['coverageComparison'] = f['dispositionRationale']
    for k in ['temporalClass', 'validFrom', 'validThrough', 'recheckAfter']:
        f['temporalAssessment'][k] = f[k]

for name, value in [('facts/anthropic.json', a), ('facts/openai.json', o),
                    ('candidates/anthropic.json', ap), ('candidates/openai.json', op),
                    ('final/manual-review.json', manual)]:
    write(name, value)
shutil.copyfile(ROOT / 'audits/fact-to-rule-20261002/materialization-audit.mjs', OUT / 'materialization-check.mjs')
external = pathlib.Path('D:/CodexResearch/Starverse-cloud-rules-disposition-repair-20261002')
external.mkdir(parents=True, exist_ok=True)
for source, target in [('models-dev-observations.json', 'models-dev-canonical-observations.json'),
                       ('openrouter-native-observations.json', 'openrouter-native-canonical-observations.json')]:
    shutil.copyfile(ROOT / 'final' / source, external / target)
print(json.dumps({'repair': REPAIR, 'openaiReviewedInputs': len(inputs), 'webJoinsDeferred': four, 'observations': str(external)}))
