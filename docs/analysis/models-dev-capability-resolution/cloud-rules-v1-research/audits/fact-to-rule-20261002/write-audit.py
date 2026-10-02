"""Render primary-agent audit judgments from independently reconstructed accounting."""
import collections, json, re
from pathlib import Path
OUT=Path(__file__).resolve().parent; BASE=OUT.parent.parent
def load(name): return json.loads((BASE/name).read_text(encoding='utf-8-sig'))
def local(name): return json.loads((OUT/name).read_text(encoding='utf-8-sig'))
def write(name,text): (OUT/name).write_text(text if text.endswith('\n') else text+'\n',encoding='utf-8')
def table(headers,values):
    clean=lambda v:str(v).replace('|','\\|').replace('\n',' ')
    return '| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+''.join('| '+' | '.join(clean(v) for v in a)+' |\n' for a in values)
S=local('fact-flow-summary.json'); rows=load('final/fact-decisions.json')['rows'];packs=load('final/candidate-corpus.json');rules={r['ruleId']:r for p in packs for r in p['rules']};groups=local('inference-groups.json');excluded=local('excluded-groups.json')
facts={}
for p in S['providerTotals']:
    d=load('facts/'+p+'.json')
    for f in d if isinstance(d,list) else d['facts']: facts[(p,f['factId'])]=f
ledger={e['evidenceId']:e for p in S['providerTotals'] for e in map(json.loads,(BASE/f'evidence/{p}.jsonl').read_text(encoding='utf-8-sig').splitlines())}
suspicious=[]
def flag(fid,severity,provider,models,path,disposition,rationale,refs,why,suggested,confidence='HIGH',external=False,ordinals=None,ruleid=None):
    suspicious.append({'findingId':fid,'severity':severity,'provider':provider,'model_or_family':models,'canonicalPath':path,'currentDisposition':disposition,'currentRationale':rationale,'evidenceRefs':refs,'whySuspicious':why,'suggestedDisposition':suggested,'confidence':confidence,'externalReResearchRequired':external,'rowOrdinals':ordinals or [],'ruleId':ruleid})
def match(p,fid): return [(i,r) for i,r in enumerate(rows,1) if r['provider']==p and r['factId']==fid]
def flag_fact(fid,severity,p,factid,why,suggested,external=False):
    a=match(p,factid);f=facts[(p,factid)]
    flag(fid,severity,p,[r['nativeModelId'] for _,r in a],f.get('canonicalPath'),sorted({r['classification'] for _,r in a}),sorted({r['reason'] for _,r in a}),f['evidenceRefs'],why,suggested,external=external,ordinals=[i for i,_ in a])
for j,fid in enumerate(['anthropic-F-current-output','anthropic-F-mythos51-output','anthropic-F-opus45-output'],1):
    flag_fact(f'S01.{j}','HIGH','anthropic',fid,'Supersession has no selected replacement. The broader anthropic-F-active-output fact is held by manual-review; no final modalities.output Rule exists. Positive text support is retained in evidence but absent from the Rule corpus.','Replace misleading redundancy with explicit defer linked to the held target, or re-review partial[text] positive output and only then deduplicate against an actual selected replacement.')
a=[(i,r) for i,r in enumerate(rows,1) if r['provider']=='openai' and r['classification']=='AMBIGUOUS_DEFER' and r['canonicalPath']=='modalities.input' and r['canonicalValue']]
flag('S02','HIGH','openai',[r['nativeModelId'] for _,r in a],'modalities.input','AMBIGUOUS_DEFER','Remaining-gap rationale rejects complete canonical input sets, while all28 saved assertions are already partial.',sorted({e for _,r in a for e in r['evidenceRefs']}),'26 partial positive sets are contained in saved models.dev values. gpt-5.6-cyber lacks observed coverage, and chat-latest is lifecycle-unknown. The complete-set objection does not explain any of these partial assertions.','Reclassify26 as higher-authority positive coverage or approved fallback; review gpt-5.6-cyber exact partial input on its recorded profile; retain separate lifecycle review for chat-latest. Do not invent complete PDF/file domains.',ordinals=[i for i,_ in a])
flag_fact('S03','MEDIUM','anthropic','anthropic-F-active-output','Holding complete[text] is justified, but it also holds positive text output that existing partial media sets can express. Four E001 exact names offer direct identity support; E028/E002 cover14 active identities.','Re-review a partial[text] assertion for bounded exact members. Existing14 complete-set inference verdicts remain deferred and cannot be reused automatically.')
flag_fact('S04','MEDIUM','anthropic','anthropic-F-sonnet55-modes','The conditional between_tools member prevents an exhaustive domain, but independently supported adaptive mode can potentially survive as a partial set.','Consider partial[adaptive] after semantic review; keep between_tools effort restrictions separately deferred.')
og=[g for g in excluded if g['classification']=='ONTOLOGY_GAP' and g['category']=='insufficient_evidence_existing_path']
for j,g in enumerate(og,1):
    flag(f'S05.{j}','MEDIUM',g['provider'],g['models'] or 'unscoped concept',g['canonicalPath'],'ONTOLOGY_GAP',g['recordedRationales'],g['evidenceRefs'],'The canonical path already exists; the retained record describes missing evidence or unresolved compatibility rather than a demonstrated schema inability.','Prefer evidence/identity deferral; preserve genuinely distinct media/tool semantics. No positive or negative Rule from null.',ordinals=g['rowOrdinals'])
