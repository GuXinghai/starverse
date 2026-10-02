"""Research-only coverage/audit/report generator. No app state or publication."""
import json, pathlib, collections, datetime, copy
ROOT=pathlib.Path(__file__).parent
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8-sig'))
def write(name,obj): (ROOT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
facts=read('facts/openrouter.json');rules=read('candidates/openrouter.json');validation=read('evidence/openrouter-validation.json')
sources=[json.loads(x) for x in (ROOT/'evidence/openrouter.jsonl').read_text(encoding='utf-8').splitlines()]
source_by_id={s['evidenceId']:s for s in sources}
text=read('evidence/openrouter-models-public-snapshot.json')['data'];allmodels=read('evidence/openrouter-models-all-public-snapshot.json')['data']
text_by_id={m['id']:m for m in text};md=read('evidence/openrouter-models-dev-comparison.json')['provider']['models'];paths=validation['canonicalPaths'];summary=read('evidence/openrouter-summary.json')
AT=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
native_fields={'limits.contextWindow.maxTokens':'context_length','modalities.input':'architecture.input_modalities','modalities.output':'architecture.output_modalities','reasoning.support':'reasoning','reasoning.required':'reasoning.mandatory','reasoning.effort.providerDefault':'reasoning.default_effort'}
md_fields={'limits.contextWindow.maxTokens':'limit.context','limits.input.maxTokens':'limit.input','limits.output.maxTokens':'limit.output','modalities.input':'modalities.input','modalities.output':'modalities.output','input.attachments.support':'attachment','reasoning.support':'reasoning','tools.calling.support':'tool_call','structuredOutput.support':'structured_output','sampling.temperature.support':'temperature'}
def nested(obj,field):
 for part in field.split('.'):
  if not isinstance(obj,dict) or part not in obj:return 'field_absent',None
  obj=obj[part]
 return ('explicit_null' if obj is None else 'raw_present'),obj
def native(m,path):
 if path not in native_fields:return 'static_unmapped',None
 if m['id'] not in text_by_id:return 'outside_default_text_native_payload',None
 state,v=nested(m,native_fields[path]);return state,v
def modelsdev(id,path):
 d=md.get(id)
 if d is None:return 'exact_entry_absent',None
 if path in md_fields:return nested(d,md_fields[path])
 if path=='reasoning.effort.nativeValues':return 'deliberately_unmapped_openrouter_effort',None
 if path in ('reasoning.toggle.support','reasoning.budgetTokens.support','reasoning.budgetTokens.domain'):
  kind='toggle' if path=='reasoning.toggle.support' else 'budget_tokens';options=[o for o in d.get('reasoning_options',[]) if o.get('type')==kind]
  if len(options)!=1:return ('option_absent' if not options else 'duplicate_invalid'),None
  if path.endswith('domain'):return 'raw_present',{'min':options[0].get('min'),'max':options[0].get('max')}
  return 'raw_present',True
 return 'static_unmapped',None
fact_index=collections.defaultdict(list);rule_index=collections.defaultdict(list)
for f in facts:
 for id in f['explicitModels']:fact_index[(id,f['canonicalPath'])].append(f)
for r in rules:
 for id in r['selector']['nativeModelIds']:rule_index[(id,r['assertion']['path'])].append(r)
rows=[]
for m in allmodels:
 for path in paths:
  n,nv=native(m,path);d,dv=modelsdev(m['id'],path);ff=fact_index[(m['id'],path)];rr=rule_index[(m['id'],path)]
  rows.append(dict(nativeModelId=m['id'],namespace=m['id'].split('/')[0],canonicalPath=path,defaultTextCatalog=m['id'] in text_by_id,providerNativeStaticField=native_fields.get(path),providerNativeSnapshotFieldStatus=n,providerNativeRawValue=nv,modelsDevSnapshotFieldStatus=d,modelsDevRawValue=dv,factIds=[f['factId'] for f in ff],factClassifications=sorted(set(f['classification'] for f in ff)),candidateRuleIds=[r['ruleId'] for r in rr],explicitCoverage=bool(ff),inference=None,unknownPolicy='Missing/null are unknown; this is public raw/static projection, never persisted/currently-running app evidence.'))
(ROOT/'evidence/openrouter-coverage-by-model.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in rows),encoding='utf-8')
coverage=[]
for path in paths:
 rr=[x for x in rows if x['canonicalPath']==path];fs=[f for f in facts if f['canonicalPath']==path]
 coverage.append(dict(canonicalPath=path,inventoryModels=len(allmodels),defaultTextModels=len(text),providerNativeStaticField=native_fields.get(path),providerNativePublicRawPresentModels=sum(x['providerNativeSnapshotFieldStatus']=='raw_present' for x in rr),modelsDevPublicRawPresentModels=sum(x['modelsDevSnapshotFieldStatus']=='raw_present' for x in rr),candidateRuleCount=sum(r['assertion']['path']==path for r in rules),candidateExactModelCount=len({x for r in rules if r['assertion']['path']==path for x in r['selector']['nativeModelIds']}),classificationCounts=dict(collections.Counter(f['classification'] for f in fs)),unassertedInventoryModels=sum(not x['explicitCoverage'] for x in rr),apiLevelGapFactIds=[f['factId'] for f in fs if not f['explicitModels']],unknownPolicy='No negative capability inferred from zero coverage or absent fields.'))
write('evidence/openrouter-coverage-audit.json',dict(verifiedAt=AT,ontologyPathCount=len(paths),modelPathRows=len(rows),scope='All 645 exact inventory IDs x 36 paths; static adapters + live public raw snapshots; no app DB opened.',paths=coverage))
conflicts=[]
def conflict(key,a,b,scope,explanation,disposition,question):
 conflicts.append(dict(conflictId='openrouter.conflict.'+key,sourceA=dict(evidenceId=a,url=source_by_id[a]['url'],retrievedAt=source_by_id[a]['retrievedAt'],publishedAt=source_by_id[a]['publishedAt'],updatedAt=source_by_id[a]['updatedAt']),sourceB=dict(evidenceId=b,url=source_by_id[b]['url'],retrievedAt=source_by_id[b]['retrievedAt'],publishedAt=source_by_id[b]['publishedAt'],updatedAt=source_by_id[b]['updatedAt']),modelOrApiScope=scope,apiVersion='v1',likelyExplanation=explanation,proposedDisposition=disposition,unresolvedQuestion=question))
conflict('opus55-default','openrouter.inventory.20261002','openrouter.opus55-migration','anthropic/claude-opus-5.5 default effort','Catalog high versus guide omitted-effort medium; gateway UI advertised default and forwarded omission may differ. Neither page has a known update time.','AMBIGUOUS_DEFER; no default Rule; existing native mapping may still ingest high.','Which value describes OpenRouter effective omitted-effort behavior on each backend?')
conflict('opus5-budget','openrouter.opus5-migration','openrouter.opus55-migration','anthropic/claude-opus-5 reasoning.max_tokens','Opus5 guide says budget ignored; Opus5.5 guide says predecessor accepts fixed budgets. Possible migration prose stale/scope-specific; no supersession date established.','AMBIGUOUS_DEFER; no Opus5 budget Rule.','Did Opus5 budget forwarding change, or is predecessor comparison inaccurate?')
conflict('sonnet5-none','openrouter.inventory.20261002','openrouter.sonnet5-migration','anthropic/claude-sonnet-5 effort domain','Catalog allowlist excludes none, guide describes disabling with none. enabled=false can be independently documented; effort vocabulary and toggle channel may differ.','AMBIGUOUS_DEFER for complete effort-domain Rule; enabled=false positive agrees with models.dev and is not duplicated.','Is none rejected, coerced, or accepted on exact Sonnet5 by each backend?')
conflict('unified-shorthand','openrouter.reasoning-guide','openrouter.parameter-guide','reasoning.effort vs reasoning_effort','Unified parameter documents max while shorthand enum lacks max; different API schema/normalization surfaces.','Use exact supported_efforts for unified reasoning.effort; do not assert shorthand equivalence.','Is shorthand max accepted or restricted on v1 chat?')
conflict('generic-default','openrouter.reasoning-guide','openrouter.inventory.20261002','Generic enabled=true shorthand vs per-model default_effort','Generic medium example may be enabling convention, not omitted per-model default.','No universal medium default; use exact fields when reliable.','Which parameters determine enabling default when effort omitted?')
conflict('sonnet5-endpoints','openrouter.inventory.20261002','openrouter.endpoints.anthropic.claude-sonnet-5','structured_outputs availability','Model-level metadata aggregates capabilities, while Bedrock endpoint supported_parameters omits structured_outputs.','Availability is advertised/route-dependent; require_parameters execution prerequisite outside Rules.','Should model-level support mean any compatible route, or must coordinator defer such flags?')
conflict('gemini38-endpoints','openrouter.inventory.20261002','openrouter.endpoints.google.gemini-3.8-flash','sampling parameters availability','AI Studio endpoints include temperature/top_p; Vertex sample omits them.','No every-route support guarantee and no unsupported assertion from omissions.','How should gateway availability be presented with pinned backend constraints?')
conflict('claude47-identity','openrouter.claude47-migration','openrouter.inventory.20261002','Migration exact ID anthropic/claude-4.7-opus absent; catalog anthropic/claude-opus-4.7','Likely stale/example spelling; no exact-ID identity proof or redirect was retrieved.','No Rule attached to absent ID; no rewriting or cross-sibling inference.','Does official redirect/archive explicitly link these identities?')
conflict('claude-default-history','openrouter.claude47-migration','openrouter.sonnet5-migration','Historical Anthropic opt-in reasoning versus new Sonnet5 on-by-default','June22 legacy family wording predates Sonnet5 release; exact later guide is narrower.','No global Anthropic default; default_enabled has ontology gap.','Need a future canonical default-enabled path rather than toggle reuse?')
conflict('image-profile','openrouter.image-api','openrouter.image-api-announcement','Dedicated Images versus existing Chat image models','Dedicated API docs emphasize image discovery, but June23 continuation and September18 comparison preserve chat for exact text-image overlap.','9 exact positive chat-image candidates; dedicated model domains remain deferred.','Can coordinator accept advertised image generation flag without implying dedicated API controls?')
conflict('modelsdev-input','openrouter.inventory.20261002','openrouter.modelsdev-comparison','119 exact input-modality raw differences','Many models.dev entries advertise pdf while OpenRouter metadata says file; generic_file versus pdf are different canonical meanings. Other extra modality differences remain in per-model comparison.','No broad input replacement Rule; native mapped metadata takes precedence; preserve raw discrepancies.','Should native file imply PDF specifically, or only generic_file? No inference proposed.')
conflict('modelsdev-reasoning','openrouter.inventory.20261002','openrouter.modelsdev-comparison','rekaai/reka-edge, qwen/qwen3-max, qwen/qwen-plus-2025-07-28','OpenRouter reasoning object present but models.dev reasoning=false. Current first-party metadata stronger; Qwen entries have imminent expiry.','Native mapped support already resolves first-party facts when ingested; no redundant or expiring correction Rule.','Is reasoning object indicative of semantic reasoning rather than gateway-only metadata for Reka Edge?')
conflict('modelsdev-output','openrouter.inventory.20261002','openrouter.modelsdev-comparison','minimax/minimax-01 output max','models.dev output=40000 differs from top_provider.max_completion_tokens; primary-provider and model-wide ceilings may have different scope.','AMBIGUOUS_DEFER; do not promote top-provider ceiling into model maximum.','What is the exact model-level output maximum across routes?')
write('evidence/openrouter-conflict-audit.json',dict(verifiedAt=AT,conflicts=conflicts,upstreamDocumentationNotAuthority=True))
preview=[f for f in facts if f['classification']=='RULE_CANDIDATE' and f['temporalAssessment']['temporalClass']=='preview']
eligible=[r['ruleId'] for r in rules if not any(f['factId'] in [x['factId'] for x in preview] for f in facts if r['ruleId'] in f['proposedRuleIds']) and not r['assertion']['path'].endswith('providerDefault') and r['assertion']['path']!='generation.effort.nativeValues']
needs_review=[r['ruleId'] for r in rules if r['ruleId'] not in eligible]
write('evidence/openrouter-temporal-audit.json',dict(verifiedAt=AT,expirationModels=summary['expiredOrExpiringCatalogModels'],nearTermBeforeOrOnRecheck=[x for x in summary['expiredOrExpiringCatalogModels'] if x['date']<='2026-10-09'],candidatePreviewFacts=[dict(factId=f['factId'],models=f['explicitModels'],ruleIds=f['proposedRuleIds']) for f in preview],candidateExpirationModels=[],candidateAliasModels=[],dateCutoverTime=None,recheckAfter='2026-10-09',lifecyclePolicy='version_bound is current captured metadata/release scope; ordinary IDs are not proven immutable. Preview spelling is a review flag, not provider lifecycle proof.',coordinatorFirstCorpusReviewEligibleRuleIds=eligible,ownerReviewBeforeInclusionRuleIds=needs_review,publication=False))
write('evidence/openrouter-naming-audit.json',dict(verifiedAt=AT,namespaceCounts=dict(collections.Counter(m['id'].split('/')[0] for m in allmodels)),tokenizerFamilyCounts=dict(collections.Counter(m.get('architecture',{}).get('tokenizer') for m in allmodels)),variantSuffixCounts=dict(collections.Counter(m['id'].split(':',1)[1] for m in allmodels if ':' in m['id'])),floatingAliases=[dict(id=m['id'],target=m.get('alias_target')) for m in allmodels if m.get('alias_target')],routers=[m['id'] for m in allmodels if m.get('architecture',{}).get('tokenizer')=='Router'],regexCount=0,regexDisposition='KNOWN_MEMBERS_ONLY; no FUTURE_SERIES_SAFE assertion proposed. OpenRouter can independently alter upstream variants, aliases, routing, effort normalization and backend support.'))
# Promote reviewed-source metadata and make durable source -> conflict linkage.
for s in sources:
 s['contradictions']=[c['conflictId'] for c in conflicts if s['evidenceId'] in (c['sourceA']['evidenceId'],c['sourceB']['evidenceId'])]
 if s['evidenceId']=='openrouter.inventory.20261002':s['exactModelsNamed']=[m['id'] for m in text]
 if s['evidenceId']=='openrouter.inventory-all.20261002':s['exactModelsNamed']=[m['id'] for m in allmodels]
 s['nextQuestion']='Coordinator review of exact model scope, route semantics, conflicts and temporal qualification before inclusion; no publication.'
(ROOT/'evidence/openrouter.jsonl').write_text(''.join(json.dumps(s,ensure_ascii=False,separators=(',',':'))+'\n' for s in sources),encoding='utf-8')
for f in facts:
 f['conflictRefs']=[c['conflictId'] for c in conflicts if any(ref in (c['sourceA']['evidenceId'],c['sourceB']['evidenceId']) for ref in f['evidenceRefs'])]
 f['nextQuestion']='Coordinator review exact assertion, static/live coverage distinction and associated conflicts; no autonomous inclusion.'
write('facts/openrouter.json',facts)
report=ROOT/'providers/openrouter.md'
log=report.read_text(encoding='utf-8')
if '## Durable cluster log\n' in log:log=log.split('## Durable cluster log\n',1)[1].lstrip()
intro=f'''# OpenRouter provider research — 2026-10-02 (Asia/Tokyo)

Research corpus complete, **not published**. Launch preflight verified `gpt-6.1-sol` / `high`; no mismatch or substitute. Branch `models-dev-capability-resolution`. Scope only `openrouter` / `openrouter-first-party-v1`; models.dev key `openrouter`. All eight contracts and AGENTS.md read before external research. No child agents, production/schema/adapter/DB edits, commit, or publication.

## Inventory and search coverage

Unauthenticated [public models API](https://openrouter.ai/api/v1/models) returned **464 text-output IDs** at 2026-10-02T05:14:00.920Z. The `output_modalities=all` snapshot returned **645 exact IDs**, including 181 outside the default text payload. Returned paging/metadata and full compact snapshots are saved; this establishes public identities and metadata, never entitlements or generation success. Native IDs come from `id`; `canonical_slug` and `links.details` are separate identifiers. Endpoint URLs were taken from catalog links rather than invented from IDs.

Live built-in web search, **Chrome**, and **Exa** were all available. Chrome read catalog/parameter documentation; Exa reviewed 20 search results across three workstreams and fetched targeted official pages. All retained authority is OpenRouter first-party; upstream documentation is never assertion authority. The ledger contains **{len(sources)} records**, including discovery-only URLs, not {len(sources)} independently verified model pages. First-party surfaces include catalog/SDK schemas, model pages/migration guides, unified parameters, reasoning, tools, structured outputs, routing, PDF/multimodal, Image API/chat continuation/server tools, web search/plugins, context transforms, batch API, changelog and dated blog announcements. Full catalog metadata scanned; individual model pages and endpoint matrices sampled rather than exhaustively tested.

Models/families are catalog-derived across {len(set(m['id'].split('/')[0] for m in allmodels))} namespaces; tokenizer and suffix distributions are in `evidence/openrouter-naming-audit.json`. OpenAI GPT/o-series, Anthropic Claude, Google Gemini, Qwen, DeepSeek, Llama and other catalog families receive no upstream/sibling inheritance. Floating `~latest` aliases, dynamic routers, batch variants and expiring members are excluded from candidate assertions. Ordinary version-bound IDs denote captured current releases, not a guarantee the public slug is immutable. Regex count **0**; inheritance disposition **KNOWN_MEMBERS_ONLY**.

## Facts and useful additions

**{len(facts)} intermediate facts**, **{len(rules)} current-schema Rules**, **{summary['explicitRuleSubjects']} exact candidate model subjects**, **{validation['exactSubjectPathCount']} model/path assertions**, **0 inferred-high**, **0 regex**. Every Rule links to exactly one fact via `factId` / `proposedRuleIds`; all inferred lists are empty. No absence-to-unsupported conversion, input/output arithmetic, invented ID, or synthetic numeric bound/domain.

| Classification | Grouped facts |
|---|---:|
'''
for name,count in summary['classificationCounts'].items():intro+=f'| {name} | {count} |\n'
intro+='\n| Canonical path | Candidate Rules | Exact subjects |\n|---|---:|---:|\n'
for name,count in summary['rulePathCounts'].items():intro+=f'| `{name}` | {count} | {summary["ruleModelCoverageByPath"][name]} |\n'
intro+=f'''
Provider Native statically maps context, modalities, reasoning support/required/default effort **when present in the actual default public payload**. The current SDK allowlist semantics justify exact `reasoning.supported_efforts` domains that both native/models.dev adapters deliberately leave unmapped. Null allowlists are unrestricted gateway acceptance metadata, not complete native model domains; omissions stay unknown. Mandatory reasoning is explicit negative toggle evidence. Positive `none` toggle and budget support already adequately represented by current models.dev are removed where redundant. o3-mini's exact OpenRouter page fills genuinely omitted effort/default fields. Sonnet5 and Opus5.5 budgets are explicitly ignored/not forwarded, hence functional unsupported; Opus5 conflict stays deferred.

Top-k availability and non-null per-model sampling defaults add unmapped facts, but defaults/union support need coordinator route-semantics review. Nine exact existing text-plus-image model entries merit image-generation flags: catalog defines image output as generation, and first-party continuation/current chat comparison confirm the transport. Image output/flag does not imply complete text reliability, dedicated API controls, or universal ratio/resolution domains. Sonnet5 whole-response effort is a separate generation control requiring semantic review; it is never silently conflated with the reasoning channel.

Tools, structured outputs and temperature were broadly researched. Most exact positive/negative flags are already adequately in models.dev; the two apparent positive gaps were dynamic routers, so **no extra tools/structured/temperature-support Rules** remain. This is evidence-driven redundancy removal, not a narrow missing-fields-only search.

## Full coverage and limitations

`evidence/openrouter-coverage-audit.json` covers **all 36 canonical paths**. `openrouter-coverage-by-model.jsonl` contains **23,220 exact model/path rows** (645 x 36), with Provider Native static field/current public presence, models.dev public raw fields, fact disposition and Rule linkage. This is static-plus-live-public coverage; **no installed app DB or current runtime facts were inspected**. ALREADY_PROVIDER_NATIVE means static projection with a present public field, not proof an installation has ingested it. Nontext models remain profile-deferred. Zero rows/assertions mean unknown, never unsupported.

Four endpoint samples (GPT6.1 Sol, Gemini3.8 Flash, Sonnet5, o3-mini) show concrete backend differences. Sonnet5 Bedrock omits structured_outputs whereas other endpoints advertise it; Gemini3.8 Vertex sampling differs from AI Studio. Model catalog support is advertised availability; `require_parameters`, provider pins, request shape, account policy and beta routing are execution prerequisites that cannot be inserted into current model-level Rules. No paid/authenticated generation probes were made.

Open ontology gaps/deferred concepts include reasoning default-enabled state, routing modes, forced tool-choice compatibility, shell execution, native-vs-fallback search, file-parser annotations vs citations, compression plugin vs native context actions, Messages-only controls, batch provider/modalities restrictions, dedicated image endpoint capability unions/clamping, native tool-use training, image search, exact numeric budgets and model temperature maxima. Gateway accepted ranges, OCR limits and reasoning percentages are not model bounds. Detailed non-Rule facts retain explicit nulls and the next question.

## Conflicts and lifecycle

`openrouter-conflict-audit.json` records source pairs, actual retrieval/publication/update information, API/model scope, possible explanation, proposed disposition and unresolved question. Most important: Opus5.5 catalog default high vs guide omitted-effort medium; Opus5 ignored budgets vs successor-guide fixed-budget comparison; Sonnet5 effort allowlist vs none-disable text; shorthand versus unified max; historical default/identity spelling; route aggregation and image transport distinctions. No conflicting official value is silently selected for publication.

**30 catalog IDs have explicit expiration dates**. Their proposed Rules are excluded, with early October removals listed in the temporal audit. `validThrough` is null because exact cutover time is unknown; dates appear under `deprecatedAfter`, not an invented Rule expiry field. Preview candidate Rules carry `REQUIRES_PREVIEW_REVIEW` and recheck date 2026-10-09. Floating aliases/router coercion and batch identity differences are deferred. Temporal/spelling labels are review qualifications, not provider-guaranteed lifecycle statements.

## Coordinator handoff and validation

All **{len(rules)} Rules** pass `decodeCapabilityRuleCoreRuleV1` and an ephemeral disabled fixture passes `decodeCapabilityRuleCorePackV1`. Exact IDs, authority/profile, evidence refs, unique IDs, fact linkage, duplicate/conflicting subject-path assertions and selector size checks pass. Validation command and UTC timestamp are in `evidence/openrouter-validation.json`. No Pack organization/release is persisted; `candidates/openrouter.json` is an actual Rules array.

First-corpus review: **{len(eligible)}** non-preview/non-default/non-generation-effort Rules are the stronger initial review pool; **{len(needs_review)}** require explicit temporal/default/whole-response semantic review. These are coordinator recommendations, not owner decisions or approval. All require the coordinator's independent evidence and OpenRouter model-level routing interpretation review before inclusion. Deferred source conflicts/expiry/alias/batch/API scopes stay out. No cross-provider policy was decided.

Only OpenRouter-owned research paths were written. The working tree initially/finally has the shared untracked research root plus unrelated `pelican-bicycle.html`; other providers' files are preserved. No staging, commits or release publication. Decoder-only Node validation does not load better-sqlite3: ABI mismatch encountered **no**, rebuild command **none**, current ABI target **unchanged / not inspected**, tests retried **none**, Electron smoke **not run**, no native artifacts committed **confirmed**.

**NEXT QUESTION / coordinator action:** resolve Opus5 budget and Opus5.5 default conflicts; define advertised-any-route support versus pinned-backend requirements; review preview and providerDefault qualification plus Sonnet5 generation-effort mapping; then independently select exact research candidates for a corpus. Do not publish this research corpus automatically.

## Durable cluster log

'''
report.write_text(intro+log.removeprefix('# OpenRouter provider research\n'),encoding='utf-8')
print(json.dumps(dict(auditedAt=AT,models=len(allmodels),paths=len(paths),rows=len(rows),conflicts=len(conflicts),sourceTypes=dict(collections.Counter(s['sourceType'] for s in sources)),firstReviewPool=len(eligible),ownerReview=len(needs_review)),indent=2))
