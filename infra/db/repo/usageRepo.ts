import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  UsageLogPayload,
  ProjectUsageStats,
  ConvoUsageStats,
  ModelUsageStats,
  DateRangeStats,
  UsageAggregateParams,
  UsageAggregateResult,
  UsageAggregateRow,
  UsageDrillDownParams,
  UsageDrillDownResult,
  UsageAggregateFilters,
  UsageGroupByDimension
} from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

export class UsageRepo {
  private insertStmt: BetterSqlite3.Statement
  private getProjectStatsStmt: BetterSqlite3.Statement
  private getConvoStatsStmt: BetterSqlite3.Statement
  private getModelStatsStmt: BetterSqlite3.Statement
  private getDateRangeStatsStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO usage_log(
        id, project_id, convo_id, provider, model,
        tokens_input, tokens_output, tokens_cached, tokens_reasoning,
        cost, request_id, attempt, duration_ms, ttft_ms, timestamp, status, error_code, meta
      ) VALUES (
        @id, @projectId, @convoId, @provider, @model,
        @tokensInput, @tokensOutput, @tokensCached, @tokensReasoning,
        @cost, @requestId, @attempt, @durationMs, @ttftMs, @timestamp, @status, @errorCode, @meta
      )
    `)

    this.getProjectStatsStmt = this.db.prepare(`
      SELECT 
        SUM(tokens_input) as total_input,
        SUM(tokens_output) as total_output,
        SUM(tokens_cached) as total_cached,
        SUM(tokens_reasoning) as total_reasoning,
        SUM(cost) as total_cost,
        COUNT(*) as request_count,
        SUM(duration_ms) as total_duration
      FROM usage_log
      WHERE project_id = ? AND timestamp >= ?
    `)

    this.getConvoStatsStmt = this.db.prepare(`
      SELECT 
        SUM(tokens_input) as total_input,
        SUM(tokens_output) as total_output,
        SUM(tokens_cached) as total_cached,
        SUM(tokens_reasoning) as total_reasoning,
        SUM(cost) as total_cost,
        COUNT(*) as request_count,
        SUM(duration_ms) as total_duration
      FROM usage_log
      WHERE convo_id = ? AND timestamp >= ?
    `)

    this.getModelStatsStmt = this.db.prepare(`
      SELECT 
        SUM(tokens_input) as total_input,
        SUM(tokens_output) as total_output,
        SUM(tokens_cached) as total_cached,
        SUM(tokens_reasoning) as total_reasoning,
        SUM(cost) as total_cost,
        COUNT(*) as request_count,
        SUM(duration_ms) as total_duration
      FROM usage_log
      WHERE model = ? AND timestamp >= ?
    `)

    this.getDateRangeStatsStmt = this.db.prepare(`
      SELECT 
        SUM(tokens_input) as total_input,
        SUM(tokens_output) as total_output,
        SUM(tokens_cached) as total_cached,
        SUM(tokens_reasoning) as total_reasoning,
        SUM(cost) as total_cost,
        COUNT(*) as request_count,
        SUM(duration_ms) as total_duration
      FROM usage_log
      WHERE timestamp >= ? AND timestamp <= ?
    `)
  }

  /**
   * 记录单次 AI 对话使用量
   */
  logUsage(input: UsageLogPayload): void {
    console.log('📊 [UsageRepo] 开始插入使用记录:', {
      provider: input.provider,
      model: input.model,
      tokensInput: input.tokens_input,
      tokensOutput: input.tokens_output,
      convoId: input.convo_id
    })
    
    const params = {
      id: randomUUID(),
      projectId: input.project_id ?? null,
      convoId: input.convo_id ?? null,
      provider: input.provider,
      model: input.model,
      tokensInput: input.tokens_input,
      tokensOutput: input.tokens_output,
      tokensCached: input.tokens_cached ?? 0,
      tokensReasoning: input.tokens_reasoning ?? 0,
      cost: input.cost ?? 0.0,
      requestId: input.request_id ?? null,
      attempt: input.attempt ?? 1,
      durationMs: input.duration_ms,
      ttftMs: input.ttft_ms ?? null,
      timestamp: input.timestamp,
      status: input.status ?? 'success',
      errorCode: input.error_code ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null
    }
    
    console.log('📊 [UsageRepo] 准备执行 SQL 插入，参数:', params)
    
    try {
      this.insertStmt.run(params)
      console.log('✅ [UsageRepo] 使用记录插入成功')
    } catch (err) {
      console.error('❌ [UsageRepo] 使用记录插入失败:', err)
      throw err
    }
  }

  /**
   * 获取项目使用量统计
   * 
   * @param projectId - 项目 ID
   * @param days - 统计天数（默认 30 天）
   * @returns 项目维度统计结果
   */
  getProjectStats(projectId: string, days: number = 30): ProjectUsageStats {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    const totalRow = this.getProjectStatsStmt.get(projectId, since) as any
    
    return {
      total: {
        total_input: totalRow.total_input ?? 0,
        total_output: totalRow.total_output ?? 0,
        total_cached: totalRow.total_cached ?? 0,
        total_reasoning: totalRow.total_reasoning ?? 0,
        total_cost: totalRow.total_cost ?? 0.0,
        request_count: totalRow.request_count ?? 0,
        total_duration: totalRow.total_duration ?? 0
      }
    }
  }

  /**
   * 获取对话使用量统计
   * 
   * @param convoId - 对话 ID
   * @param days - 统计天数（默认 30 天）
   * @returns 对话维度统计结果
   */
  getConvoStats(convoId: string, days: number = 30): ConvoUsageStats {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    const totalRow = this.getConvoStatsStmt.get(convoId, since) as any
    
    return {
      total: {
        total_input: totalRow.total_input ?? 0,
        total_output: totalRow.total_output ?? 0,
        total_cached: totalRow.total_cached ?? 0,
        total_reasoning: totalRow.total_reasoning ?? 0,
        total_cost: totalRow.total_cost ?? 0.0,
        request_count: totalRow.request_count ?? 0,
        total_duration: totalRow.total_duration ?? 0
      }
    }
  }

  /**
   * 获取模型使用量统计
   * 
   * @param model - 模型名称
   * @param days - 统计天数（默认 30 天）
   * @returns 模型维度统计结果
   */
  getModelStats(model: string, days: number = 30): ModelUsageStats {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    const totalRow = this.getModelStatsStmt.get(model, since) as any
    
    return {
      total: {
        total_input: totalRow.total_input ?? 0,
        total_output: totalRow.total_output ?? 0,
        total_cached: totalRow.total_cached ?? 0,
        total_reasoning: totalRow.total_reasoning ?? 0,
        total_cost: totalRow.total_cost ?? 0.0,
        request_count: totalRow.request_count ?? 0,
        total_duration: totalRow.total_duration ?? 0
      }
    }
  }

  /**
   * 获取日期范围使用量统计
   * 
   * @param startTime - 开始时间戳
   * @param endTime - 结束时间戳
   * @returns 日期范围统计结果
   */
  getDateRangeStats(startTime: number, endTime: number): DateRangeStats {
    const totalRow = this.getDateRangeStatsStmt.get(startTime, endTime) as any
    
    return {
      total: {
        total_input: totalRow.total_input ?? 0,
        total_output: totalRow.total_output ?? 0,
        total_cached: totalRow.total_cached ?? 0,
        total_reasoning: totalRow.total_reasoning ?? 0,
        total_cost: totalRow.total_cost ?? 0.0,
        request_count: totalRow.request_count ?? 0,
        total_duration: totalRow.total_duration ?? 0
      }
    }
  }

  private buildFilterClause(filters?: UsageAggregateFilters) {
    const clauses: string[] = []
    const params: Record<string, any> = {}

    if (!filters) {
      return { clause: '', params }
    }

    if (filters.projectId !== undefined && filters.projectId !== null) {
      clauses.push('project_id IS @projectId')
      params.projectId = filters.projectId
    }
    if (filters.convoId !== undefined && filters.convoId !== null) {
      clauses.push('convo_id IS @convoId')
      params.convoId = filters.convoId
    }
    if (filters.provider) {
      clauses.push('provider = @provider')
      params.provider = filters.provider
    }
    if (filters.model) {
      clauses.push('model = @model')
      params.model = filters.model
    }
    if (filters.status) {
      clauses.push('status = @status')
      params.status = filters.status
    }
    if (filters.errorCode !== undefined) {
      clauses.push('error_code IS @errorCode')
      params.errorCode = filters.errorCode
    }
    if (typeof filters.startTime === 'number') {
      clauses.push('timestamp >= @startTime')
      params.startTime = filters.startTime
    }
    if (typeof filters.endTime === 'number') {
      clauses.push('timestamp <= @endTime')
      params.endTime = filters.endTime
    }

    const metaFilters = filters.meta ?? {}
    const allowedMeta: Array<keyof NonNullable<typeof filters.meta>> = [
      'feature',
      'entry',
      'experiment_id',
      'user_id'
    ]
    for (const key of allowedMeta) {
      if (metaFilters[key] !== undefined) {
        clauses.push(`json_extract(meta, '$.${key}') IS @meta_${key}`)
        params[`meta_${key}`] = metaFilters[key]
      }
    }

    if (clauses.length === 0) {
      return { clause: '', params }
    }
    return { clause: `WHERE ${clauses.join(' AND ')}`, params }
  }

  private computeDerived(row: any): UsageAggregateRow {
    const tokensInput = Number(row.tokens_input ?? 0)
    const tokensOutput = Number(row.tokens_output ?? 0)
    const tokensCached = Number(row.tokens_cached ?? 0)
    const tokensReasoning = Number(row.tokens_reasoning ?? 0)
    const tokensTotal = tokensInput + tokensOutput + tokensCached + tokensReasoning
    const effectiveTokens = Math.max(tokensInput + tokensOutput - tokensCached, 0)
    const cost = Number(row.cost ?? 0)
    const requestCount = Number(row.request_count ?? 0)
    const avgCostPerReq = requestCount > 0 ? cost / requestCount : 0
    const costPer1k = tokensTotal > 0 ? (cost / tokensTotal) * 1000 : 0
    const avgLatency = requestCount > 0 ? Number(row.total_duration ?? 0) / requestCount : 0
    const successCount = Number(row.success_count ?? 0)
    const errorCount = Number(row.error_count ?? 0)
    const canceledCount = Number(row.canceled_count ?? 0)
    // 计算成功率和错误率时排除 canceled（用户主动取消不算错误）
    const effectiveRequestCount = successCount + errorCount
    const successRate = effectiveRequestCount > 0 ? successCount / effectiveRequestCount : 0
    const errorRate = effectiveRequestCount > 0 ? errorCount / effectiveRequestCount : 0
    const canceledRate = requestCount > 0 ? canceledCount / requestCount : 0

    return {
      bucket_start: row.bucket_start ?? null,
      project_id: row.project_id ?? null,
      convo_id: row.convo_id ?? null,
      provider: row.provider ?? null,
      model: row.model ?? null,
      status: row.status ?? null,
      error_code: row.error_code ?? null,
      meta_feature: row.meta_feature ?? null,
      meta_entry: row.meta_entry ?? null,
      meta_experiment_id: row.meta_experiment_id ?? null,
      meta_user_id: row.meta_user_id ?? null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      tokens_cached: tokensCached,
      tokens_reasoning: tokensReasoning,
      tokens_total: tokensTotal,
      effective_tokens: effectiveTokens,
      cost,
      request_count: requestCount,
      avg_cost_per_req: avgCostPerReq,
      cost_per_1k_tokens: costPer1k,
      avg_latency: avgLatency,
      p50_latency: row.p50_latency ?? null,
      p90_latency: row.p90_latency ?? null,
      success_rate: successRate,
      error_rate: errorRate,
      canceled_count: canceledCount,
      canceled_rate: canceledRate
    }
  }

  private groupByToColumns(groupBy?: UsageGroupByDimension[]): { selects: string[]; groups: string[] } {
    const selects: string[] = []
    const groups: string[] = []
    if (!groupBy) return { selects, groups }

    for (const dim of groupBy) {
      switch (dim) {
        case 'project_id':
          selects.push('project_id')
          groups.push('project_id')
          break
        case 'convo_id':
          selects.push('convo_id')
          groups.push('convo_id')
          break
        case 'provider':
          selects.push('provider')
          groups.push('provider')
          break
        case 'model':
          selects.push('model')
          groups.push('model')
          break
        case 'status':
          selects.push('status')
          groups.push('status')
          break
        case 'error_code':
          selects.push('error_code')
          groups.push('error_code')
          break
        case 'meta.feature':
          selects.push("json_extract(meta, '$.feature') AS meta_feature")
          groups.push("json_extract(meta, '$.feature')")
          break
        case 'meta.entry':
          selects.push("json_extract(meta, '$.entry') AS meta_entry")
          groups.push("json_extract(meta, '$.entry')")
          break
        case 'meta.experiment_id':
          selects.push("json_extract(meta, '$.experiment_id') AS meta_experiment_id")
          groups.push("json_extract(meta, '$.experiment_id')")
          break
        case 'meta.user_id':
          selects.push("json_extract(meta, '$.user_id') AS meta_user_id")
          groups.push("json_extract(meta, '$.user_id')")
          break
        default:
          break
      }
    }

    return { selects, groups }
  }

  aggregateUsage(params: UsageAggregateParams): UsageAggregateResult {
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 100
    const offset = params.offset && params.offset > 0 ? params.offset : 0
    const timezoneOffset = (params.timezoneOffsetMinutes ?? 0) * 60 * 1000
    const bucketMs = params.bucket === 'hour' ? 60 * 60 * 1000 : params.bucket === 'week' ? 7 * 24 * 60 * 60 * 1000 : params.bucket === 'day' ? 24 * 60 * 60 * 1000 : null

    const { clause, params: filterParams } = this.buildFilterClause(params.filters)
    const { selects, groups } = this.groupByToColumns(params.groupBy)

    const bucketSelect = bucketMs
      ? `CAST(((timestamp + @tzOffset) / ${bucketMs}) AS INTEGER) * ${bucketMs} - @tzOffset AS bucket_start`
      : null
    const groupClauses = [...groups]
    if (bucketSelect) {
      groupClauses.push('bucket_start')
    }

    const orderDirection = params.order === 'asc' ? 'ASC' : 'DESC'
    const baseSelects = [
      ...(bucketSelect ? [bucketSelect] : []),
      ...selects,
      'SUM(tokens_input) AS tokens_input',
      'SUM(tokens_output) AS tokens_output',
      'SUM(tokens_cached) AS tokens_cached',
      'SUM(tokens_reasoning) AS tokens_reasoning',
      'SUM(cost) AS cost',
      'COUNT(*) AS request_count',
      'SUM(duration_ms) AS total_duration',
      'SUM(CASE WHEN status = \'success\' THEN 1 ELSE 0 END) AS success_count',
      'SUM(CASE WHEN status = \'error\' THEN 1 ELSE 0 END) AS error_count',
      'SUM(CASE WHEN status = \'canceled\' THEN 1 ELSE 0 END) AS canceled_count',
      'GROUP_CONCAT(duration_ms, \',\') AS durations'
    ]

    const groupBySql = groupClauses.length > 0 ? `GROUP BY ${groupClauses.join(', ')}` : ''
    const orderField = bucketSelect
      ? 'bucket_start'
      : groupClauses.length > 0
      ? groupClauses[0]
      : 'request_count'

    const sql = `
      SELECT ${baseSelects.join(', ')}
      FROM usage_log
      ${clause}
      ${groupBySql}
      ORDER BY ${orderField} ${orderDirection}
      LIMIT ${limit} OFFSET ${offset}
    `
    
    const rows = this.db.prepare(sql).all({ ...filterParams, tzOffset: timezoneOffset }) as any[]

    const resultRows: UsageAggregateRow[] = rows.map((row) => {
      const durationsStr = row.durations as string | null
      let p50: number | null = null
      let p90: number | null = null
      if (durationsStr) {
        const durations = durationsStr
          .split(',')
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b)
        if (durations.length > 0) {
          const MAX_DURATIONS = 5000
          const sample = durations.length > MAX_DURATIONS ? durations.slice(0, MAX_DURATIONS) : durations
          const getPercentile = (p: number) => {
            const idx = Math.min(sample.length - 1, Math.max(0, Math.floor((sample.length - 1) * p)))
            return sample[idx]
          }
          p50 = getPercentile(0.5)
          p90 = getPercentile(0.9)
        }
      }
      row.p50_latency = p50
      row.p90_latency = p90
      return this.computeDerived(row)
    })

    return {
      data: resultRows,
      pagination: { limit, offset }
    }
  }

  drillDown(params: UsageDrillDownParams): UsageDrillDownResult {
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 50
    const sort = params.sort ?? 'timestamp'
    const order = params.order === 'asc' ? 'ASC' : 'DESC'
    const { clause, params: filterParams } = this.buildFilterClause(params.filters)

    const cursorClause = params.cursor
      ? order === 'DESC'
        ? `AND (${sort} < @cursorSort OR (${sort} = @cursorSort AND id < @cursorId))`
        : `AND (${sort} > @cursorSort OR (${sort} = @cursorSort AND id > @cursorId))`
      : ''

    const whereClause = clause ? `${clause} ${cursorClause}` : `WHERE 1=1 ${cursorClause}`

    const sql = `
      SELECT id, project_id, convo_id, provider, model, tokens_input, tokens_output, tokens_cached, tokens_reasoning, cost,
        request_id, attempt, duration_ms, ttft_ms, timestamp, status, error_code, meta
      FROM usage_log
      ${whereClause}
      ORDER BY ${sort} ${order}, id ${order}
      LIMIT ${limit + 1}
    `

    const rows = this.db.prepare(sql).all({
      ...filterParams,
      cursorSort: params.cursor ? params.cursor.value : undefined,
      cursorId: params.cursor ? params.cursor.id : undefined
    }) as any[]

    const sliced = rows.slice(0, limit)
    const next = rows.length > limit ? rows[rows.length - 1] : null

    const mapped = sliced.map((row) => ({
      id: row.id,
      project_id: row.project_id ?? null,
      convo_id: row.convo_id ?? null,
      provider: row.provider,
      model: row.model,
      tokens_input: row.tokens_input ?? 0,
      tokens_output: row.tokens_output ?? 0,
      tokens_cached: row.tokens_cached ?? 0,
      tokens_reasoning: row.tokens_reasoning ?? 0,
      cost: row.cost ?? 0,
      request_id: row.request_id ?? null,
      attempt: row.attempt ?? null,
      duration_ms: row.duration_ms ?? 0,
      ttft_ms: row.ttft_ms ?? null,
      timestamp: row.timestamp,
      status: row.status,
      error_code: row.error_code ?? null,
      meta: row.meta ? JSON.parse(row.meta) : null
    }))

    return {
      data: mapped,
      nextCursor: next
        ? {
            value: next[sort],
            id: next.id
          }
        : undefined,
      pagination: { limit }
    }
  }

  /**
   * 获取推理 Token 使用趋势（按时间分桶）
   * 
   * @param params - 筛选条件（时间范围、provider、model等）
   * @param bucket - 时间分桶粒度 ('hour' | 'day' | 'week')
   * @returns 每个时间桶内的推理 Token 统计
   */
  getReasoningTrend(params: UsageAggregateParams): UsageAggregateResult {
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 100
    const offset = params.offset && params.offset > 0 ? params.offset : 0
    const timezoneOffset = (params.timezoneOffsetMinutes ?? 0) * 60 * 1000
    const bucketMs = params.bucket === 'hour' ? 60 * 60 * 1000 : params.bucket === 'week' ? 7 * 24 * 60 * 60 * 1000 : params.bucket === 'day' ? 24 * 60 * 60 * 1000 : null

    const { clause, params: filterParams } = this.buildFilterClause(params.filters)
    const { selects, groups } = this.groupByToColumns(params.groupBy)

    const bucketSelect = bucketMs
      ? `CAST(((timestamp + @tzOffset) / ${bucketMs}) AS INTEGER) * ${bucketMs} - @tzOffset AS bucket_start`
      : null
    const groupClauses = [...groups]
    if (bucketSelect) {
      groupClauses.push('bucket_start')
    }

    const orderDirection = params.order === 'asc' ? 'ASC' : 'DESC'
    const baseSelects = [
      ...(bucketSelect ? [bucketSelect] : []),
      ...selects,
      'SUM(tokens_reasoning) AS tokens_reasoning',
      'SUM(tokens_input + tokens_output + tokens_cached + tokens_reasoning) AS tokens_total',
      'COUNT(*) AS request_count',
      'SUM(CASE WHEN tokens_reasoning > 0 THEN 1 ELSE 0 END) AS reasoning_request_count',
      'SUM(cost) AS cost'
    ]

    const groupBySql = groupClauses.length > 0 ? `GROUP BY ${groupClauses.join(', ')}` : ''
    const orderField = bucketSelect ? 'bucket_start' : groupClauses.length > 0 ? groupClauses[0] : 'request_count'

    const sql = `
      SELECT ${baseSelects.join(', ')}
      FROM usage_log
      ${clause}
      ${groupBySql}
      ORDER BY ${orderField} ${orderDirection}
      LIMIT ${limit} OFFSET ${offset}
    `

    const rows = this.db.prepare(sql).all({ ...filterParams, tzOffset: timezoneOffset }) as any[]

    const resultRows = rows.map((row) => {
      const tokensReasoning = Number(row.tokens_reasoning ?? 0)
      const tokensTotal = Number(row.tokens_total ?? 0)
      const requestCount = Number(row.request_count ?? 0)
      const reasoningRequestCount = Number(row.reasoning_request_count ?? 0)
      const cost = Number(row.cost ?? 0)
      
      const reasoningRatio = tokensTotal > 0 ? tokensReasoning / tokensTotal : 0
      const reasoningUsageRate = requestCount > 0 ? reasoningRequestCount / requestCount : 0

      return {
        bucket_start: row.bucket_start ?? null,
        provider: row.provider ?? null,
        model: row.model ?? null,
        tokens_reasoning: tokensReasoning,
        tokens_total: tokensTotal,
        request_count: requestCount,
        reasoning_request_count: reasoningRequestCount,
        reasoning_ratio: reasoningRatio,
        reasoning_usage_rate: reasoningUsageRate,
        cost,
        // 保留其他可能的 groupBy 字段
        project_id: row.project_id ?? null,
        convo_id: row.convo_id ?? null,
        status: row.status ?? null,
        error_code: row.error_code ?? null,
        meta_feature: row.meta_feature ?? null,
        meta_entry: row.meta_entry ?? null,
        meta_experiment_id: row.meta_experiment_id ?? null,
        meta_user_id: row.meta_user_id ?? null,
        // 填充其他必需字段以符合 UsageAggregateRow 类型
        tokens_input: 0,
        tokens_output: 0,
        tokens_cached: 0,
        effective_tokens: 0,
        avg_cost_per_req: 0,
        cost_per_1k_tokens: 0,
        avg_latency: 0,
        p50_latency: null,
        p90_latency: null,
        success_rate: 0,
        error_rate: 0,
        canceled_count: 0,
        canceled_rate: 0
      }
    })

    return {
      data: resultRows as any[],
      pagination: { limit, offset }
    }
  }

  /**
   * 获取模型推理 Token 对比数据
   * 
   * @param params - 筛选条件（时间范围、provider等）
   * @returns 各模型的推理 Token 占比和使用率
   */
  getReasoningModelComparison(params: Omit<UsageAggregateParams, 'groupBy'>): UsageAggregateResult {
    const paramsWithGroupBy: UsageAggregateParams = {
      ...params,
      groupBy: ['provider', 'model']
    }
    
    const limit = paramsWithGroupBy.limit && paramsWithGroupBy.limit > 0 ? Math.min(paramsWithGroupBy.limit, 200) : 50
    const offset = paramsWithGroupBy.offset && paramsWithGroupBy.offset > 0 ? paramsWithGroupBy.offset : 0
    const { clause, params: filterParams } = this.buildFilterClause(paramsWithGroupBy.filters)

    const sql = `
      SELECT 
        provider,
        model,
        SUM(tokens_reasoning) AS tokens_reasoning,
        SUM(tokens_input + tokens_output + tokens_cached + tokens_reasoning) AS tokens_total,
        COUNT(*) AS request_count,
        SUM(CASE WHEN tokens_reasoning > 0 THEN 1 ELSE 0 END) AS reasoning_request_count,
        SUM(cost) AS cost,
        AVG(duration_ms) AS avg_latency
      FROM usage_log
      ${clause}
      GROUP BY provider, model
      ORDER BY tokens_reasoning DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const rows = this.db.prepare(sql).all(filterParams) as any[]