scheduled_ordinals={i for g in excluded if g['classification']=='TEMPORALLY_UNSAFE' and g['category']=='retirement_scheduled' for i in g['rowOrdinals']}
future=[(i,r) for i,r in enumerate(rows,1) if i in scheduled_ordinals]
flag('S06','MEDIUM','multiple',[r['nativeModelId'] for _,r in future],'multiple paths','TEMPORALLY_UNSAFE','First-corpus lifecycle exclusion covers scheduled retirement as well as already unavailable identities.',sorted({e for _,r in future for e in r['evidenceRefs']}),'138 rows have future end dates as of the frozen research date. Lifecycle alone does not falsify their capability values. Dates range2026-10-05 through2026-12-31.','Keep current hold unless Owner approves bounded validity/recheck/withdrawal semantics. Separate61 deprecated/retired rows and42 beta-condition rows; scheduled facts are not automatically safe either.',ordinals=[i for i,_ in future])
flag('S07','MEDIUM','multiple','Native/models.dev-covered exact subjects','multiple paths','ALREADY_PROVIDER_NATIVE / ALREADY_MODELS_DEV','Equal observed source values generally omitted; Anthropic documented fallback retained without observed local absence.',[],'2867 rows are excluded based on public saved coverage while124 Anthropic fallback rows remain selected. This is a potential durability/fallback policy asymmetry, not a false coverage or current value-loss finding.','Owner decides whether observed-equal first-party evidence is preserved only in research or also in fallback Rules. Maintain Native > models.dev > Rules priority; no source-presence-to-coverage shortcut.')
flag('S08','MEDIUM','gemini','gemini3-stable-flash','reasoning.support/tools.calling.support/structuredOutput.support/tools.codeExecution.support/search.web.support/image.generation.support','KNOWN_MEMBERS_ONLY','Generic future stability and specialized sibling exceptions cited by family/path audits.',['gemini.thinking.generatecontent','gemini.guide.codeexecution','gemini.structured.guide','gemini.guide.search'],'All four matched GA Flash members share these six documented booleans; Live/TTS/image siblings do not match the anchored regex. No captured future-family commitment establishes inheritance, however.','Targeted family-source recheck on each boolean; retain exacts until a positive family-inheritance basis is captured. No automatic regex promotion.',confidence='MEDIUM',external=True)
for rid,rule in rules.items():
    note=rule['evidence']['evidenceNote']
    if rule['providerAuthorityId']=='anthropic' and '4.5' in note and ('deprecat' in note.lower() or 'expiry' in note.lower()):
        flag('S09.'+rid,'LOW','anthropic',rule['selector']['nativeModelIds'],rule['assertion']['path'],'SELECTED_EXACT_RULE',note,[rule['evidence']['evidenceSourceRef']],'Rule-level evidence note retains Sonnet4.5 expiry warnings while that member is absent from the emitted selector. Values and current membership are consistent.','Refresh note in a later authorized repair or move omitted-member history to research audit; no forced semantic split.',ruleid=rid)
flag('S10','LOW','anthropic','332 coordinator identity reviews','multiple paths','APPROVE/DEFER_INFERRED_HIGH','review-anthropic.mjs writes explicitSiblings:[targetNativeModelId].',['anthropic-E002','anthropic-E017'],'The field names the target itself, while nested explicitlyDocumentedSiblingModels is empty. This can be mistaken for independent sibling evidence.','Label exact identity bridge separately from documented explicit siblings. Do not use this field as independent HIGH corroboration.')
a=[(i,r) for i,r in enumerate(rows,1) if r['candidateRuleId'] and r['conflictStatus']!='none_observed']
flag('S11','MEDIUM','gemini/deepseek',[r['nativeModelId'] for _,r in a],'modalities.input/tools.calling.support/limits.contextWindow.maxTokens','SELECTED_RULE_CANDIDATE','Selected fallback disagreement retained; no automatic override.',sorted({e for _,r in a for e in r['evidenceRefs']}),'Four selected claims disagree with models.dev: two Gemini Lite Image fields and two DeepSeek1048576 vs1000000 context ceilings. Rules are lower priority and cannot correct those higher values under default policy.','Owner chooses diagnostic/fallback intent; fresh source check before any correction. No priority or resolver changes in audit.',external=True,ordinals=[i for i,_ in a])
g=next(g for g in groups if g['groupId']=='I31');four=[m for m in g['inferredMembers'] if 'fable' in m or 'mythos' in m]
flag('S12','MEDIUM','anthropic',four,'search.web.support','INFERRED_HIGH / SELECTED_RULE','Web guide4.6+ scope is bridged using the technical context guide and exact-release inventory.',g['factEvidenceRefs'],'The captured E026 summary gives4.6+ scope; E036 names current4.6+ context releases. A context compatibility list is not itself a web-search compatibility list. Saved approval has no capability-specific named bridge for these four Fable/Mythos members beyond that cross-document taxonomy.','Treat these four joins as closer to MEDIUM until direct capability-family scope is confirmed. Retain HIGH for the eight known Opus/Sonnet4.6+ joins on the recorded basis. This is a narrow recheck, not a claim of unsupported capability.',confidence='MEDIUM',external=True,ruleid=g['ruleId'])
flag('S13','LOW','gemini','six retired regex-matching Gemini2.5 snapshot IDs','36 reviewed paths','no_scoped_assertion','Coverage rows exist for all36 paths per identity; naming/lifecycle review is recorded.',['gemini.deprecations.20261002','gemini.guide.changelog'],'All six historical matching IDs have zero scoped fact IDs. Their shared historical architecture/limits cannot be independently evaluated from the recorded fact layer. This is before fact expansion, not deletion of one of the1350 facts.','Narrow future regex investigation must capture relevant historical capability evidence; do not interpret structural36-path coverage as observed values.',confidence='HIGH',external=True)
ds=[(i,r) for i,r in enumerate(rows,1) if r['provider']=='deepseek' and r['candidateRuleId']]
flag('S14','MEDIUM','deepseek',['deepseek-flash','deepseek-v4-pro'],'multiple canonical paths (13 exact claims)','SELECTED / version_bound','Provider report identifies both primary API names as moving serving aliases; final selected rows are marked version_bound.',sorted({e for _,r in ds for e in r['evidenceRefs']}),'Selecting official current primary names may be intentional, but version_bound does not make their serving target immutable. The training assertion especially depends on the current V4.1 mapping; recheck dates are research metadata only.','Explicitly document primary-serving-alias policy separately from the25 excluded temporary/latest rows. Recheck target before publication and withdraw/re-review when target changes; no expiry is automatically enforced.',external=True,ordinals=[i for i,_ in ds])
write('suspicious-decisions.jsonl',''.join(json.dumps(v,ensure_ascii=False)+'\n' for v in suspicious))

