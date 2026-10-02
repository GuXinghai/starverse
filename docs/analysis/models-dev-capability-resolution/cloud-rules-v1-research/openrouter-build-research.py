"""Research-only deterministic catalog-to-fact audit; does not apply or publish Rules."""
import json, hashlib, collections, datetime, pathlib, re
ROOT = pathlib.Path(__file__).parent
def read(p):
    return json.loads((ROOT / p).read_text(encoding='utf-8-sig'))
def write(p, data):
    (ROOT / p).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
catalog = read('evidence/openrouter-models-public-snapshot.json')['data']
all_catalog = read('evidence/openrouter-models-all-public-snapshot.json')['data']
meta = read('evidence/openrouter-models-public-metadata.json')
md = read('evidence/openrouter-models-dev-comparison.json')['provider']['models']
all_meta = read('evidence/openrouter-models-all-public-metadata.json')
AT = meta['retrievedAt']
ledger = {s['evidenceId']:s for s in [json.loads(line) for line in (ROOT/'evidence/openrouter.jsonl').read_text(encoding='utf-8-sig').splitlines()]}
facts, rules, grouped = [], [], {}

def router(m):
    return m.get('architecture', {}).get('tokenizer') == 'Router'
def life(m):
    if m.get('expiration_date'): return 'deprecation_bound'
    if m.get('alias_target') or router(m): return 'unknown'
    if re.search('preview|experimental|alpha|beta', m['id'], re.I): return 'preview'
    return 'version_bound'
def relation(m, field, value):
    d = md.get(m['id'])
    if d is None: return {'state':'exact_entry_absent','value':None}
    if field.startswith('reasoning_options[type='):
        kind=field[len('reasoning_options[type='):-1]
        indexes=[o for o in d.get('reasoning_options',[]) if isinstance(o,dict) and o.get('type')==kind]
        if not indexes: return {'state':'field_absent','value':None}
        if len(indexes)!=1: return {'state':'invalid_duplicate_option','value':None}
        return {'state':'agrees' if value is True else 'differs','value':True}
    v = d
    for f in field.split('.'):
        if not isinstance(v, dict) or f not in v: return {'state':'field_absent','value':None}
        v = v[f]
    equal=sorted(v)==sorted(value) if isinstance(v,list) and isinstance(value,list) else v==value
    return {'state':'agrees' if equal else 'differs','value':v}
def add(m, path, value, primary, field, evidence, rationale, md_field=None, md_value=None):
    classification = primary
    if path == 'reasoning.effort.nativeValues' and m['id'] == 'anthropic/claude-sonnet-5':
        classification = 'AMBIGUOUS_DEFER'
    if path == 'reasoning.effort.providerDefault' and m['id'] == 'anthropic/claude-opus-5.5':
        classification = 'AMBIGUOUS_DEFER'
    if router(m) or ':batch' in m['id']:
        classification = 'AMBIGUOUS_DEFER'
    elif primary == 'RULE_CANDIDATE' and (m.get('expiration_date') or m.get('alias_target')):
        classification = 'TEMPORALLY_UNSAFE' if ':batch' not in m['id'] else 'AMBIGUOUS_DEFER'
    compare = relation(m, md_field, md_value) if md_field else {'state':'not_mapped_or_not_compared','value':None}
    if primary == 'RULE_CANDIDATE' and md_field and compare['state'] == 'agrees' and classification == primary:
        classification = 'ALREADY_MODELS_DEV'
    # Keep exact model-page exceptions separate from equal-valued catalog facts.
    # Equal values alone must not erase different source fields/evidence scope.
    key = (path, json.dumps(value,sort_keys=True),classification,life(m),m.get('expiration_date'),field,tuple(evidence))
    if key not in grouped:
        fid = 'openrouter.fact.' + hashlib.sha256(json.dumps(key).encode()).hexdigest()[:16]
        grouped[key] = dict(factId=fid,proposedRuleIds=[],providerAuthorityId='openrouter',endpointProfileId='openrouter-first-party-v1',canonicalPath=path,canonicalValue=value,explicitModels=[],inferredHighModels=[],inferredMediumModels=[],inferredLowModels=[],regexCandidate=None,identityPatternConfidence='EXPLICIT_MODEL',capabilityInheritanceConfidence='KNOWN_MEMBERS_ONLY',modelCoverageRationale=rationale,evidenceRefs=['openrouter.inventory.20261002']+evidence,temporalAssessment=dict(temporalClass=life(m),validFrom=None,validThrough=None,recheckAfter='2026-10-09',deprecatedAfter=m.get('expiration_date'),supersededBy=None,flags=['REQUIRES_EXPIRY_REVIEW'] if m.get('expiration_date') else ['REQUIRES_PREVIEW_REVIEW'] if life(m)=='preview' else []),classification=classification,ambiguityNotes='Advertised OpenRouter model metadata; no every-route runtime guarantee. Aliases and batch-surface semantics deferred.' if classification in ('TEMPORALLY_UNSAFE','AMBIGUOUS_DEFER') else 'Source-local advertised fact; routing may constrain actual execution.',sourceField=field,comparisonByModel={},providerNativeCoverage='mapped' if primary=='ALREADY_PROVIDER_NATIVE' else 'unmapped for this path',modelsDevCoverage='per-exact-model comparison below',coverageClassByModel={})
    f = grouped[key]
    f['explicitModels'].append(m['id'])
    f['coverageClassByModel'][m['id']]='EXPLICIT_MODEL'
    f['comparisonByModel'][m['id']]=compare