    const resultRows = rows.map((row) => {
      const tokensReasoning = Number(row.tokens_reasoning ?? 0)
      const tokensTotal = Number(row.tokens_total ?? 0)
      const requestCount = Number(row.request_count ?? 0)
      const reasoningRequestCount = Number(row.reasoning_request_count ?? 0)
      const cost = Number(row.cost ?? 0)
      const avgLatency = Number(row.avg_latency ?? 0)

      const reasoningRatio = tokensTotal > 0 ? tokensReasoning / tokensTotal : 0
      const reasoningUsageRate = requestCount > 0 ? reasoningRequestCount / requestCount : 0
      const costPer1kReasoning = tokensReasoning > 0 ? (cost / tokensReasoning) * 1000 : 0

      return {
        provider: row.provider ?? null,
        model: row.model ?? null,
        tokens_reasoning: tokensReasoning,
        tokens_total: tokensTotal,
        request_count: requestCount,
        reasoning_request_count: reasoningRequestCount,
        reasoning_ratio: reasoningRatio,
        reasoning_usage_rate: reasoningUsageRate,
        cost,
        cost_per_1k_reasoning: costPer1kReasoning,
        avg_latency: avgLatency,
        // 填充其他必需字段
        bucket_start: null,
        project_id: null,
        convo_id: null,
        status: null,
        error_code: null,
        meta_feature: null,
        meta_entry: null,
        meta_experiment_id: null,
        meta_user_id: null,
        tokens_input: 0,
        tokens_output: 0,
        tokens_cached: 0,
        effective_tokens: 0,
        avg_cost_per_req: 0,
        cost_per_1k_tokens: 0,
        p50_latency: null,
        p90_latency: null,
        success_rate: 0,
        error_rate: 0,
        canceled_count: 0,
        canceled_rate: 0
      }
    })

    return {
      data: resultRows as any[],
      pagination: { limit, offset }
    }
  }
}
