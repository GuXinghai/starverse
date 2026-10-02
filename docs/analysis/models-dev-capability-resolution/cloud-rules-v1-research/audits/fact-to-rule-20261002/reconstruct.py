"""Read existing corpus only; write independent audit products in this directory."""
import collections, hashlib, json, re, math
from pathlib import Path
OUT = Path(__file__).resolve().parent
BASE = OUT.parent.parent
PROVIDERS = ['gemini','deepseek','openai','anthropic','openrouter']
def load(name): return json.loads((BASE/name).read_text(encoding='utf-8-sig'))
def write(name, value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def jsonl(name, values): (OUT/name).write_text(''.join(json.dumps(v,ensure_ascii=False)+'\n' for v in values),encoding='utf-8')
def norm(value):
    if isinstance(value,dict) and value.get('kind')=='aspect_ratio_set':
        value={**value,'values':[{'width':v['width']//math.gcd(v['width'],v['height']),'height':v['height']//math.gcd(v['width'],v['height'])} for v in value['values']]}
    if isinstance(value,dict): return {k:(sorted(v,key=lambda a:json.dumps(a,sort_keys=True)) if k in ['values','includedValues','excludedValues','symbolicNativeValues'] and isinstance(v,list) else norm(v)) for k,v in value.items()}
    if isinstance(value,list): return [norm(v) for v in value]
    return value
def token(value): return json.dumps(norm(value),sort_keys=True,separators=(',',':'))
def models(f):
    return list(dict.fromkeys(v if isinstance(v,str) else v['nativeModelId'] for k in ['explicitModels','inferredHighModels','inferredMediumModels','inferredLowModels'] for v in f.get(k,[])))
def flatten(d):
    if isinstance(d,list): return [r for p in d for r in p.get('rules',[p])]
    return d.get('rules') or [r for p in d.get('packs',[]) for r in p['rules']]
facts={}; ledgers={}; proposals={}; documents={}; issues=[]
for p in PROVIDERS:
    d=load(f'facts/{p}.json'); documents[p]=d
    fs=d if isinstance(d,list) else d['facts']
    for f in fs:
        k=(p,f['factId'])
        if k in facts: issues.append({'kind':'duplicate_fact_id','key':k})
        facts[k]=f
    ledgers[p]=[json.loads(s) for s in (BASE/f'evidence/{p}.jsonl').read_text(encoding='utf-8-sig').splitlines() if s.strip()]
    proposals[p]=flatten(load(f'candidates/{p}.json'))
evidence={e['evidenceId']:e for p in PROVIDERS for e in ledgers[p]}
if len(evidence)!=sum(len(a) for a in ledgers.values()): issues.append({'kind':'duplicate_evidence_id'})
rows=load('final/fact-decisions.json')['rows']; packs=load('final/candidate-corpus.json')
rules={r['ruleId']:r for pack in packs for r in pack['rules']}
manual=load('final/manual-review.json')
row_by_fact=collections.defaultdict(list); row_by_claim=collections.defaultdict(list)
for i,r in enumerate(rows,1):
    row_by_fact[(r['provider'],r['factId'])].append((i,r))
    row_by_claim[(r['providerAuthorityId'],r['endpointProfileId'],r['nativeModelId'],r['canonicalPath'])].append((i,r))
    if (r['provider'],r['factId']) not in facts: issues.append({'kind':'orphan_disposition','row':i})
    for ref in r['evidenceRefs']:
        if ref not in evidence: issues.append({'kind':'unresolved_row_evidence','row':i,'ref':ref})
selected=[(i,r) for i,r in enumerate(rows,1) if r['candidateRuleId']]
selected_by_rule=collections.defaultdict(list)
trace=[]; fact_flow=[]; referenced=set(); expected_total=0
for (p,fid),f in facts.items():
    ids=models(f) or [None]; expected_total+=len(ids)
    actual=row_by_fact[(p,fid)]
    if collections.Counter(ids)!=collections.Counter(r['nativeModelId'] for _,r in actual): issues.append({'kind':'fact_expansion_mismatch','provider':p,'factId':fid})
    for ref in f['evidenceRefs']:
        referenced.add(ref)
        if ref not in evidence: issues.append({'kind':'unresolved_fact_evidence','provider':p,'factId':fid,'ref':ref})
    destinations=collections.Counter(r['classification'] for _,r in actual)
    selected_rows=[(i,r) for i,r in actual if r['candidateRuleId']]
    fact_flow.append({'provider':p,'factId':fid,'factPointer':f'facts/{p}.json#factId={fid}','canonicalPath':f.get('canonicalPath'),'originalClassification':f['classification'],'evidenceRefs':f['evidenceRefs'],'expectedExpandedRows':len(ids),'dispositions':dict(destinations),'selectedRows':len(selected_rows),'selectedRuleIds':sorted({r['candidateRuleId'] for _,r in selected_rows}),'rowOrdinals':[i for i,_ in actual]})
    for i,r in actual:
        if r['canonicalPath']!=f.get('canonicalPath') or token(r['canonicalValue'])!=token(f.get('canonicalValue')): issues.append({'kind':'fact_value_or_path_changed','provider':p,'factId':fid,'row':i})
        if r['evidenceRefs']!=f['evidenceRefs']: issues.append({'kind':'evidence_list_changed','row':i})
        rid=r['candidateRuleId']; rule=rules.get(rid)
        if rid:
            selected_by_rule[rid].append((i,r))
            if not rule or r['nativeModelId'] not in rule['selector']['nativeModelIds'] or r['canonicalPath']!=rule['assertion']['path'] or token(r['canonicalValue'])!=token(rule['assertion']['value']): issues.append({'kind':'selected_rule_mismatch','row':i,'ruleId':rid})
        trace.append({'rowOrdinal':i,'provider':p,'factId':fid,'factPointer':f'facts/{p}.json#factId={fid}','evidenceRefs':r['evidenceRefs'],'evidenceSources':[{'evidenceId':e,'url':evidence[e].get('url'),'ledger':f'evidence/{p}.jsonl'} for e in r['evidenceRefs'] if e in evidence],'subject':{'providerAuthorityId':r['providerAuthorityId'],'endpointProfileId':r['endpointProfileId'],'nativeModelId':r['nativeModelId']},'canonicalPath':r['canonicalPath'],'canonicalValue':r['canonicalValue'],'classification':r['classification'],'reason':r['reason'],'factRationale':f.get('modelCoverageRationale'),'factAmbiguity':f.get('ambiguityNotes'),'coverageBasis':r['coverageBasis'],'selected':bool(rid),'ruleId':rid,'selectorMembers':rule['selector']['nativeModelIds'] if rule else None,'materializedClaimKey':list((r['providerAuthorityId'],r['endpointProfileId'],r['nativeModelId'],r['canonicalPath'])) if rule else None})
for rid,rule in rules.items():
    linked=selected_by_rule[rid]
    if collections.Counter(rule['selector']['nativeModelIds'])!=collections.Counter(r['nativeModelId'] for _,r in linked): issues.append({'kind':'selector_member_link_mismatch','ruleId':rid})
duplicates=[{'claimKey':list(k),'rowOrdinals':[i for i,_ in a],'factIds':[r['factId'] for _,r in a],'sameValue':len({token(r['canonicalValue']) for _,r in a})==1} for k,a in row_by_claim.items() if len(a)>1]
row_key_counts=collections.Counter((r['provider'],r['factId'],r['nativeModelId']) for r in rows)
for k,n in row_key_counts.items():
    if n>1: issues.append({'kind':'duplicate_fact_model_row','key':list(k),'count':n})
selection=collections.Counter(r['classification'] for _,r in selected)
original_to_final=collections.Counter((r['originalClassification'],r['classification']) for r in rows)
authority=[]
for cls,field,snapshot in [('ALREADY_MODELS_DEV','modelsDev','final/models-dev-observations.json'),('ALREADY_PROVIDER_NATIVE','providerNative','final/openrouter-native-observations.json')]:
    obs={(s['subject']['providerAuthorityId'],s['subject']['endpointProfileId'],s['subject']['nativeModelId'],o['path']):o for s in load(snapshot)['subjects'] for o in s['outcomes']}
    for i,r in enumerate(rows,1):
        if r['classification']!=cls: continue
        k=(r['providerAuthorityId'],r['endpointProfileId'],r['nativeModelId'],r['canonicalPath']); found=obs.get(k)
        supplied=r[field]
        equal=supplied.get('state')=='present_valid' and token(supplied['value'])==token(r['canonicalValue'])
        positive_subset=isinstance(r['canonicalValue'],dict) and r['canonicalValue'].get('completeness')=='partial' and supplied.get('value',{}).get('kind')==r['canonicalValue'].get('kind') and set(r['canonicalValue'].get('values',[])).issubset(set(supplied['value'].get('values',[])))
        state='exact_equal' if equal else 'positive_subset_higher_complete' if positive_subset else 'coverage_not_demonstrated'
        check={'rowOrdinal':i,'provider':r['provider'],'factId':r['factId'],'nativeModelId':r['nativeModelId'],'canonicalPath':r['canonicalPath'],'classification':cls,'equivalence':state,'observedAtExactProfile':bool(found),'snapshotMatchesRecordedObservation':bool(found and found['state']==supplied['state'] and token(found['value'])==token(supplied['value']))}
        authority.append(check)
        if not check['observedAtExactProfile'] or not check['snapshotMatchesRecordedObservation'] or state=='coverage_not_demonstrated': issues.append({'kind':'higher_authority_exclusion_not_justified',**check})
def family(model,p):
    if not model: return 'API concept'
    if p=='anthropic':
        return re.sub(r'-\d{8}$','',model)
    if p=='deepseek': return model
    if p=='openrouter': return model.split('/')[0]
    return re.sub(r'-(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\d{2}-\d{4})$','',model)
inference=[]
for rid,linked in selected_by_rule.items():
    hs=[r for _,r in linked if r['coverageBasis']=='INFERRED_HIGH']
    if not hs: continue
    f=facts[(hs[0]['provider'],hs[0]['factId'])]
    reviews=[v for v in manual['inferences'] if v['factId']==f['factId'] and v['nativeModelId'] in [r['nativeModelId'] for r in hs]]
    inference.append({'groupId':f"I{len(inference)+1:02}",'provider':hs[0]['provider'],'factId':f['factId'],'ruleId':rid,'canonicalPath':hs[0]['canonicalPath'],'primaryEvidence':rules[rid]['evidence']['evidenceSourceRef'],'factEvidenceRefs':f['evidenceRefs'],'families':sorted({family(r['nativeModelId'],r['provider']) for _,r in linked}),'explicitMembers':[r['nativeModelId'] for _,r in linked if r['coverageBasis']=='EXPLICIT_MODEL'],'inferredMembers':[r['nativeModelId'] for r in hs],'selectedRowOrdinals':[i for i,_ in linked],'rationale':f.get('modelCoverageRationale'),'reviews':reviews,'ruleEvidence':rules[rid]['evidence'],'temporalClasses':sorted({r['temporalAssessment']['temporalClass'] for _,r in linked}),'allApproved':len(reviews)==len(hs) and all(v['verdict']=='APPROVE_INFERRED_HIGH' for v in reviews)})
    if not inference[-1]['allApproved']: issues.append({'kind':'unapproved_high','groupId':inference[-1]['groupId']})
aggregations=[]
for rid,rule in rules.items():
    linked=selected_by_rule[rid]
    values={token(r['canonicalValue']) for _,r in linked}
    aggregations.append({'ruleId':rid,'provider':linked[0][1]['provider'],'canonicalPath':rule['assertion']['path'],'members':rule['selector']['nativeModelIds'],'memberCount':len(linked),'factIds':sorted({r['factId'] for _,r in linked}),'coverageBasis':dict(collections.Counter(r['coverageBasis'] for _,r in linked)),'temporalClasses':sorted({r['temporalAssessment']['temporalClass'] for _,r in linked}),'endpointProfiles':sorted({r['endpointProfileId'] for _,r in linked}),'evidenceSourceRef':rule['evidence']['evidenceSourceRef'],'perMemberEvidenceRefs':{r['nativeModelId']:r['evidenceRefs'] for _,r in linked},'sameCanonicalValue':len(values)==1,'crossFamily':len({family(r['nativeModelId'],r['provider']) for _,r in linked})>1})
proposal_audit=[]
for p,ps in proposals.items():
    for rule in ps:
        linked=[(i,r) for i,r in enumerate(rows,1) if r['provider']==p and rule['ruleId'] in facts[(p,r['factId'])].get('proposedRuleIds',[])]
        superseded=[f['factId'] for (fp,_),f in facts.items() if fp==p and rule['ruleId'] in f.get('supersededCandidateRuleIds',[])]
        proposal_audit.append({'provider':p,'proposalRuleId':rule['ruleId'],'selectedRule':rule['ruleId'] in rules,'linkedRowOrdinals':[i for i,_ in linked],'dispositions':dict(collections.Counter(r['classification'] for _,r in linked)),'reasons':sorted({r['reason'] for _,r in linked}),'supersededFactIds':superseded})
        if rule['ruleId'] not in rules and not linked and not superseded: issues.append({'kind':'unaccounted_rejected_proposal','provider':p,'proposalRuleId':rule['ruleId']})
fact_signatures=collections.Counter('+'.join(sorted(v['dispositions'])) for v in fact_flow)
fact_primary=collections.Counter()
def covers_known_assertion(selected_row,row):
    if token(selected_row['canonicalValue'])==token(row['canonicalValue']): return True
    a=selected_row['canonicalValue'];b=row['canonicalValue']
    return isinstance(a,dict) and isinstance(b,dict) and a.get('kind')==b.get('kind') and b.get('completeness')=='partial' and set(b.get('values',[])).issubset(set(a.get('values',[])))
supersession=[]
for i,r in enumerate(rows,1):
    if r['classification']!='REDUNDANT_BUT_USEFUL' or r['candidateRuleId']: continue
    replacements=[s['candidateRuleId'] for _,s in selected if (s['providerAuthorityId'],s['endpointProfileId'],s['nativeModelId'],s['canonicalPath'])==(r['providerAuthorityId'],r['endpointProfileId'],r['nativeModelId'],r['canonicalPath']) and covers_known_assertion(s,r)]
    supersession.append({'rowOrdinal':i,'provider':r['provider'],'factId':r['factId'],'nativeModelId':r['nativeModelId'],'canonicalPath':r['canonicalPath'],'reason':r['reason'],'selectedReplacementRuleIds':replacements,'replacementExists':bool(replacements)})
supersession_by_row={s['rowOrdinal']:s for s in supersession}
for v in fact_flow:
    if v['selectedRows']: category='represented_in_rules'
    elif set(v['dispositions']).issubset({'ALREADY_MODELS_DEV','ALREADY_PROVIDER_NATIVE'}): category='higher_authority_only'
    elif set(v['dispositions'])=={'REDUNDANT_BUT_USEFUL'}: category='repeated_evidence_covered_by_selected' if all(supersession_by_row[i]['replacementExists'] for i in v['rowOrdinals']) else 'superseded_without_selected_replacement'
    elif len(v['dispositions'])==1: category=next(iter(v['dispositions']))
    else: category='mixed_excluded_dispositions'
    fact_primary[category]+=1
def text_of(r):
    f=facts[(r['provider'],r['factId'])]
    return ' '.join(str(v) for v in [r['reason'],r['remainingGap'],f.get('ambiguityNotes'),f.get('modelCoverageRationale')]).lower()
gateway_catalog={m['id']:m for m in load('evidence/openrouter-models-public-snapshot.json')['data']}
def ambiguous(r):
    t=text_of(r);m=r['nativeModelId'] or '';p=r['canonicalPath'];fid=r['factId']
    if r['provider']=='openrouter':
        if p=='limits.output.maxTokens' and r['canonicalValue'] is not None: return 'conditional_semantics','route_scoped_output_ceiling'
        if m and m not in gateway_catalog: return 'surface_mismatch','nontext_subject_chat_profile'
        if ':batch' in m: return 'surface_mismatch','batch_subject_chat_profile'
        if gateway_catalog.get(m,{}).get('architecture',{}).get('tokenizer')=='Router': return 'identity_uncertainty','router_dynamic_target'
        if fid in ['openrouter.fact.85cce676fb31e747','openrouter.fact.fd89bc324c9ea9eb','openrouter.fact.671087f4fe28d6c5']: return 'evidence_conflict','migration_value_conflict'
    if r['provider']=='openai' and p=='modalities.input' and r['canonicalValue']: return 'incomplete_domain','already_partial_but_complete_set_rationale'
    if re.search('conflict|contradic|disagree|versus|vs |512|table heading|fully off',t): return 'evidence_conflict','document_scope_or_value_conflict'
    if re.search('depend|conditional|when thinking|effort high|high effort|restricted|beta header',t): return 'conditional_semantics','cross_parameter_or_execution_condition'
    if re.search('interactions|ai studio|operation.scope|surface|endpoint|api.level|not a native|not.model.native',t): return 'surface_mismatch','api_surface_or_operation_scope'
    if re.search('identity|subject|alias target|model.list|scope not.enumerated|not an exact.model|exact.model.*not.established',t): return 'identity_uncertainty','unproven_exact_subject_or_scope'
    if re.search('inferred_medium|inferred_low|below.*threshold|no independent.*approval|training|infer|suggests',t): return 'weak_inference','insufficient_positive_or_negative_bridge'
    if re.search('complete|exhaust|domain|no.*default|unknown|null|no.*document|no.*evidence|no.*found|absence',t): return 'incomplete_domain','unknown_value_or_nonexhaustive_domain'
    return 'other','unresolved_recorded_claim'
def temporal(r):
    t=text_of(r); m=r['nativeModelId'] or '';a=r['temporalAssessment'];end=a.get('validThrough')
    if 'beta' in t and r['provider']=='anthropic': return 'beta','requires_header_and_execution_conditions'
    if r['provider']=='deepseek' or m.endswith('-latest') or m=='chat-latest': return 'temporary_alias','moving_serving_target'
    if end and str(end)[:10]>'2026-10-02': return 'retirement_scheduled','supported_identity_with_future_end'
    if a['temporalClass']=='deprecation_bound': return 'deprecated','deprecated_or_already_retired_identity'
    if a['temporalClass']=='preview' or re.search('preview|experimental|(?:^|[-/])exp(?:$|[-/])|auto-beta',m): return 'preview','unstable_preview_identity_or_source'
    if re.search(r'(?:\d{4}-\d{2}-\d{2}|\d{8})$',m): return 'dated_snapshot','date_named_identity_recheck_not_automatic_rejection'
    return 'other','recorded_lifecycle_uncertainty'
excluded_groups=collections.defaultdict(list)
for i,r in enumerate(rows,1):
    if r['classification']=='AMBIGUOUS_DEFER': cat,detail=ambiguous(r)
    elif r['classification']=='TEMPORALLY_UNSAFE': cat,detail=temporal(r)
    elif r['classification']=='ONTOLOGY_GAP':
        t=text_of(r)
        if r['provider']=='openai' and r['canonicalPath'] in ['reasoning.budgetTokens.support','reasoning.budgetTokens.domain','generation.effort.nativeValues','generation.effort.providerDefault','search.image.support','documents.citations.support']: cat,detail='insufficient_evidence_existing_path','path_exists_but_no_model_scoped_value'
        elif r['factId']=='anthropic-F-tool-web-reference-cycle': cat,detail='insufficient_evidence_existing_path','web_search_compatibility_evidence_missing'
        elif r['canonicalPath'] and 'effort' in r['canonicalPath'] and r['provider']=='gemini': cat,detail='semantic_mapping_or_missing_support_leaf','thinking_level_not_approved_as_effort'
        elif 'sentinel' in t: cat,detail='semantic_mapping','dynamic_and_disabled_budget_sentinels'
        else: cat,detail='condition_scope_or_missing_concept','cannot_remove_recorded_condition_without_distortion'
    else: continue
    excluded_groups[(r['classification'],r['provider'],cat,detail,r['canonicalPath'])].append((i,r))
groups=[]
for (cls,p,cat,detail,cp),a in excluded_groups.items():
    groups.append({'groupId':f'D{len(groups)+1:03}','classification':cls,'provider':p,'category':cat,'detail':detail,'canonicalPath':cp,'rows':len(a),'factIds':sorted({r['factId'] for _,r in a}),'models':sorted({r['nativeModelId'] for _,r in a if r['nativeModelId']}),'evidenceRefs':sorted({e for _,r in a for e in r['evidenceRefs']}),'rowOrdinals':[i for i,_ in a],'recordedRationales':sorted({str(facts[(p,r['factId'])].get('ambiguityNotes'))+'; '+str(facts[(p,r['factId'])].get('modelCoverageRationale')) for _,r in a})})
def category_counts(cls,choices):
    counts={k:0 for k in choices}
    for g in groups:
        if g['classification']==cls: counts[g['category']]=counts.get(g['category'],0)+g['rows']
    return counts
merge_groups=collections.defaultdict(list)
for a in aggregations:
    rule=rules[a['ruleId']];merge_groups[(rule['providerAuthorityId'],rule['endpointProfileId'],a['canonicalPath'],token(rule['assertion']['value']),token(rule['evidence']))].append(a['ruleId'])
merges=[{'ruleIds':a,'providerAuthorityId':k[0],'endpointProfileId':k[1],'canonicalPath':k[2],'assertion':json.loads(k[3]),'reason':'Identical scope/path/value/evidence/default controls; disjoint selectors can union without per-member evidence loss.'} for k,a in merge_groups.items() if len(a)>1]
summary={'units':{'providerEvidenceRecords':sum(map(len,ledgers.values())),'uniqueEvidenceIds':len(evidence),'intermediateFacts':len(facts),'expectedDispositionRows':expected_total,'actualDispositionRows':len(rows),'selectedExactClaims':len(selected),'rules':len(rules),'packs':len(packs)},'dispositions':dict(collections.Counter(r['classification'] for r in rows)),'selectedDispositions':dict(selection),'selectedCoverageBasis':dict(collections.Counter(r['coverageBasis'] for _,r in selected)),'providerTotals':{p:{'evidenceRecords':len(ledgers[p]),'facts':sum(k[0]==p for k in facts),'dispositionRows':sum(r['provider']==p for r in rows),'providerProposals':len(proposals[p]),'rules':sum(a['provider']==p for a in aggregations),'selectedClaims':sum(r['provider']==p for _,r in selected)} for p in PROVIDERS},'transitionOriginalToFinal':[{'from':a,'to':b,'rows':n} for (a,b),n in original_to_final.items()],'factLevelExclusivePartition':dict(fact_primary),'factDispositionSignatures':dict(fact_signatures),'factsWithAnySelectedRows':sum(bool(v['selectedRows']) for v in fact_flow),'factsWithAggregatedSelectors':sum(any(len(rules[rid]['selector']['nativeModelIds'])>1 for rid in v['selectedRuleIds']) for v in fact_flow),'evidenceUsedByFacts':len(referenced),'evidenceUnusedByFacts':sorted(set(evidence)-referenced),'nullModelRows':sum(r['nativeModelId'] is None for r in rows),'nullCanonicalPathRows':sum(r['canonicalPath'] is None for r in rows),'nullValueRows':sum(r['canonicalValue'] is None for r in rows),'duplicateExactKeysAcrossEvidenceFacts':len(duplicates),'duplicateFactModelRows':sum(n-1 for n in row_key_counts.values() if n>1),'rejectedProposals':sum(not a['selectedRule'] for a in proposal_audit),'higherAuthorityChecks':dict(collections.Counter(a['equivalence'] for a in authority)),'inferenceGroups':len(inference),'multiMemberRules':sum(a['memberCount']>1 for a in aggregations),'mixedExplicitInferredRules':sum(len(a['coverageBasis'])>1 for a in aggregations),'selectedToRuleCompression':len(selected)-len(rules),'structuralIssues':issues,
'countingCaveat':'Fact partition is exclusive using selected-first precedence. A fact can expand into mixed destinations; full vectors live in fact-transitions.jsonl. Row totals are not independent facts or source-document counts. Positive-subset higher coverage preserves known positive assertions but does not verify higher-source exhaustiveness or future fallback.'}
write('fact-flow-summary.json',summary);jsonl('fact-transitions.jsonl',fact_flow);jsonl('row-to-rule-trace.jsonl',sorted(trace,key=lambda v:v['rowOrdinal']));write('higher-authority-checks.json',authority);write('rule-aggregation-checks.json',aggregations);write('inference-groups.json',inference);write('proposal-selection-audit.json',proposal_audit);write('duplicate-assertion-keys.json',duplicates)
summary.update({'duplicateDispositionKeysAcrossFacts':len(duplicates),'duplicateExactSubjectPathKeys':sum(a['claimKey'][2] is not None and a['claimKey'][3] is not None for a in duplicates),'ambiguousCategories':category_counts('AMBIGUOUS_DEFER',['evidence_conflict','incomplete_domain','conditional_semantics','identity_uncertainty','surface_mismatch','weak_inference','other']),'temporalCategories':category_counts('TEMPORALLY_UNSAFE',['preview','beta','dated_snapshot','temporary_alias','deprecated','retirement_scheduled','other']),'ontologyCategories':category_counts('ONTOLOGY_GAP',[]),'sameEvidenceMergeGroups':len(merges),'potentialRuleReductionSameEvidence':sum(len(a['ruleIds'])-1 for a in merges),'groupClassificationMethod':'Deterministic primary reason tags over retained fact rationales; no new fact assertions. All rows and detailed rationale remain in excluded-groups.json. Primary categories are routing labels, not new provider truth.'})
summary.pop('duplicateExactKeysAcrossEvidenceFacts')
summary.update({'unselectedRedundantRows':len(supersession),'redundantRowsWithSelectedReplacement':sum(s['replacementExists'] for s in supersession),'supersededWithoutSelectedReplacementRows':sum(not s['replacementExists'] for s in supersession),'structurallyLostOrUnaccountedFacts':0 if not issues else None})
write('supersession-audit.json',supersession)
write('fact-flow-summary.json',summary);write('excluded-groups.json',groups);write('merge-opportunities.json',merges)
print(json.dumps({k:v for k,v in summary.items() if k not in ['evidenceUnusedByFacts','transitionOriginalToFinal','factDispositionSignatures']},ensure_ascii=False,indent=2))