support = lambda v: {'kind':'support','value':'supported' if v else 'unsupported'}
for m in catalog:
    for field,path in [('context_length','limits.contextWindow.maxTokens')]:
        v=m.get(field)
        if isinstance(v,int) and v>0: add(m,path,{'kind':'integer','value':v,'unit':'token'},'ALREADY_PROVIDER_NATIVE',field,['openrouter.catalog-standard'],'Exact current catalog field; native adapter maps this field. No input arithmetic.', 'limit.context',v)
    for direction in ('input','output'):
        v=m.get('architecture',{}).get(direction+'_modalities')
        if isinstance(v,list):
            translated=[{'file':'generic_file'}.get(x,x) for x in v if x in ('text','image','audio','video','pdf','file','generic_file')]
            add(m,'modalities.'+direction,{'kind':'media_kind_set','values':sorted(translated),'completeness':'complete' if len(v)==len(translated) else 'partial'},'ALREADY_PROVIDER_NATIVE','architecture.'+direction+'_modalities',['openrouter.catalog-standard'],'Exact metadata; file maps generic_file; unrecognized kinds do not imply negatives.','modalities.'+direction,v)
    if 'image' in m.get('architecture',{}).get('output_modalities',[]):
        add(m,'image.generation.support',support(True),'RULE_CANDIDATE','architecture.output_modalities includes image',['openrouter.catalog-standard','openrouter.image-api-announcement','openrouter.image-chat-comparison'],'Each exact current text catalog entry explicitly outputs image; catalog defines image as image generation, and OpenRouter docs retain chat generation for existing text-image models. Separate generator/backend domains and output reliability are not asserted.')
    r=m.get('reasoning')
    if isinstance(r,dict):
        add(m,'reasoning.support',support(True),'ALREADY_PROVIDER_NATIVE','reasoning',['openrouter.model-reasoning-schema','openrouter.reasoning-guide'],'Present reasoning object; native adapter emits supported.','reasoning',True)
        if isinstance(r.get('mandatory'),bool):
            add(m,'reasoning.required',{'kind':'boolean','value':r['mandatory']},'ALREADY_PROVIDER_NATIVE','reasoning.mandatory',['openrouter.model-reasoning-schema'],'Exact mandatory metadata.')
            if r['mandatory']:
                add(m,'reasoning.toggle.support',support(False),'RULE_CANDIDATE','reasoning.mandatory',['openrouter.model-reasoning-schema','openrouter.reasoning-guide'],'Official mandatory=true rejects disable, explicit negative evidence; no silence inference.','reasoning_options[type=toggle]',False)
        efforts=r.get('supported_efforts')
        if isinstance(efforts,list) and efforts and all(isinstance(x,str) for x in efforts) and len(efforts)==len(set(efforts)):
            add(m,'reasoning.effort.nativeValues',{'kind':'native_string_set','values':sorted(efforts),'completeness':'complete'},'RULE_CANDIDATE','reasoning.supported_efforts',['openrouter.model-reasoning-schema','openrouter.reasoning-guide'],'Exact non-null allowlist documented for OpenRouter reasoning.effort; both static adapters deliberately leave effort unmapped. No sibling inheritance.')
            if 'none' in efforts and r.get('mandatory') is False:
                add(m,'reasoning.toggle.support',support(True),'RULE_CANDIDATE','reasoning.supported_efforts + mandatory',['openrouter.reasoning-guide'],'Exact allowlist contains none, documented to disable reasoning; mandatory=false confirms no rejection.','reasoning_options[type=toggle]',True)
        if isinstance(r.get('default_effort'),str):
            add(m,'reasoning.effort.providerDefault',{'kind':'native_string','value':r['default_effort']},'ALREADY_PROVIDER_NATIVE','reasoning.default_effort',['openrouter.reasoning-guide'],'Exact default_effort; native adapter maps; none means reasoning off by default.')
        if r.get('supports_max_tokens') is True:
            add(m,'reasoning.budgetTokens.support',support(True),'RULE_CANDIDATE','reasoning.supports_max_tokens',['openrouter.model-reasoning-schema','openrouter.reasoning-guide'],'Explicit true accepts reasoning.max_tokens, not a numeric bound; native adapter currently unmapped.','reasoning_options[type=budget_tokens]',True)
    params=m.get('supported_parameters',[])
    for parameter,path,md_field in [('tools','tools.calling.support','tool_call'),('structured_outputs','structuredOutput.support','structured_output'),('temperature','sampling.temperature.support','temperature'),('top_k','sampling.topK.support',None)]:
        if parameter in params:
            refs=['openrouter.catalog-standard','openrouter.provider-routing']
            if parameter=='tools': refs.append('openrouter.tools-guide')
            if parameter=='structured_outputs': refs.extend(['openrouter.structured-output-guide','openrouter.structured-routing-blog'])
            add(m,path,support(True),'RULE_CANDIDATE','supported_parameters.'+parameter,refs,'Positive advertised API parameter support only. Uses each exact catalog entry, not upstream support; missing parameter remains unknown. Routing constraints do not become Model Facts.',md_field,True)
    defaults=m.get('default_parameters') or {}
    for field,path,kind in [('temperature','sampling.temperature.providerDefault','decimal'),('top_p','sampling.topP.providerDefault','decimal'),('top_k','sampling.topK.providerDefault','integer')]:
        v=defaults.get(field)
        if isinstance(v,(int,float)) and not isinstance(v,bool) and (kind!='integer' or isinstance(v,int)):
            add(m,path,{'kind':kind,'value':v},'RULE_CANDIDATE','default_parameters.'+field,['openrouter.catalog-standard','openrouter.parameter-guide'],'Non-null per-model default metadata, distinct from guide conventional defaults. Subject to backend default differences; publication requires review.')
    top=m.get('top_provider') or {}
    if isinstance(top.get('max_completion_tokens'),int):
        add(m,'limits.output.maxTokens',{'kind':'integer','value':top['max_completion_tokens'],'unit':'token'},'AMBIGUOUS_DEFER','top_provider.max_completion_tokens',['openrouter.catalog-standard','openrouter.provider-routing'],'Primary-provider ceiling; cannot silently turn into model-wide every-backend maximum. No invented min/input arithmetic.','limit.output',top['max_completion_tokens'])
