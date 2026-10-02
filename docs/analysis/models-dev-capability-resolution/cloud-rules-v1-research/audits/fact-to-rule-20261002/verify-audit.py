"""Audit-only integrity and accounting checks; no existing-artifact writes."""
import collections, hashlib, json, subprocess
from pathlib import Path
OUT=Path(__file__).resolve().parent;BASE=OUT.parent.parent;ROOT=BASE.parents[3]
def load(name): return json.loads((OUT/name).read_text(encoding='utf-8-sig'))
def jsonl(name): return [json.loads(v) for v in (OUT/name).read_text(encoding='utf-8-sig').splitlines() if v.strip()]
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True,encoding='utf-8').strip()
manifest=load('input-manifest.json');s=load('fact-flow-summary.json');m=load('materialization-validation.json')
failures=[]
for f in manifest['files']:
    p=BASE/f['path']
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']: failures.append({'kind':'existing_input_modified','path':f['path']})
if git('rev-parse','HEAD')!=manifest['head']: failures.append({'kind':'HEAD_changed'})
if git('branch','--show-current')!=manifest['branch']:failures.append({'kind':'branch_changed'})
tracked=git('diff','--name-only');staged=git('diff','--cached','--name-only')
if tracked or staged:failures.append({'kind':'tracked_or_staged_changes','tracked':tracked,'staged':staged})
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True,encoding='utf-8').splitlines()
auditprefix=OUT.relative_to(ROOT).as_posix()+'/'
baselinepaths=[v[3:] for v in manifest['gitStatusBefore'] if v.startswith('?? ')]
unexpected=[v for v in untracked if not v.startswith(auditprefix) and v not in baselinepaths]
if unexpected:failures.append({'kind':'unexpected_untracked','paths':unexpected})
for name in ['fact-to-rule-audit.md','fact-flow-summary.json','suspicious-decisions.jsonl','inference-groups.md','regex-promotion-review.md']:
    if not (OUT/name).is_file():failures.append({'kind':'missing_output','name':name})
assert s['units']=={'providerEvidenceRecords':264,'uniqueEvidenceIds':264,'intermediateFacts':1350,'expectedDispositionRows':6333,'actualDispositionRows':6333,'selectedExactClaims':1017,'rules':290,'packs':5}
assert sum(s['dispositions'].values())==6333
assert sum(s['selectedDispositions'].values())==1017
assert sum(s['factLevelExclusivePartition'].values())==1350
assert not s['structuralIssues']
assert m['status']=='PASS' and m['materializedClaims']==1017 and not m['problems']
assert len(jsonl('fact-transitions.jsonl'))==1350
trace=jsonl('row-to-rule-trace.jsonl');assert len(trace)==6333 and {v['rowOrdinal'] for v in trace}==set(range(1,6334))
assert sum(v['selected'] for v in trace)==1017
assert len(load('rule-aggregation-checks.json'))==290
assert len(load('inference-groups.json'))==31 and sum(len(g['inferredMembers']) for g in load('inference-groups.json'))==244
assert len(load('regex-promotion-review.json'))==144
assert sum(s['ambiguousCategories'].values())==1938 and sum(s['temporalCategories'].values())==367 and sum(s['ontologyCategories'].values())==129
assert sum(g['rows'] for g in load('excluded-groups.json'))==1938+367+129
assert sum(not g['replacementExists'] for g in load('supersession-audit.json'))==6
or_groups=collections.Counter()
for g in load('excluded-groups.json'):
    if g['classification']=='AMBIGUOUS_DEFER' and g['provider']=='openrouter':or_groups[g['detail']]+=g['rows']
assert or_groups['route_scoped_output_ceiling']==457 and or_groups['batch_subject_chat_profile']==689 and or_groups['router_dynamic_target']==240 and or_groups['nontext_subject_chat_profile']==362 and sum(or_groups.values())==1764
suspicious=jsonl('suspicious-decisions.jsonl');assert len({v['findingId'] for v in suspicious})==len(suspicious)
assert len(suspicious)==s['semanticAudit']['suspiciousRecords']
scheduled=next(v for v in suspicious if v['findingId']=='S06')
assert len(scheduled['rowOrdinals'])==138
assert {i for g in load('excluded-groups.json') if g['classification']=='TEMPORALLY_UNSAFE' and g['category']=='retirement_scheduled' for i in g['rowOrdinals']}==set(scheduled['rowOrdinals'])
assert all(v['externalReResearchRequired'] for v in load('regex-promotion-review.json') if v['verdict']=='NO_PROMOTION_MISSING_SCOPED_HISTORICAL_EVIDENCE')
assert len(s['semanticAudit']['ownerDecisions'])==7
for v in suspicious:
    assert all(k in v for k in ['provider','model_or_family','canonicalPath','currentDisposition','currentRationale','evidenceRefs','whySuspicious','suggestedDisposition','confidence','externalReResearchRequired'])
result={'status':'PASS' if not failures else 'FAIL','existingResearchFilesHashVerified':len(manifest['files']),'head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'trackedChanges':tracked.splitlines(),'stagedChanges':staged.splitlines(),'preservedBaselineUntracked':baselinepaths,'newUntrackedAuditFiles':sum(v.startswith(auditprefix) for v in untracked),'unexpectedUntracked':unexpected,'countAndTraceChecks':'PASS','actualPureMaterializationCheck':m['status'],'failedChecks':failures,'externalProviderResearchPerformed':False,'databaseAccessPerformed':False,'publicationOrApplyPerformed':False,'commitOrPushPerformed':False,'boundary':'Only new audit-directory outputs. No schema, production, adapter, resolver, existing evidence/candidate, DB, release or source-pointer changes.'}
(OUT/'scope-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
assert not failures