# Every meaningful selected inference group, with sub-family membership and precise review limits.
text='# INFERRED_HIGH grouped audit\n\n244 selected claims =243 Anthropic +1 DeepSeek, in31 fact/path/source/selector groups. [Machine groups](inference-groups.json) retain every exact member, coordinator review, source ref and row ordinal. All31 groups pass the recorded approval join. There are zero selected EXPLICIT/HIGH mixed Rules. These are direct provider assertions joined to exact releases; materialized assertionKind=explicit does not erase research inference or create an empirical derivation.\n\n'
text+='## Confidence and family boundaries\n\nMost Anthropic HIGH joins are named release rows or closed all-active quantifiers, not same-prefix extrapolation. The14 active IDs include five brand/tier families; pinned dated Haiku/Opus IDs remain eligible, preview/deprecated/rolling aliases do not. Messages output limits exclude300k Batches beta. Effort is generation-wide, not reasoning-only. Manual budget1024 is a partial lower bound. Haiku lack of persistent REPL/programmatic calling does not negate base code execution. PDF/citations positives do not imply arbitrary binary inputs or feature composability.\n\n'
text+='The strongest confidence concern is **I31: four Fable/Mythos web-search joins**, which are closer to MEDIUM pending a capability-specific scope check (S12). The eight Opus/Sonnet joins retain the explicit4.6+ basis. Context-guide taxonomy plus identity pages can establish identities but cannot independently prove a different hosted tool. No other selected group warrants a definite downgrade from retained evidence alone. Ledger/coordinator entries are source summaries, not complete page captures; verifying source truth afresh would require bounded external checks. No such checks were performed.\n\n'
text+='## Group inventory\n\n'+table(['Group','Provider / fact','Path','HIGH members','Primary evidence','Verdict'],[(g['groupId'],g['provider']+' / '+g['factId'],g['canonicalPath'],len(g['inferredMembers']),g['primaryEvidence'],'NARROW_RECHECK_4_MEMBERS' if g['groupId']=='I31' else 'HIGH_ON_RETAINED_SCOPED_EVIDENCE') for g in groups])
for g in groups:
    review=g['reviews'][0]
    text+=f"\n## {g['groupId']} — {g['factId']}\n\nRule `{g['ruleId']}`; path `{g['canonicalPath']}`. Explicit **selected** members: {g['explicitMembers'] or 'none'}. Inferred selected members: "+', '.join('`'+m+'`' for m in g['inferredMembers'])+'.\n\n'
    text+='Primary evidence: `'+g['primaryEvidence']+'`; all fact refs: '+', '.join('`'+e+'`' for e in g['factEvidenceRefs'])+'. Source summary: '+str(ledger[g['primaryEvidence']].get('factSummary',ledger[g['primaryEvidence']].get('claimSummary')))+'.\n\n'
    text+='Inference chain: '+str(review.get('sourceClaim'))+' Identity bridge: '+str(review.get('identityBridge'))+'. Recorded boundary: '+str(review.get('variantReview'))+'. Recorded exception search: '+str(review.get('exceptionSearch'))+'. Temporal assumption: '+str(review.get('temporalAssumption'))+'.\n\n'
    text+='Assessment: '+('HIGH is supported by the retained bounded source/release join; known conditional alternatives remain held. There is no preview/stable or profile crossover in this selected group.' if g['groupId']!='I31' else 'HIGH is not independently reconstructable for the four Fable/Mythos members from the capability-specific summary; direct scope confirmation required. Eight Opus/Sonnet members share the documented4.6+ boundary.')+'\n'
text+='\n## Explicit evidence outside selected HIGH groups\n\nCurrent input/tool/output provider facts and Opus5.5 web-search sources also contain explicit support. Some are non-emitted duplicates; they do not make an emitted Rule mixed-basis. Three output facts have no selected superseding Rule (S01). Coordinator explicitSiblings self-references are inaccurate terminology (S10); they are not independent siblings. Eleven Rule notes carry omitted Sonnet4.5 expiry text (S09). No bulk244-model re-research was needed.\n'
text+='\nDeepSeek primary names remain moving serving aliases despite selected temporalClass=version_bound (S14). HIGH for the training join is bounded to the captured V4.1 target; no automatic future backend inheritance follows. Owner recheck/withdrawal policy is required.\n'
write('inference-groups.md',text)