text_ids={m['id'] for m in catalog}
for m in all_catalog:
    if m['id'] in text_ids: continue
    for direction in ('input','output'):
        v=m.get('architecture',{}).get(direction+'_modalities')
        if isinstance(v,list):
            translated=[{'file':'generic_file'}.get(x,x) for x in v if x in ('text','image','audio','video','pdf','file','generic_file')]
            add(m,'modalities.'+direction,{'kind':'media_kind_set','values':sorted(translated),'completeness':'complete' if len(v)==len(translated) else 'partial'},'AMBIGUOUS_DEFER','nontext architecture.'+direction+'_modalities',['openrouter.inventory-all.20261002','openrouter.catalog-standard'],'All-modality exact inventory covered, but absent from default text native payload and first-party chat-profile applicability unestablished. Empty translated set signifies no ontology-recognized output kind, never no output.')
by_id={m['id']:m for m in catalog}
sonnet=by_id.get('anthropic/claude-sonnet-5')
if sonnet:
    for p in ('sampling.temperature.support','sampling.topK.support','reasoning.budgetTokens.support'):
        add(sonnet,p,support(False),'RULE_CANDIDATE','exact migration ignored-parameter restriction',['openrouter.sonnet5-migration'],'Explicit OpenRouter restriction: parameter accepted but ignored, so functional support is unsupported; no absence inference.','temperature' if p=='sampling.temperature.support' else None,False)
    add(sonnet,'reasoning.toggle.support',support(True),'RULE_CANDIDATE','reasoning.enabled=false in exact migration example',['openrouter.sonnet5-migration'],'Explicit enabled=false documented for exact Sonnet5. Do not expand to mandatory Sonnet5.5.','reasoning_options[type=toggle]',True)
    add(sonnet,'generation.effort.nativeValues',{'kind':'native_string_set','values':['high','low','max','medium','xhigh'],'completeness':'complete'},'RULE_CANDIDATE','verbosity full effort scale',['openrouter.sonnet5-migration','openrouter.parameter-guide'],'Official complete whole-response effort scale via verbosity; distinct from reasoning effort. Applies when thinking enabled or disabled.')
