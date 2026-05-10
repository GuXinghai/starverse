export type DbMethodRegistryEntry = Readonly<{
  name: string
  renderer: boolean
  worker: boolean
  domain: string
}>

export const DB_METHODS = [
  { name: 'db.reset', renderer: false, worker: false, domain: 'db' },
  { name: 'health.ping', renderer: true, worker: true, domain: 'health' },
  { name: 'project.create', renderer: true, worker: true, domain: 'project' },
  { name: 'project.save', renderer: true, worker: true, domain: 'project' },
  { name: 'project.list', renderer: true, worker: true, domain: 'project' },
  { name: 'project.delete', renderer: true, worker: true, domain: 'project' },
  { name: 'project.findById', renderer: true, worker: true, domain: 'project' },
  { name: 'project.findByName', renderer: true, worker: true, domain: 'project' },
  { name: 'project.countConversations', renderer: true, worker: true, domain: 'project' },
  { name: 'project.countConversationsBatch', renderer: true, worker: true, domain: 'project' },
  { name: 'project.getInbox', renderer: true, worker: true, domain: 'project' },
  { name: 'convo.create', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.save', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.saveWithMessages', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.list', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.delete', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.deleteMany', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.archive', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.archiveMany', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.restore', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.setProject', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.setProjectMany', renderer: true, worker: true, domain: 'convo' },
  { name: 'convo.listArchived', renderer: true, worker: true, domain: 'convo' },
  { name: 'message.append', renderer: true, worker: true, domain: 'message' },
  { name: 'message.appendDelta', renderer: true, worker: true, domain: 'message' },
  { name: 'message.list', renderer: true, worker: true, domain: 'message' },
  { name: 'message.replace', renderer: true, worker: true, domain: 'message' },
  { name: 'message.setStatus', renderer: true, worker: true, domain: 'message' },
  { name: 'message.setAnnotations', renderer: true, worker: true, domain: 'message' },
  { name: 'message.appendReasoningDetailSegments', renderer: true, worker: true, domain: 'message' },
  { name: 'message.finalizeReasoningDetails', renderer: true, worker: true, domain: 'message' },
  { name: 'message.setReasoningRequestConfig', renderer: true, worker: true, domain: 'message' },
  { name: 'message.getReasoningSegmentsStats', renderer: true, worker: true, domain: 'message' },
  { name: 'messageError.upsert', renderer: true, worker: true, domain: 'messageError' },
  { name: 'messageError.listByMessageIds', renderer: true, worker: true, domain: 'messageError' },
  { name: 'messageAsset.persistFromDataUrls', renderer: true, worker: true, domain: 'messageAsset' },
  { name: 'messageAsset.listByMessageIds', renderer: true, worker: true, domain: 'messageAsset' },
  { name: 'messageAsset.getById', renderer: false, worker: true, domain: 'messageAsset' },
  { name: 'fileAsset.create', renderer: true, worker: true, domain: 'fileAsset' },
  { name: 'fileAsset.getById', renderer: true, worker: true, domain: 'fileAsset' },
  { name: 'fileAsset.listByIds', renderer: true, worker: true, domain: 'fileAsset' },
  { name: 'fileAsset.softDelete', renderer: true, worker: true, domain: 'fileAsset' },
  { name: 'fileAsset.planPhysicalCleanup', renderer: true, worker: true, domain: 'fileAsset' },
  { name: 'fileDerivative.create', renderer: true, worker: true, domain: 'fileDerivative' },
  { name: 'fileDerivative.getById', renderer: true, worker: true, domain: 'fileDerivative' },
  { name: 'fileDerivative.listByParentAssetId', renderer: true, worker: true, domain: 'fileDerivative' },
  { name: 'fileDerivative.getLatestReady', renderer: true, worker: true, domain: 'fileDerivative' },
  { name: 'derivativeJob.create', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'derivativeJob.getById', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'derivativeJob.listByAssetId', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'derivativeJob.run', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'derivativeJob.retry', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'derivativeJob.cancel', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'derivativeJob.capturePdfAnnotations', renderer: true, worker: true, domain: 'derivativeJob' },
  { name: 'messageAttachment.create', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'messageAttachment.listByMessageId', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'messageAttachment.listByAssetId', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'messageAttachment.detach', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'messageAttachment.getAssetOwnership', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'messageAttachment.getCandidateSnapshot', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'messageAttachment.markAssetAbandoned', renderer: true, worker: true, domain: 'messageAttachment' },
  { name: 'conversationDraft.restore', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.updateText', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.addAttachment', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.removeAttachment', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.updateAttachmentSettings', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.commitToUserMessage', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.attachToMessage', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'conversationDraft.cloneFromMessage', renderer: true, worker: true, domain: 'conversationDraft' },
  { name: 'sendPlan.buildCurrent', renderer: true, worker: true, domain: 'sendPlan' },
  { name: 'sendPlan.prepareOpenRouter', renderer: true, worker: true, domain: 'sendPlan' },
  { name: 'sendPlan.prepareOpenRouterReplayFromMessage', renderer: true, worker: true, domain: 'sendPlan' },
  { name: 'fileIngestion.ingestLocalFile', renderer: true, worker: true, domain: 'fileIngestion' },
  { name: 'fileIngestion.ingestUrl', renderer: true, worker: true, domain: 'fileIngestion' },
  { name: 'preview.getLatestReady', renderer: true, worker: true, domain: 'preview' },
  { name: 'preview.ensure', renderer: true, worker: true, domain: 'preview' },
  { name: 'fileType.detectBasic', renderer: false, worker: true, domain: 'fileType' },
  { name: 'fileType.detectFull', renderer: false, worker: true, domain: 'fileType' },
  { name: 'fileType.markStale', renderer: false, worker: true, domain: 'fileType' },
  { name: 'enginePluginLifecycle.listOfficialPlugins', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.listInstalledPlugins', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.registerLocalOfficialPlugin', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.enablePlugin', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.disablePlugin', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.uninstallPlugin', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.runHealthCheck', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.registerLocalPackage', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'enginePluginLifecycle.getDiagnosticsSummary', renderer: true, worker: true, domain: 'enginePluginLifecycle' },
  { name: 'branch.ensureDefault', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.list', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.createFromMessage', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.delete', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.beginTurn', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.switchCandidate', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.regenerateFromQuestion', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.getPathMessages', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.getCandidates', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.getQuestionCandidates', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.getEffectiveFilters', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.setHead', renderer: true, worker: true, domain: 'branch' },
  { name: 'branchChoice.set', renderer: true, worker: true, domain: 'branchChoice' },
  { name: 'branchAnswerHide.set', renderer: true, worker: true, domain: 'branchAnswerHide' },
  { name: 'branch.retryReplaceAnswer', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.switchQuestionCandidate', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.forkQuestion', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.retryReplaceQuestion', renderer: true, worker: true, domain: 'branch' },
  { name: 'branch.truncateFromQuestion', renderer: true, worker: true, domain: 'branch' },
  { name: 'branchFilter.set', renderer: true, worker: true, domain: 'branchFilter' },
  { name: 'branchFilter.clear', renderer: true, worker: true, domain: 'branchFilter' },
  { name: 'context.buildForBranch', renderer: true, worker: true, domain: 'context' },
  { name: 'context.getRenderableTurns', renderer: true, worker: true, domain: 'context' },
  { name: 'search.fulltext', renderer: true, worker: true, domain: 'search' },
  { name: 'search.query', renderer: true, worker: true, domain: 'search' },
  { name: 'search.rebuildIndex', renderer: true, worker: true, domain: 'search' },
  { name: 'maintenance.optimize', renderer: true, worker: true, domain: 'maintenance' },
  { name: 'health.stats', renderer: true, worker: false, domain: 'health' },
  { name: 'usage.log', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.getProjectStats', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.getConvoStats', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.getModelStats', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.getDateRangeStats', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.aggregate', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.drillDown', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.reasoningTrend', renderer: true, worker: true, domain: 'usage' },
  { name: 'usage.reasoningModelComparison', renderer: true, worker: true, domain: 'usage' },
  { name: 'prefs.save', renderer: true, worker: true, domain: 'prefs' },
  { name: 'prefs.list', renderer: true, worker: true, domain: 'prefs' },
  { name: 'prefs.delete', renderer: true, worker: true, domain: 'prefs' },
  { name: 'prefs.default', renderer: true, worker: true, domain: 'prefs' },
  { name: 'modelPrefs.listFavorites', renderer: true, worker: true, domain: 'modelPrefs' },
  { name: 'modelPrefs.addFavorite', renderer: true, worker: true, domain: 'modelPrefs' },
  { name: 'modelPrefs.removeFavorite', renderer: true, worker: true, domain: 'modelPrefs' },
  { name: 'modelPrefs.reorderFavorites', renderer: true, worker: true, domain: 'modelPrefs' },
  { name: 'modelPrefs.listRecents', renderer: true, worker: true, domain: 'modelPrefs' },
  { name: 'modelPrefs.recordRecent', renderer: true, worker: true, domain: 'modelPrefs' },
  { name: 'modelCatalog.syncSnapshot', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.syncCoreSnapshot', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.list', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.getCoreMeta', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.getModelDetail', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.replaceEndpointMeta', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.listEndpointMeta', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'modelCatalog.queryCore', renderer: true, worker: true, domain: 'modelCatalog' },
  { name: 'reasoningIndex.syncFromCatalog', renderer: true, worker: true, domain: 'reasoningIndex' },
  { name: 'reasoningIndex.list', renderer: true, worker: true, domain: 'reasoningIndex' },
  { name: 'settings.getOpenRouterProviderRequireParameters', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setOpenRouterProviderRequireParameters', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getReasoningPrefs', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setReasoningPrefs', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getWebSearchDefaults', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setWebSearchDefaults', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getSamplingParamsDefaults', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setSamplingParamsDefaults', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getImageGenerationDefault', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setImageGenerationDefault', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getUserMessageRenderDefault', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setUserMessageRenderDefault', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getChatReasoningDisplayMode', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setChatReasoningDisplayMode', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.getChatDraft', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.setChatDraft', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.deleteChatDraft', renderer: true, worker: true, domain: 'settings' },
  { name: 'settings.deleteChatDraftsByPrefix', renderer: true, worker: true, domain: 'settings' },
] as const satisfies readonly DbMethodRegistryEntry[]

export type DbMethod = (typeof DB_METHODS)[number]['name']

const toMethodList = (flag: 'renderer' | 'worker'): DbMethod[] =>
  DB_METHODS.filter((entry) => entry[flag]).map((entry) => entry.name) as DbMethod[]

export const DB_RENDERER_METHODS = toMethodList('renderer')
export const DB_WORKER_METHODS = toMethodList('worker')

export const DB_RENDERER_METHOD_SET: ReadonlySet<DbMethod> = new Set(DB_RENDERER_METHODS)
export const DB_WORKER_METHOD_SET: ReadonlySet<DbMethod> = new Set(DB_WORKER_METHODS)

export type DbMethodCoverageDiff = Readonly<{
  missing: DbMethod[]
  extra: string[]
}>

const toSortedUnique = <T extends string>(items: Iterable<T>): T[] =>
  Array.from(new Set(items)).sort((a, b) => a.localeCompare(b))

export const diffDbMethodCoverage = (
  expectedMethods: Iterable<DbMethod>,
  actualMethods: Iterable<string>
): DbMethodCoverageDiff => {
  const expected = toSortedUnique(expectedMethods)
  const actual = toSortedUnique(actualMethods)
  const expectedSet = new Set<string>(expected)
  const actualSet = new Set<string>(actual)

  return {
    missing: expected.filter((method) => !actualSet.has(method)),
    extra: actual.filter((method) => !expectedSet.has(method)),
  }
}

export const assertDbMethodCoverage = (
  label: string,
  expectedMethods: Iterable<DbMethod>,
  actualMethods: Iterable<string>
) => {
  const diff = diffDbMethodCoverage(expectedMethods, actualMethods)
  if (diff.missing.length === 0 && diff.extra.length === 0) return

  const parts = [
    '[db-methods] ' + label + ' coverage mismatch',
    'missing(' + diff.missing.length + '): ' + (diff.missing.join(', ') || 'none'),
    'extra(' + diff.extra.length + '): ' + (diff.extra.join(', ') || 'none'),
  ]
  throw new Error(parts.join(' | '))
}