gem=load('facts/gemini.json');regex=load('final/regex-decoder-audit.json')['rows'];regexreviews=[]
stablebooleans={'reasoning.support','tools.calling.support','structuredOutput.support','tools.codeExecution.support','search.web.support','image.generation.support'}
controlpaths={'reasoning.effort.nativeValues','reasoning.effort.providerDefault','reasoning.required','reasoning.toggle.support','reasoning.budgetTokens.support','reasoning.budgetTokens.domain','reasoning.modes.nativeValues'}
limmod={'limits.contextWindow.maxTokens','limits.input.maxTokens','limits.output.maxTokens','modalities.input','modalities.output'}
for family in regex:
    familyid=family['familyId'];pattern=family['selector']['pattern'];matching=[m['nativeModelId'] for m in gem['inventory'] if re.search(pattern,m['nativeModelId'])]
    for cp in load('final/contract-baseline.json').get('canonicalPaths',[]) or gem['pathReview']:
        cp=cp['canonicalPath'] if isinstance(cp,dict) else cp
        a=[r for r in rows if r['provider']=='gemini' and r['nativeModelId'] in matching and r['canonicalPath']==cp]
        if familyid!='gemini3-stable-flash': verdict='NO_PROMOTION_MISSING_SCOPED_HISTORICAL_EVIDENCE';reason='Retired naming/lifecycle identities have no scoped capability facts. Decoder-valid identity pattern does not supply inheritance evidence.'
        elif cp in stablebooleans: verdict='TARGETED_FAMILY_COMMITMENT_RECHECK';reason='Four matching GA values agree; specialized Live/TTS/image exceptions are outside this regex. Need affirmative family scope for future authoritative matches, not a theoretical-change rejection.'
        elif cp in controlpaths: verdict='KEEP_EXACT_CONTROL_DIVERGENCE_OR_SEMANTIC_HOLD';reason='minimal is present in3.5/3.6 effort domains but absent in3.7/3.8. Required/toggle/budget/modes scope is incomplete or held. Equal medium defaults alone do not approve effort semantics.'
        elif cp in limmod: verdict='KNOWN_EQUAL_MEMBERS_NO_FUTURE_SPECIFICATION';reason='Known exact numeric/modality specifications agree where recorded; no future-family specification commitment is captured. contextWindow itself has no matching assertion.'
        elif cp.startswith('sampling.'): verdict='KEEP_EXACT_NO_SHARED_SCOPED_SAMPLING_ASSERTION';reason='Later sampling deprecation is recorded; no matching-member common domain/default/support fact. It does not defeat unrelated equal support booleans.'
        elif cp=='documents.citations.support': verdict='RECHECK_OPERATION_SCOPE';reason='Four matched Flash positives are deferred for File Search/Interactions scope; Pro-specific AI Studio qualification is outside the regex. Resolve operation before future inheritance.'
        else: verdict='NO_SCOPED_ASSERTION_FOR_PROMOTION';reason='No suitable matched-member assertion or operation scope supports future propagation.'
        regexreviews.append({'familyId':familyid,'canonicalPath':cp,'pattern':pattern,'knownInventoryMatches':matching,'matchedRows':len(a),'canonicalValues':[r['canonicalValue'] for r in a],'dispositions':dict(collections.Counter(r['classification'] for r in a)),'identityPatternConfidence':'HIGH_KNOWN_GRAMMAR' if familyid!='gemini25-lite-monthyear' else 'ONE_HISTORICAL_MEMBER','capabilityInheritanceConfidence':'UNESTABLISHED_FOR_FUTURE_MEMBERS','verdict':verdict,'reason':reason,'futureAuthoritativeMatchAutomaticallyInherits':False,'externalReResearchRequired':verdict in ['NO_PROMOTION_MISSING_SCOPED_HISTORICAL_EVIDENCE','TARGETED_FAMILY_COMMITMENT_RECHECK','RECHECK_OPERATION_SCOPE'],'externalReResearchPurpose':'If investigating promotion or missing historical assertions; not needed to reproduce the current saved-evidence no-promotion verdict.'})
write('regex-promotion-review.json',json.dumps(regexreviews,ensure_ascii=False,indent=2))
text='# Exact versus constrained regex audit\n\nAll290 final Rules are exact. Four naming patterns passed the real decoder; the audit below covers **four families ×36 paths =144 pairs**. No future capability regex can be promoted from existing recorded evidence alone. This is not a rejection because change is theoretically possible. The stable Flash six booleans deserve a targeted family-source recheck; current historical gaps and control divergences must not substitute for that per-path reasoning. [Machine review](regex-promotion-review.json).\n\n'
text+='## Identity versus capability\n\nA regex still matches only already-authoritative subjects; it does not create models. It does, however, automatically assert its value for a future matching authoritative subject. Grammar, current equality, affirmative provider family scope and exception boundaries therefore answer different questions. The stable anchored regex excludes Pro/Lite/Mini/TTS/Live/image/latest variants; their exceptions cannot reject this pattern by themselves. No source summary commits future matching stable revisions to the six common support booleans. Capture such a commitment before promotion. No existing comparison is an exhaustive historical-divergence study.\n\n'
for family in regex:
    fid=family['familyId'];a=[v for v in regexreviews if v['familyId']==fid]
    text+=f"## {fid}\n\nPattern `{family['selector']['pattern']}`. Actual recorded inventory matches: "+', '.join('`'+m+'`' for m in a[0]['knownInventoryMatches'])+'.\n\n'
    if fid!='gemini3-stable-flash':text+='All matched IDs are retired and have zero scoped intermediate facts; each has a structural36-path coverage row. Pro03-25 also matches despite its omission from positive decoder examples. Naming and deprecation sources do not justify either common capability values or future inheritance. This gap precedes the1350-fact transform.\n\n'
    else:text+='Known3.5–3.8 values: six shared booleans, input1048576, output65536, complete input text/image/audio/video/pdf and complete output text. thinkingLevel minimal differs across these exact members, and later sampling deprecation is recorded. Code execution/web search/image-generation negative/input ceiling supply useful Cloud gaps; several others are already models.dev-covered. Grouping existing exact IDs is plausible where evidence provenance remains attributable; future matching IDs require a separate assertion basis.\n\n'
    text+=table(['Canonical path','Matched rows','Verdict','Evidence assessment'],[(v['canonicalPath'],v['matchedRows'],v['verdict'],v['reason']) for v in a])+'\n'
text+='## Owner recommendation\n\nRecheck stable Flash family language for the six booleans separately, especially positive code execution/web/structured/calling/reasoning and explicit image-generation negative. Do not promote numeric/modality specifications from equal samples alone. Do not generalize thinking controls, budget sentinels or sampling across demonstrated differences. All three provider-proposed signed budget domains are already final ONTOLOGY_GAP, not leaked selected Rules. No regex syntax or production matcher change is requested.\n'
write('regex-promotion-review.md',text)