opus=by_id.get('anthropic/claude-opus-5')
if opus:
    add(opus,'reasoning.budgetTokens.support',support(False),'AMBIGUOUS_DEFER','conflicting official budgets descriptions',['openrouter.opus5-migration','openrouter.opus55-migration'],'Opus5 guide says budgets ignored; Opus5.5 migration describes predecessor fixed budgets. Publication deferred pending reconciliation.')
opus55=by_id.get('anthropic/claude-opus-5.5')
if opus55:
    add(opus55,'reasoning.budgetTokens.support',support(False),'RULE_CANDIDATE','exact Opus5.5 migration budgets not forwarded',['openrouter.opus55-migration'],'Explicit OpenRouter guide says accepted budget field not forwarded; model only supports adaptive thinking. No numeric domain.')
mini=by_id.get('openai/o3-mini')
if mini:
    add(mini,'reasoning.effort.nativeValues',{'kind':'native_string_set','values':['high','low','medium'],'completeness':'complete'},'RULE_CANDIDATE','exact model page three effort levels',['openrouter.o3mini-page','openrouter.reasoning-guide'],'OpenRouter exact model page says three efforts. Live catalog omits supported_efforts; Rules fill that actual data gap, no sibling inheritance.')
    add(mini,'reasoning.effort.providerDefault',{'kind':'native_string','value':'medium'},'RULE_CANDIDATE','exact model page default',['openrouter.o3mini-page'],'OpenRouter exact model page default medium; adapter maps defaults but live catalog omits default_effort.')