owner=[
('O1','Repair recoverable positives and failed supersession','Re-review partial output for14 active Anthropic members; relink6 redundant rows only after selected replacement exists; triage28 OpenAI partial inputs (26 already covered, one cyber gap, one latest lifecycle); consider Sonnet5.5 partial adaptive mode.'),
('O2','Fallback durability policy','Decide whether saved equal higher-authority coverage is sufficient to omit first-party fallback across providers;124 selected Anthropic redundancy approvals illustrate an intentional policy choice.'),
('O3','Lifecycle/recheck and withdrawal policy','Distinguish101preview/42beta/25temporary-alias/61deprecated/138scheduled rows; no date-only rejection. Separately acknowledge13 selected DeepSeek claims on two moving primary API names. Decide bounded recheck/withdrawal or future expiry semantics.'),
('O4','Ontology versus evidence/surface gaps','Separate7 existing-path evidence gaps from real conditional, sentinel, media/tool and absent-concept constraints. Decide whether common subsets may be retained as partial facts; keep unsafe conditions held.'),
('O5','Constrained regex promotion policy','Six stable Flash boolean paths require family-level evidence recheck; grammar and sibling exceptions alone are insufficient. No automatic promotion recommended.'),
('O6','Grouped inference confidence and review metadata','Narrow recheck of four Fable/Mythos web-search HIGH joins; correct explicitSiblings self-reference terminology and11 stale Rule notes. Keep independently justified remaining HIGH groups.'),
('O7','Higher-authority conflict handling intent','Four selected Gemini/DeepSeek disagreements remain lower-priority fallbacks. Decide documented diagnostic/fallback intent before any authoritative correction; do not raise priority implicitly.'),
]
S['semanticAudit']={'readiness':'TARGETED_RESEARCH_DISPOSITION_REPAIR_BEFORE_READY_AS_IS_ENDORSEMENT','materiallyOverCompressedByRuleAggregation':False,'provedSelectedAssertionLoss':0,'supersededRowsWithoutSelectedReplacement':6,'overDeferredPartialInputRows':28,'positiveTextOutputRowsForBoundedReReview':14,'partialAdaptiveModeRowsForReReview':1,'highInferenceJoinsCloserToMediumPendingScopeRecheck':4,'ownerDecisionPackages':len(owner),'ownerDecisions':[{'id':i,'type':t,'decision':d} for i,t,d in owner],'suspiciousRecords':len(suspicious),'severities':dict(collections.Counter(v['severity'] for v in suspicious)),'externalResearchPerformed':False}
write('fact-flow-summary.json',json.dumps(S,ensure_ascii=False,indent=2))
text='''# Fact-to-Rule audit — Cloud Rules v1

## 1. Executive conclusion

The **290-Rule core is not materially over-compressed by selector aggregation**. Independent reconstruction and the actual pure materialization adapter reproduce264 evidence records →1350 facts →6333 disposition rows →1017 selected exact claims →290 Rules. No selected assertion disappears or changes value. The727-claim reduction at Rule aggregation is lossless for the single path/value assertion each Rule can express.

The excluded-fact pipeline does need **targeted repair before endorsing the existing “ready as-is” recommendation**. Three Anthropic output facts, expanded to six rows, are described as superseded even though their replacement was itself held;28 OpenAI input facts are already partial but retain a complete-set deferral rationale. Positive text output and Sonnet5.5 adaptive mode could plausibly be retained through existing partial-set types. Four Fable/Mythos web-search HIGH joins need a capability-specific scope recheck. This is an audit of saved evidence, not proof of current provider behavior.

No release/apply or existing-artifact modification occurred. All findings and machine joins are in this new directory. There is no selected-corpus structural BLOCKER; HIGH findings concern exclusion accounting and potentially recoverable coverage. Conditional/surface semantics and lifecycle do expose real design boundaries, but repairing this bounded proposal does not require opening a general ontology redesign first.

## 2. Count reconciliation

'''
text+=table(['Provider','Evidence','Facts','Disposition rows','Provider proposals','Final Rules','Selected claims'],[(p,*[v[k] for k in ['evidenceRecords','facts','dispositionRows','providerProposals','rules','selectedClaims']]) for p,v in S['providerTotals'].items()])+'\n'
text+=table(['Final disposition','Rows','Selected'],[(k,v,S['selectedDispositions'].get(k,0)) for k,v in S['dispositions'].items()])+'\n'
text+='''893 RULE_CANDIDATE +124 selected REDUNDANT_BUT_USEFUL =1017. All893 final candidate rows are selected. The remaining15 redundant rows comprise9 with a selected replacement and6 without one. Inference is already part of row expansion:773 explicit +244 HIGH =1017, not an additional124 claims. Original provider proposals total398:290 retained and108 rejected/superseded with recorded row or superseded-fact links.

Checks: zero duplicated fact IDs, evidence IDs or fact/model row identities; zero missing fact expansions or unresolved evidence refs; zero selected subject/path duplicates; zero orphan selected claims. There are53 repeated disposition keys across facts, of which29 have a non-null exact subject and path. These are retained repeated/partial/conflicting evidence, not multiply-classified rows. In the29 exact keys,11 have identical values and18 differ (four input subset comparisons, twelve held beta action-subset comparisons, two held gateway conflicts). Each disposition row has exactly one final classification. Eighty rows have no model,77 no canonical path,198 null values: these are API/concept/unknown records and must not be counted as exact executable claims.

## 3. Counting units

- **Evidence record:** a durable ledger retrieval/source summary with an evidenceId; it may be inventory, identity, lifecycle, failed retrieval, schema or capability evidence. It is not necessarily one document or one independent capability assertion. Provider ledgers have264 unique IDs; the28 coordinator records are a separate corroboration ledger and are not silently added to264.
- **Intermediate fact:** a provider-local factId with a canonical value or retained null/concept and a model-coverage list. One fact may bundle many exact subjects. There are1350; unknown-path reviews also count as facts.
- **Disposition row:** one provider fact expanded over union(explicit/high/medium/low exact IDs), or one null-model concept row if the union is empty. There are6333; repeated subject/paths across different facts are allowed evidence records.
- **Exact claim:** one selected authority/profile/nativeModelId/path/value link. Selection is non-null candidateRuleId, not classification alone. There are1017.
- **Rule:** one scope plus exact selector list and **one** canonical path/value assertion, priority/activation and shared evidence metadata. There are290, organized in5 Packs. A Rule can compress equal exact assertions; it cannot represent arbitrary cross-parameter conditions, per-member values or expiry.

## 4. Full transformation and trace model

`evidence/{provider}.jsonl:evidenceId` → `facts/{provider}.json:factId/evidenceRefs` → union of model lists (or concept) → `final/fact-decisions.json:rowOrdinal` → temporal/confidence/source/hold/overlap gates → non-null candidateRuleId → final Rule selector member → actual materialized exact claim.

The reproducible [reconstruct.py](reconstruct.py) does not invoke the original writer scripts. [row-to-rule-trace.jsonl](row-to-rule-trace.jsonl) contains all6333 row-level chains, including fact pointers, evidence URLs, rationale, selected Rule and selector. [fact-transitions.jsonl](fact-transitions.jsonl) contains1350 fact vectors; [proposal-selection-audit.json](proposal-selection-audit.json) accounts for398 original proposals; [materialized-claims.jsonl](materialized-claims.jsonl) contains all1017 actual adapter outputs.

The materialization fixture supplies334 **synthetic exact subjects** corresponding to recorded selected IDs. It verifies matching and values, not account membership. The actual current decoder, canonicalization, activation and materialized source adapter ran in memory, with no DB or stored-source mutation; “publication” in the pure builder is an in-memory projection, never a release or app Apply. See [materialization-validation.json](materialization-validation.json).

Representative traces:

'''
samples=[('deepseek','deepseek:fact:flash-training-tool-use'),('anthropic','anthropic-F-pdf-input-active'),('anthropic','anthropic-F-current-output'),('openai','openai.gpt-6.1-sol.modalities.input'),('openrouter',next(r['factId'] for r in rows if r['candidateRuleId']=='openrouter.rule.03855e07829f6516.1'))]
for p,fid in samples:
    a=match(p,fid);f=facts[(p,fid)]
    text+=f"- `{p}/{fid}`: refs `{', '.join(f['evidenceRefs'])}` →{len(a)} rows →"+str(dict(collections.Counter(r['classification'] for _,r in a)))+' → selected Rules '+str(sorted({r['candidateRuleId'] for _,r in a if r['candidateRuleId']}))+'. The exact model/path/value is preserved when selected; no model identity is generated.\n'