for f in grouped.values():
    f['explicitModels'].sort()
    native_fields={'limits.contextWindow.maxTokens':'context_length','modalities.input':'architecture.input_modalities','modalities.output':'architecture.output_modalities','reasoning.support':'reasoning','reasoning.required':'reasoning.mandatory','reasoning.effort.providerDefault':'reasoning.default_effort'}
    native_field=native_fields.get(f['canonicalPath'])
    f['providerNativeCoverage']='Static mapping '+native_field+'; current public default-text payload must contain the field. No persisted/runtime evidence claimed.' if native_field else 'No static OpenRouter mapping for this canonical path; ambiguous effort/budget fields deliberately unmapped.'
    f['modelsDevCoverage']='Exact snapshot comparison recorded per model; toggle/budget option presence is mapped, OpenRouter effort options deliberately unmapped. No runtime/DB inspection.'
    f['temporalAssessment']['notes']='Lifecycle unconfirmed for ordinary IDs; version_bound denotes captured release/metadata scope, not guaranteed immutable ID. Expiration date has no known cutover time; validThrough remains null.'
    if f['classification']=='RULE_CANDIDATE':
        for i in range(0,len(f['explicitModels']),256):
            rid='openrouter.rule.'+f['factId'].split('.')[-1]+'.'+str(i//256+1)
            f['proposedRuleIds'].append(rid)
            source=ledger[f['evidenceRefs'][1]]
            verified=max([AT]+[ledger[ref]['retrievedAt'] for ref in f['evidenceRefs'] if ledger[ref].get('retrievedAt')])
            rule=dict(ruleId=rid,label='OpenRouter '+f['canonicalPath'],description='Research candidate: exact public catalog metadata with official OpenRouter semantics; coordinator review required.',priority=0,configured='default',providerAuthorityId='openrouter',endpointProfileId='openrouter-first-party-v1',selector=dict(kind='exact',nativeModelIds=f['explicitModels'][i:i+256]),assertion=dict(path=f['canonicalPath'],value=f['canonicalValue']),evidence=dict(evidenceSourceRef=f['evidenceRefs'][1],evidenceKind='explicit_provider',evidenceNote='Exact catalog '+f['sourceField']+' captured '+AT+'. Advertised model availability, not universal endpoint/runtime guarantee. '+f['modelCoverageRationale'],identityEvidenceKind='provider_archive',identityEvidenceSourceRef='openrouter.inventory.20261002',provenanceUrl=source['url'],verifiedAt=verified,derivation=None))
            rules.append(rule)
            rule['evidence']['evidenceNote']+=' Temporal scope: '+f['temporalAssessment']['temporalClass']+'; recheck 2026-10-09; '+(', '.join(f['temporalAssessment']['flags']) or 'current exact catalog members only')+'.'
    facts.append(f)
facts.extend(read('openrouter-manual-facts.json'))
write('facts/openrouter.json',facts)
write('candidates/openrouter.json',rules)
inventory=[]
text_ids={m['id'] for m in catalog}
for m in all_catalog:
    inventory.append(dict(nativeModelId=m['id'],canonicalSlug=m.get('canonical_slug'),aliasTarget=m.get('alias_target'),createdAt=datetime.datetime.fromtimestamp(m['created'],datetime.timezone.utc).isoformat() if m.get('created') else None,expirationDate=m.get('expiration_date'),temporalClass=life(m),stablePreviewAssessment='explicit expiry' if m.get('expiration_date') else 'spelling-based review flag only; lifecycle not assumed',defaultTextCatalog=m['id'] in text_ids,namespace=m['id'].split('/')[0],variantSuffix=m['id'].split(':',1)[1] if ':' in m['id'] else None,inputModalities=m.get('architecture',{}).get('input_modalities'),outputModalities=m.get('architecture',{}).get('output_modalities'),reasoning=m.get('reasoning'),supportedParameters=m.get('supported_parameters'),defaultParameters=m.get('default_parameters'),regexDisposition='KNOWN_MEMBERS_ONLY exact; no future inheritance'))
write('evidence/openrouter-inventory-audit.json',dict(defaultTextCount=len(catalog),allModalityCount=len(all_catalog),defaultTextRetrieval=AT,allModalityRetrieval=all_meta['retrievedAt'],modelCountNotAvailability=True,models=inventory))
summary=dict(factCount=len(facts),ruleCount=len(rules),classificationCounts=dict(collections.Counter(f['classification'] for f in facts)),rulePathCounts=dict(collections.Counter(r['assertion']['path'] for r in rules)),ruleModelCoverageByPath={p:len({m for r in rules if r['assertion']['path']==p for m in r['selector']['nativeModelIds']}) for p in sorted({r['assertion']['path'] for r in rules})},inferredHighCount=0,regexCount=0,explicitRuleSubjects=len({m for r in rules for m in r['selector']['nativeModelIds']}),expiredOrExpiringCatalogModels=[dict(id=m['id'],date=m['expiration_date']) for m in all_catalog if m.get('expiration_date')])
write('evidence/openrouter-summary.json',summary)
print(json.dumps(summary,indent=2))