text+='''
Canonical normalization preserves semantics: three Gemini aspect-ratio facts reduce21:9 to7:3 and sort sets; completeness remains unchanged. This is mathematical ratio normalization, not removal of a supported format. Overlapping source facts remain visible; input text/image may be subsumed by a selected partial text/image/PDF assertion. Supersession must be checked against the **final selected** replacement, however, which fails for six output rows.

## 5. Higher-authority exclusion audit

All1145 models.dev and1722 Native exclusions were checked against saved **exact authority/profile/model/path** outcomes. All2867 are present_valid, non-null, and match their recorded observations;2864 equal canonical values and3 positive partial sets are contained in higher complete sets. None is justified by superficial source presence, a null value, or static mapping alone. These are public saved adapter observations, not local DB/account state.

The three containment cases are Gemini2.5Flash input partial audio/image/text/video versus complete audio/image/pdf/text/video, and Gemma4 31b/26b partial image/text versus complete same members. Exclusion preserves positive information; the generic conflict flag should not be read as a contradiction. Higher-source exhaustiveness is not independently established by this containment test.

A missing future Native/models.dev value could make first-party fallback useful. The corpus deliberately omits most equal observations yet retains124 Anthropic fallback rows where Native payloads are unobserved and models.dev has no registry binding. Owner must decide durable fallback policy (O2), rather than assuming public present_valid guarantees permanent local coverage. No false higher-authority coverage was found.

Four selected lower-priority disagreements remain: Gemini Lite Image complete input/image-PDF-text-video versus models.dev image/text, and tool calling unsupported versus supported; DeepSeek Flash/Pro context1048576 versus1000000. A Cloud fallback at priority0 cannot override these higher-source values under current source order. This is a documented limitation requiring O7, not permission to alter source priority.

## 6. Deferred-fact audit

### Ambiguous groups

Primary reason labels partition all1938 rows; they are deterministic audit routing labels over retained rationale, with all group members recorded in [excluded-groups.json](excluded-groups.json). Labels do not assert that every row in a broad category needs the same remedy.

'''
text+=table(['Category','Rows'],S['ambiguousCategories'].items())+'\n'
text+='''OpenRouter contributes1764. Its exact substantive partition is457 route-scoped top_provider output ceilings,689 other batch-subject paths,240 other Router-subject paths,362 nontext/chat-profile rows,3 exact migration conflicts,13 guide/null placeholders. Output-ceiling grouping precedes batch/Router grouping. Only13 of these1764 canonical values are null; missing metadata does not explain this deferral total. Null raw output ceilings7/464 generate no positive ceiling fact. Context-minus-output arithmetic remains excluded.

Over-deferral candidates using current ontology:

- OpenAI28 partial image/text input assertions are held using complete-set rationale. Twenty-six are already positively covered by saved models.dev; gpt-5.6-cyber has no such coverage, chat-latest has unknown lifecycle. This is misclassified/under-explained coverage and one bounded current gap, not28 absent capability values. Seven of the28 identities already have deprecation metadata; lifecycle review remains separate.
- Anthropic14 complete text-output proposals are correctly held as exhaustive assertions, but partial[text] can retain positive text support. Existing HIGH approvals for those complete assertions are deferred, so partial repair needs its own bounded identity/evidence approval. Six supposedly redundant exact source rows currently lack any selected replacement.
- Sonnet5.5 full adaptive/between_tools modes lose effort restrictions. Partial[adaptive] is a plausible salvage; conditional between_tools remains held. Opus5 toggles, legacy sampling support/defaults/maxima and hosted-tool execution dependencies cannot be repaired by simply dropping their conditions.
- Gemini Lite Image required/toggle on/off versus minimal-not-fully-off needs evidence/semantics resolution. Eight document-citation positives need File Search/Interactions scope clarification; Pro-specific AI Studio limits must not be transferred to stable Flash IDs.

OpenRouter batch, Router, nontext and route-scoped claims are not automatically over-deferred. Public aggregate metadata cannot establish intrinsic exact-model behavior on another profile. SDK/gateway plugins, server tools, rerouting mode changes and forced-tool compatibility require their recorded scope; partial sets alone do not fix them.

### Temporal groups

The following categories are primary and non-overlapping as of2026-10-02. Preview and other flags may coexist, but no row is counted twice.

'''
text+=table(['Temporal category','Rows'],S['temporalCategories'].items())+'\n'
text+='''No row is excluded solely because its ID is dated. Dated Haiku/Opus pinned releases are selected; Anthropic modern dateless names are also pinned, not evergreen. The61 deprecated/retired rows,25 moving-alias rows and42 beta rows have substantive lifecycle/condition reasons to remain held under the existing first-corpus policy. Preview101 can only be reconsidered through explicit bounded operational review; it is not capability=false.

The138 primary scheduled-retirement rows have future end dates: Sonnet4.5 (12rows,2026-11-30), OpenAI o1-pro (6rows,2026-10-22), and120 gateway rows with end dates2026-10-05 through2026-12-31. Two additional Sonnet4.5 context-management rows have the same future retirement date but are counted primarily under beta;140 rows have future dates overall. Stable values attached to these identities are not logically invalid just because lifecycle metadata exists. They could exist under explicit recheck/withdrawal/expiry policy, but the current Rule schema has no expiry field; audit metadata cannot expire runtime claims. Beta execution headers and action conditions would still need semantic handling even with expiry.

DeepSeek's two selected primary API IDs are explicitly described as moving aliases in its provider report, despite version_bound metadata on13 selected claims. They differ operationally from retired compatibility aliases and floating-latest names, but their backend target still requires recheck. The training claim is bound to captured V4.1-Flash. This is a selected lifecycle policy exception to make explicit (S14), not13 automatically invalid claims.

### Ontology groups

'''
text+=table(['Audited category','Rows'],S['ontologyCategories'].items())+'\n'
text+='''Of129 rows, seven are evidence deficiencies on existing paths: six OpenAI unknown budget/effort/image-search/citation leaves and one Anthropic web-tool compatibility record. They should be separated from true inability to represent a known value. Other OpenAI media/tool distinctions still raise scope questions; this is not a blanket reclassification of all ten OpenAI ontology rows.

Gemini22 thinking-level rows are semantic-mapping or missing-support-leaf questions, not proof that arbitrary native_string_set values cannot decode. Three signed budget domains already remain excluded because-1 dynamic and0 disabling meanings are not encoded by integer membership alone. Decoder acceptance is not semantic approval. DeepSeek mode-conditioned sampling/output defaults, prefix caching/quotas/strict-beta scope, Anthropic cross-feature incompatibility and control interactions, and gateway rerouting/plugins/native-vs-server distinctions cannot be reduced to current unconditional scalars without distortion. No schema change was made.

## 7. Candidate-to-selected accounting

There is no expansion after the893 final candidate rows. Exactly124 selected Anthropic redundant fallback rows explain the1017 total;120 of those are HIGH and4 explicit. The selected HIGH total244 includes123 Anthropic candidate +120 Anthropic redundancy +1 DeepSeek candidate. Counting only candidate HIGH would undercount by120.

All398 provider proposals have selection, excluded disposition or explicit superseded-fact links. The108 rejected proposals are accounted for procedurally; a recorded reason is not automatically a valid semantic reason. **S01** demonstrates this difference: three superseded output facts/six rows point to a broader output proposal that final/manual-review then holds. The9 other unselected redundant rows are covered by actual selected input/tool/web assertions. See [supersession-audit.json](supersession-audit.json).

Deduplication happens at model-list union, identical selected exact-key detection, and broader-fact supersession. The final assembly aggregates accepted members by RuleId; it does not silently union differing partial domains. Different researched values and constraints remain outside final selection. No candidate disappears without a recorded final classification; six redundant records have an **insufficient** coverage justification.

## 8. Rule aggregation audit

All290 Rules were checked through their exact linked rows, assertion value, provider/profile, evidence and lifecycle. Seventy-six have multiple members;214 are singleton Rules. Those76 represent803 claims, while214 singletons represent214. The727 reduction is legitimate selector aggregation, not727 suppressed capabilities.

There are zero mixed selected EXPLICIT/HIGH Rules, zero within-Rule value differences and zero profile crossings. Selected lifecycle classes are version_bound1009 andstable8; no selected preview/deprecated/time-limited member crosses into a stable group. Variant/cross-brand membership is safe when the captured assertion is independently shared: large gateway effort groups use each exact catalog allowlist, and Anthropic cross-tier tool/PDF/citation groups use bounded all-active or named compatibility scopes. Haiku REPL exceptions do not negate base code execution; detailed conditions are retained separately and must not be reinterpreted as guaranteed composability.

No Rule is forced to split purely because families/tiers differ. The four Fable/Mythos members of the web-search Rule require scope confirmation or narrower confidence/selector repair (S12). Eleven Anthropic notes carry stale Sonnet4.5 warnings despite its removal; this is evidence-note cleanup, not an actual mixed-lifecycle selector. A future assembly could append mixed-basis members while keeping first-member evidence; that code risk is not triggered by this corpus.

Three optional same-evidence merge groups could reduce290 to286 without changing exact claims: three Gemini image-model1K defaults; two Gemma operations partial content_generate Rules; two Gemma required=false Rules. These are demonstrated in [merge-opportunities.json](merge-opportunities.json). No merge is requested merely to optimize count. Rules with different evidence can be semantically shared, but merging them requires preserving attributable source/identity provenance; equal values alone are insufficient.

## 9. INFERRED_HIGH group audit

[inference-groups.md](inference-groups.md) and its machine counterpart audit31 meaningful fact/path/source/selector groups, covering244 claims. Anthropic contributes30 groups/243 claims; DeepSeek contributes one exact served-version training claim. Every selected HIGH has a recorded coordinator approval and bounded exact identity. Preview/stable/tier exceptions are retained: five/four/three generation-effort levels, Opus5.5 medium default,4.6 manual modes/budgets versus4.7+ removal, ordinary Messages output versus Batches beta, PDF/file limits, and direct-API hosted-tool scope.

HIGH is generally justified as identity-to-document expansion, not prefix inheritance. Four Fable/Mythos web-search joins are closer to MEDIUM pending direct capability-scope recheck because their recorded expansion bridges4.6+ web support through a context-guide taxonomy. Source summaries and boilerplate approvals are not a substitute for that specific capability bridge. The eight Opus/Sonnet4.6+ joins and remaining groups retain their scoped evidence basis; no blanket downgrade or244-model re-research is warranted.

The current materializer labels direct Rule assertions explicit; this is not the EXPLICIT_MODEL research confidence label. No derivation result is invented, and research confidence remains traceable through rows/manual-review.

## 10. Exact versus regex audit

[regex-promotion-review.md](regex-promotion-review.md) covers all144 pairs for the four decoder-valid Gemini patterns. Identity-pattern confidence and future capability inheritance are assessed independently. Three historical patterns have six retired matching IDs but no scoped capability facts; structural36-path coverage does not fill that evidential gap. Stable Flash3.5–3.8 is the meaningful recheck candidate: six common support booleans agree, and specialized Live/TTS/image exceptions cannot match its anchored pattern.

No current source summary commits future matching stable Flash subjects to those assertions, so no promotion is recommended **yet**. Family-language recheck could justify promotion per boolean. The concrete minimal-effort and sampling differences defeat blanket control inheritance; equal numeric/modality specifications alone do not prove future specifications. Absence of evidence, concrete divergence and irrelevant sibling exceptions are distinguished; theoretical possibility of future changes is not the sole rejection rationale.

## 11. Potential semantic loss and fact flow

The1350 intermediate facts partition as follows using selected-first precedence. Selected facts may also have excluded model members; fourteen such facts contain15 excluded rows. Full vectors, rather than additive fact counts, preserve this overlap.

'''
text+=table(['Exclusive fact destination','Facts'],S['factLevelExclusivePartition'].items())+'\n'
text+='''Of290 represented facts,214 have singleton selectors and76 aggregated selectors. Higher authorities cover427 facts/2867rows. Three repeated-evidence facts/nine rows have genuine selected replacement; three superseded facts/six rows do not. The344 ambiguous-only facts,217 temporal-only facts and66 ontology-only facts remain in durable ledgers rather than being erased.

**Structurally missing/unaccounted intermediate facts:0. Selected assertion losses:0. Proven false supersession coverage:6 rows/3facts.** Potential positive representation improvements are bounded, require review and are not a count of newly approved Rules. Twenty-six OpenAI partial inputs are already covered, so their misclassification is not current canonical value loss. Anthropic positive output spans14 exact paths, including the six failed supersession rows; count those model/path opportunities once.

Only161/264 provider evidence IDs are directly referenced by intermediate facts. The103 others include inventory, lifecycle, API schema, discovery/failed-read and source-context records also referenced by inventories/reviews/reports. Not directly linked to a fact does not mean103 useful capabilities were discarded. Specialized OpenAI record summaries often preserve only page inspection and null candidates; the evidence does not support manufacturing omitted facts. Historical Gemini regex evidence is a concrete example of insufficient pre-fact capture, not deletion during6333-row processing.

'''
text+=table(['Finding','Severity','What requires action'],[
('S01','HIGH','6 redundant output rows have no selected replacement'),('S02','HIGH','28 already-partial OpenAI inputs retain complete-set deferral rationale'),('S03–S04','MEDIUM','Partial text/adaptive-mode positive salvage'),('S05','MEDIUM','7 evidence gaps mislabeled ontology limitations'),('S06–S07','MEDIUM','138 future-end rows and cross-provider fallback policy'),('S08','MEDIUM','Stable Flash six boolean regex family rechecks'),('S09–S10','LOW','11 stale notes and self-sibling terminology'),('S11','MEDIUM','Four selected higher-source disagreements remain fallback-only'),('S12','MEDIUM','Four Fable/Mythos web-search HIGH joins need capability-specific bridge'),('S13','LOW','Historical regex matches have no scoped capability facts'),('S14','MEDIUM','13 selected DeepSeek claims use moving primary serving aliases')])+'\n'
text+='All questionable groups/Rules have evidence refs, rationale, suggestion, confidence and external-check need in [suspicious-decisions.jsonl](suspicious-decisions.jsonl). Findings are not summed as lost facts because their affected rows overlap. No evidence-backed BLOCKER was found in the selected decoder/materialization accounting. The strongest deficiencies are disposition quality and bounded capability-scope confidence, not raw Rule count.\n\n'
text+='## 12. Owner decisions required\n\nSeven decision packages; subtype actions do not create additional mandatory approval counts. Audit preparation and outputs are complete; this audit does not execute the repairs.\n\n'+table(['ID','Type','Concrete decision'],owner)+'\n'
text+='''The recommended next step is targeted repair of the **research dispositions/provenance**, followed by bounded semantic review. Current source priority, conditional ontology and lifecycle semantics remain authoritative. The selected290-Rule core is structurally suitable for Owner inspection, but the overall completeness/readiness claim should include this audit and cannot be endorsed unchanged. No publication or Apply follows from this conclusion.

## 13. Reproduction, integrity and Git

Run only the new scripts, from repository root:

```powershell
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/audits/fact-to-rule-20261002/materialization-audit.mjs
python -X utf8 docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/audits/fact-to-rule-20261002/reconstruct.py
python -X utf8 docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/audits/fact-to-rule-20261002/write-audit.py
```

Original validate-corpus/validate-research/assembly/report writers were inspected but **not executed**, because they overwrite existing research artifacts. This audit uses no DB-heavy test, native rebuild, Electron smoke, adapter network fetch or external provider re-research. Current decoder/materializer checks run against in-memory fixtures. No ABI mismatch was encountered, no ABI target was changed, and no native artifact was generated or committed.

Branch models-dev-capability-resolution, baseline HEAD ca2d9bd95023f7076e988863f53bdf86c0b4894e. The unrelated untracked pelican-bicycle.html is preserved. [input-manifest.json](input-manifest.json) freezes75 pre-existing research files; [scope-verification.json](scope-verification.json) records the final hash/Git check. No commit, push, production/schema/resolver/provider-adapter/database/release change, Rule application or publication.
'''
write('fact-to-rule-audit.md',text)
write('README.md','# Read-only fact-to-Rule audit\n\nStart with [fact-to-rule-audit.md](fact-to-rule-audit.md). Required outputs: [fact-flow-summary.json](fact-flow-summary.json), [suspicious-decisions.jsonl](suspicious-decisions.jsonl), [inference-groups.md](inference-groups.md), [regex-promotion-review.md](regex-promotion-review.md). Supporting machine files contain all1350fact vectors,6333row chains,290Rule checks,31inference groups and144regex family/path reviews. Existing75research artifacts are frozen and hash-verified. These are audit judgments, not candidate changes or an approved release.\n')
print(json.dumps({'status':'AUDIT_RENDERED','suspiciousRecords':len(suspicious),'severityCounts':S['semanticAudit']['severities'],'ownerDecisionPackages':len(owner),'inferenceGroups':len(groups),'regexPairs':len(regexreviews),'mainReportLines':len(text.splitlines())},indent=2))
