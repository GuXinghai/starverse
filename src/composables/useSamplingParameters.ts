/**
 * useSamplingParameters - 严格隔离型采样参数控制器
 * 
 * 核心特性：
 * - 双模式隔离：SLIDER 与 INPUT 模式数据完全独立，互不干扰
 * - 空值阻断：INPUT 模式下空值视为非法，必须阻断提交
 * - 无回退机制：INPUT 模式永不使用 SLIDER 的值作为替补
 * - 严格校验：提供校验接口，阻止无效数据提交
 * 
 * 职责：
 * - 双模式参数管理（SLIDER/INPUT）
 * - 独立数据维护（sliderValue/manualValue）
 * - 参数验证和错误检测
 * - 模式切换与状态保护
 * - API 请求参数构建
 */

import { computed, type ComputedRef } from 'vue'
import type { SamplingParameterSettings, ParameterControlMode } from '../types/chat'
import { DEFAULT_SAMPLING_PARAMETERS } from '../types/chat'
import { PROVIDERS } from '../constants/providers'

/**
 * 滑块类型参数键
 */
export type SamplingSliderKey =
  | 'temperature'
  | 'top_p'
  | 'frequency_penalty'
  | 'presence_penalty'
  | 'repetition_penalty'
  | 'min_p'
  | 'top_a'

/**
 * 整数类型参数键
 */
export type SamplingIntegerKey = 'top_k' | 'max_tokens' | 'seed'

/**
 * 所有采样参数键
 */
export type SamplingParameterKey = SamplingSliderKey | SamplingIntegerKey

/**
 * 滑块控件配置
 */
export interface SamplingSliderControl {
  key: SamplingSliderKey
  label: string
  min: number
  max: number
  step: number
  description: string
  defaultValue: number // 官方默认值
}

/**
 * 整数控件配置
 */
export interface SamplingIntegerControl {
  key: SamplingIntegerKey
  label: string
  min: number
  placeholder: string
  description: string
  defaultValue: number | null // 官方默认值
}

/**
 * 滑块控件列表
 * 注意：所有滑块的 min=0, max=1, step=0.01，采用归一化输入
 * 实际值通过 LLMParamMapper 进行非线性映射
 */
export const SAMPLING_SLIDER_CONTROLS: ReadonlyArray<SamplingSliderControl> = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 1, step: 0.01, description: '控制创意程度，越低越保守', defaultValue: 1 },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.01, description: '限制概率累积阈值，配合 temperature 使用', defaultValue: 1 },
  { key: 'frequency_penalty', label: 'Frequency Penalty', min: 0, max: 1, step: 0.01, description: '惩罚已出现的 token，减少重复', defaultValue: 0 },
  { key: 'presence_penalty', label: 'Presence Penalty', min: 0, max: 1, step: 0.01, description: '鼓励引入新话题', defaultValue: 0 },
  { key: 'repetition_penalty', label: 'Repetition Penalty', min: 0, max: 1, step: 0.01, description: '降低重复输出的概率', defaultValue: 1 },
  { key: 'min_p', label: 'Min P', min: 0, max: 1, step: 0.01, description: '过滤掉低于阈值的 token，相对 top_p 更动态', defaultValue: 0 },
  { key: 'top_a', label: 'Top A', min: 0, max: 1, step: 0.01, description: '基于自适应阈值过滤 token', defaultValue: 0 }
]

/**
 * 整数控件列表
 */
export const SAMPLING_INTEGER_CONTROLS: ReadonlyArray<SamplingIntegerControl> = [
  { key: 'top_k', label: 'Top K', min: 0, placeholder: '0 表示关闭', description: '限制候选集合大小，0 为不限', defaultValue: 0 },
  { key: 'max_tokens', label: 'Max Tokens', min: 1, placeholder: '留空使用模型默认', description: '回复的最大 token 数', defaultValue: null },
  { key: 'seed', label: 'Seed', min: Number.MIN_SAFE_INTEGER, placeholder: '留空为随机', description: '固定采样种子以复现输出', defaultValue: null }
]

/**
 * 参数校验错误
 */
export interface ParameterValidationError {
  key: SamplingParameterKey
  message: string
  control: SamplingSliderControl | SamplingIntegerControl
}

/**
 * Composable 选项
 */
export interface SamplingParametersOptions {
  /** 当前对话的采样参数（响应式） */
  samplingParameters: ComputedRef<SamplingParameterSettings | undefined>
  /** 组件是否激活 */
  isActive: ComputedRef<boolean>
  /** 当前提供商 */
  activeProvider: ComputedRef<string>
  /** 更新回调 */
  onUpdateParameters: (updates: Partial<SamplingParameterSettings>) => void
}

// ========== 非线性参数映射算法 ==========

/**
 * 参数映射器：将线性的 UI 滑块值 (0.0~1.0) 映射为符合工程习惯的非线性参数值
 * 
 * 设计理念：
 * 1. 低值敏感型 (min_p, top_a): 使用幂函数扩展，在低值区间提供极高精度
 * 2. 高值敏感型 (top_p): 使用反向幂函数，在高值区间提供极高精度
 * 3. 中值锚定型 (temperature, repetition_penalty): 使用 S 型曲线，在默认值 1.0 附近提供极高精度
 * 4. 零值锚定型 (frequency_penalty, presence_penalty): 使用原点平滑，在 0 附近提供极高精度
 */
class LLMParamMapper {
  /**
   * 将线性滑块值映射为实际参数值
   * 
   * @param paramName - 参数名称
   * @param sliderValue - 滑块值 (0.0 ~ 1.0)
   * @returns 实际参数值
   */
  static mapSliderToValue(paramName: SamplingSliderKey, sliderValue: number): number {
    // 钳制输入在 0~1 之间
    const x = Math.max(0.0, Math.min(1.0, sliderValue))
    
    // --- 第一类: 低值敏感型 (Low-Value Sensitive) ---
    // 适用: min_p, top_a
    // 特点: 0~0.2 之间需要"显微镜"级精度，高值区几乎不可用
    // 算法: y = max * x^k (k=3.0)
    // 效果: 滑块 50% 时实际值仅为 0.125
    if (paramName === 'min_p' || paramName === 'top_a') {
      const k = 3.0
      const maxVal = 1.0
      return maxVal * Math.pow(x, k)
    }
    
    // --- 第二类: 高值敏感型 (High-Value Sensitive) ---
    // 适用: top_p
    // 特点: 0.9~1.0 之间差别巨大，低值区快速掠过
    // 算法: y = 1 - (1-x)^k (k=3.0)
    // 效果: 滑块 50% 时已达到 0.875，90% 时达到 0.999
    if (paramName === 'top_p') {
      const k = 3.0
      const maxVal = 1.0
      return maxVal * (1.0 - Math.pow(1.0 - x, k))
    }
    
    // --- 第三类: 中值锚定型 (Midpoint Anchors) ---
    // 适用: temperature, repetition_penalty
    // 特点: 默认值 1.0，用户常在 0.8~1.2 之间微调
    // 算法: y = m ± dist * |x_norm|^k (k=2.5)
    // 效果: 在 1.0 附近极其平滑，向两端加速
    if (paramName === 'temperature' || paramName === 'repetition_penalty') {
      const m = 1.0 // 中值
      const maxDist = 1.0 // 距离边界的最大距离
      const k = 2.5
      
      // 将 x(0~1) 映射到 (-1~1)
      const xNorm = (x - 0.5) * 2.0
      
      if (xNorm >= 0) {
        return m + maxDist * Math.pow(xNorm, k)
      } else {
        return m - maxDist * Math.pow(Math.abs(xNorm), k)
      }
    }
    
    // --- 第四类: 零值锚定型 (Origin Smoothing) ---
    // 适用: frequency_penalty, presence_penalty
    // 特点: 默认值 0.0，大部分情况为 0，偶尔微调到 ±0.1
    // 算法: y = 0 ± dist * |x_norm|^k (k=2.0)
    // 效果: 在 0 附近极慢，快速拉升至边界 ±2.0
    if (paramName === 'frequency_penalty' || paramName === 'presence_penalty') {
      const m = 0.0
      const maxDist = 2.0
      const k = 2.0
      
      // 将 x(0~1) 映射到 (-1~1)
      const xNorm = (x - 0.5) * 2.0
      
      if (xNorm >= 0) {
        return m + maxDist * Math.pow(xNorm, k)
      } else {
        return m - maxDist * Math.pow(Math.abs(xNorm), k)
      }
    }
    
    // 默认: 线性映射 (不应该到达这里)
    return x
  }
  
  /**
   * 将实际参数值反向映射为滑块值 (用于初始化滑块位置)
   * 
   * @param paramName - 参数名称
   * @param actualValue - 实际参数值
   * @returns 滑块值 (0.0 ~ 1.0)
   */
  static mapValueToSlider(paramName: SamplingSliderKey, actualValue: number): number {
    // --- 低值敏感型: 反向计算 x = (y/max)^(1/k) ---
    if (paramName === 'min_p' || paramName === 'top_a') {
      const k = 3.0
      const maxVal = 1.0
      const y = Math.max(0, Math.min(maxVal, actualValue))
      return Math.pow(y / maxVal, 1 / k)
    }
    
    // --- 高值敏感型: 反向计算 x = 1 - (1-y)^(1/k) ---
    if (paramName === 'top_p') {
      const k = 3.0
      const maxVal = 1.0
      const y = Math.max(0, Math.min(maxVal, actualValue))
      return 1.0 - Math.pow(1.0 - y / maxVal, 1 / k)
    }
    
    // --- 中值锚定型: 反向计算 ---
    if (paramName === 'temperature' || paramName === 'repetition_penalty') {
      const m = 1.0
      const maxDist = 1.0
      const k = 2.5
      const y = Math.max(0, Math.min(2.0, actualValue))
      
      if (y >= m) {
        const xNorm = Math.pow((y - m) / maxDist, 1 / k)
        return (xNorm / 2.0) + 0.5
      } else {
        const xNorm = -Math.pow((m - y) / maxDist, 1 / k)
        return (xNorm / 2.0) + 0.5
      }
    }
    
    // --- 零值锚定型: 反向计算 ---
    if (paramName === 'frequency_penalty' || paramName === 'presence_penalty') {
      const m = 0.0
      const maxDist = 2.0
      const k = 2.0
      const y = Math.max(-2.0, Math.min(2.0, actualValue))
      
      if (y >= m) {
        const xNorm = Math.pow((y - m) / maxDist, 1 / k)
        return (xNorm / 2.0) + 0.5
      } else {
        const xNorm = -Math.pow((m - y) / maxDist, 1 / k)
        return (xNorm / 2.0) + 0.5
      }
    }
    
    // 默认: 线性映射
    return actualValue
  }
}

/**
 * 严格隔离型采样参数配置 Composable
 */
export function useSamplingParameters(options: SamplingParametersOptions) {
  const {
    samplingParameters: currentSamplingParameters,
    isActive,
    activeProvider,
    onUpdateParameters
  } = options

  // ========== 计算属性 ==========

  /**
   * 当前采样参数（带默认值）
   */
  const samplingParameters = computed<SamplingParameterSettings>(() => {
    const base = { ...DEFAULT_SAMPLING_PARAMETERS }
    const overrides = currentSamplingParameters.value
    if (overrides && typeof overrides === 'object') {
      return { ...base, ...overrides }
    }
    return base
  })

  /**
   * 采样参数是否启用
   */
  const isSamplingEnabled = computed(() => samplingParameters.value.enabled)

  /**
   * 采样控制是否可用（仅 OpenRouter 支持）
   */
  const isSamplingControlAvailable = computed(() => {
    // 🔧 修复：不区分大小写的 Provider 比较
    const providerLower = (activeProvider.value || '').toLowerCase()
    const isOpenRouter = providerLower === PROVIDERS.OPENROUTER
    
    const result = {
      isActive: isActive.value,
      activeProvider: activeProvider.value,
      providerLower: providerLower,
      check: isOpenRouter,
      available: false
    }
    
    if (!isActive.value) {
      console.log('[useSamplingParameters] isSamplingControlAvailable = false (不活跃)', result)
      return false
    }
    
    result.available = isOpenRouter
    console.log('[useSamplingParameters] isSamplingControlAvailable 计算:', result)
    return result.available
  })

  /**
   * 采样按钮 Tooltip
   */
  const samplingButtonTitle = computed(() => {
    if (!isSamplingControlAvailable.value) {
      return '仅在 OpenRouter 模式下支持参数调节'
    }
    return isSamplingEnabled.value ? '点击关闭自定义参数' : '点击启用自定义参数'
  })

  // ========== 核心方法：模式与值管理 ==========

  /**
   * 获取参数的当前模式
   */
  function getParameterMode(key: SamplingParameterKey): ParameterControlMode {
    const modeKey = `${key}_mode` as keyof SamplingParameterSettings
    const mode = samplingParameters.value[modeKey]
    return (mode as ParameterControlMode) || 'SLIDER'
  }

  /**
   * 获取参数的手动输入值
   */
  function getManualValue(key: SamplingParameterKey): number | null {
    const manualKey = `${key}_manualValue` as keyof SamplingParameterSettings
    const value = samplingParameters.value[manualKey]
    return typeof value === 'number' ? value : null
  }

  /**
   * 切换参数模式
   */
  function toggleParameterMode(key: SamplingParameterKey) {
    const currentMode = getParameterMode(key)
    const newMode: ParameterControlMode = currentMode === 'SLIDER' ? 'INPUT' : 'SLIDER'
    const modeKey = `${key}_mode` as keyof SamplingParameterSettings
    
    onUpdateParameters({ [modeKey]: newMode } as Partial<SamplingParameterSettings>)
  }

  /**
   * 获取滑块的归一化值 (用于初始化滑块位置)
   */
  function getSliderValue(key: SamplingSliderKey): number {
    const actualValue = samplingParameters.value[key]
    if (typeof actualValue !== 'number') {
      const defaultValue = DEFAULT_SAMPLING_PARAMETERS[key]
      if (typeof defaultValue === 'number') {
        return LLMParamMapper.mapValueToSlider(key, defaultValue)
      }
      return 0.5
    }
    return LLMParamMapper.mapValueToSlider(key, actualValue)
  }

  /**
   * 处理滑块输入 (SLIDER 模式专用)
   * 
   * 防御性设计：
   * - 只更新参数的实际值（如 temperature）
   * - 不触碰 _mode 和 _manualValue 字段
   * - 避免状态污染
   */
  function handleSamplingSliderInput(key: SamplingSliderKey, event: Event) {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    
    const sliderValue = Number(target.value)
    if (Number.isNaN(sliderValue)) return
    
    // 使用非线性映射将滑块值转换为实际参数值
    const actualValue = LLMParamMapper.mapSliderToValue(key, sliderValue)
    
    // 只更新实际参数值，不触碰模式和手动值字段
    onUpdateParameters({ [key]: actualValue } as Partial<SamplingParameterSettings>)
  }

  /**
   * 处理手动输入 (INPUT 模式专用)
   */
  function handleManualInput(key: SamplingParameterKey, event: Event) {
    const target = event.target as HTMLInputElement | null
    if (!target) return
    
    const raw = target.value.trim()
    const manualKey = `${key}_manualValue` as keyof SamplingParameterSettings
    
    // 处理空值
    if (!raw) {
      onUpdateParameters({ [manualKey]: null } as Partial<SamplingParameterSettings>)
      return
    }

    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return

    // 保存输入值
    onUpdateParameters({ [manualKey]: parsed } as Partial<SamplingParameterSettings>)
  }

  /**
   * 填入默认值 (INPUT 模式辅助功能)
   */
  function fillDefaultValue(key: SamplingParameterKey) {
    const control = [...SAMPLING_SLIDER_CONTROLS, ...SAMPLING_INTEGER_CONTROLS].find(c => c.key === key)
    if (!control) return
    
    const manualKey = `${key}_manualValue` as keyof SamplingParameterSettings
    onUpdateParameters({ [manualKey]: control.defaultValue } as Partial<SamplingParameterSettings>)
  }

  /**
   * 格式化显示值（SLIDER 模式显示实际映射后的值）
   */
  function formatSamplingValue(key: SamplingParameterKey): string {
    const mode = getParameterMode(key)
    
    if (mode === 'INPUT') {
      const manualValue = getManualValue(key)
      if (manualValue === null) {
        return '' // INPUT 模式下空值显示为空
      }
      return String(manualValue)
    }
    
    // SLIDER 模式：显示实际映射后的值
    const value = samplingParameters.value[key]
    if (value === null || value === undefined) {
      return '默认'
    }
    
    if (typeof value === 'number') {
      if (key === 'top_k' || key === 'max_tokens' || key === 'seed') {
        return String(value)
      }
      return value.toFixed(2)
    }
    
    return String(value)
  }

  // ========== 校验机制 ==========

  /**
   * 校验单个参数
   */
  function validateParameter(key: SamplingParameterKey): ParameterValidationError | null {
    const mode = getParameterMode(key)
    
    // SLIDER 模式永远有效
    if (mode === 'SLIDER') {
      return null
    }
    
    // INPUT 模式：严格检查
    const manualValue = getManualValue(key)
    const control = [...SAMPLING_SLIDER_CONTROLS, ...SAMPLING_INTEGER_CONTROLS].find(c => c.key === key)
    if (!control) return null
    
    // 检查空值
    if (manualValue === null) {
      return {
        key,
        message: 'Value required',
        control
      }
    }
    
    // 检查范围（滑块型参数）
    const sliderControl = SAMPLING_SLIDER_CONTROLS.find(c => c.key === key)
    if (sliderControl) {
      // 根据参数类型检查范围
      const ranges: Record<string, [number, number]> = {
        'min_p': [0, 1],
        'top_a': [0, 1],
        'top_p': [0, 1],
        'temperature': [0, 2],
        'repetition_penalty': [0, 2],
        'frequency_penalty': [-2, 2],
        'presence_penalty': [-2, 2]
      }
      
      const range = ranges[key as string]
      if (range && (manualValue < range[0] || manualValue > range[1])) {
        return {
          key,
          message: `Value must be between ${range[0]} and ${range[1]}`,
          control
        }
      }
    }
    
    // 检查整数参数
    const intControl = SAMPLING_INTEGER_CONTROLS.find(c => c.key === key)
    if (intControl) {
      if (key === 'top_k' && manualValue < 0) {
        return { key, message: 'Value must be >= 0', control }
      }
      if (key === 'max_tokens' && manualValue < 1) {
        return { key, message: 'Value must be >= 1', control }
      }
    }
    
    return null
  }

  /**
   * 检查参数是否有错误（用于 UI 显示）
   * 优化版本：在 SLIDER 模式下直接返回 false，避免不必要的计算
   */
  function hasParameterError(key: SamplingParameterKey): boolean {
    const mode = getParameterMode(key)
    
    // SLIDER 模式永远没有错误
    if (mode === 'SLIDER') {
      return false
    }
    
    // INPUT 模式：检查是否有错误
    return validateParameter(key) !== null
  }

  /**
   * 校验所有参数
   * @returns 错误列表，空数组表示全部通过
   */
  function validateAllParameters(): ParameterValidationError[] {
    const errors: ParameterValidationError[] = []
    
    const allKeys: SamplingParameterKey[] = [
      ...SAMPLING_SLIDER_CONTROLS.map(c => c.key),
      ...SAMPLING_INTEGER_CONTROLS.map(c => c.key)
    ]
    
    for (const key of allKeys) {
      const error = validateParameter(key)
      if (error) {
        errors.push(error)
      }
    }
    
    return errors
  }

  // ========== 操作方法 ==========

  /**
   * 切换采样参数开关
   */
  function toggleSamplingParametersEnabled() {
    const nextState = !isSamplingEnabled.value
    onUpdateParameters({ enabled: nextState })
  }

  /**
   * 重置采样参数（仅重置 SLIDER 模式的参数，保护 INPUT 模式）
   */
  function resetSamplingParameters() {
    const updates: Partial<SamplingParameterSettings> = {
      enabled: samplingParameters.value.enabled // 保持开关状态
    }
    
    // 仅重置处于 SLIDER 模式的参数
    const allKeys: SamplingParameterKey[] = [
      ...SAMPLING_SLIDER_CONTROLS.map(c => c.key),
      ...SAMPLING_INTEGER_CONTROLS.map(c => c.key)
    ]
    
    for (const key of allKeys) {
      const mode = getParameterMode(key)
      if (mode === 'SLIDER') {
        // 重置为默认值
        const defaultValue = DEFAULT_SAMPLING_PARAMETERS[key as keyof SamplingParameterSettings]
        updates[key as keyof SamplingParameterSettings] = defaultValue as any
      }
      // INPUT 模式的参数完全跳过，不做任何修改
    }
    
    onUpdateParameters(updates)
  }

  /**
   * 构建 API 请求的采样参数覆盖
   */
  function buildSamplingParameterOverrides(): Record<string, number> | null {
    if (!isSamplingControlAvailable.value || !isSamplingEnabled.value) {
      return null
    }

    const overrides: Record<string, number> = {}
    const allKeys: SamplingParameterKey[] = [
      ...SAMPLING_SLIDER_CONTROLS.map(c => c.key),
      ...SAMPLING_INTEGER_CONTROLS.map(c => c.key)
    ]

    for (const key of allKeys) {
      const mode = getParameterMode(key)
      let finalValue: number | null = null

      if (mode === 'SLIDER') {
        // SLIDER 模式：使用参数的实际值
        const value = samplingParameters.value[key]
        if (typeof value === 'number' && Number.isFinite(value)) {
          finalValue = value
        }
      } else {
        // INPUT 模式：使用 manualValue（必须非空）
        const manualValue = getManualValue(key)
        if (typeof manualValue === 'number' && Number.isFinite(manualValue)) {
          finalValue = manualValue
        }
      }

      // 添加到覆盖对象
      if (finalValue !== null) {
        // 浮点数保留 4 位小数
        if (SAMPLING_SLIDER_CONTROLS.find(c => c.key === key)) {
          overrides[key] = parseFloat(finalValue.toFixed(4))
        } else {
          // 整数参数
          overrides[key] = Math.round(finalValue)
        }
      }
    }

    return Object.keys(overrides).length > 0 ? overrides : null
  }

  // ========== 导出 ==========

  return {
    // 常量
    SAMPLING_SLIDER_CONTROLS,
    SAMPLING_INTEGER_CONTROLS,
    
    // 状态
    samplingParameters,
    isSamplingEnabled,
    isSamplingControlAvailable,
    samplingButtonTitle,
    
    // 模式管理
    getParameterMode,
    getManualValue,
    toggleParameterMode,
    fillDefaultValue,
    
    // 值处理
    getSliderValue,
    handleSamplingSliderInput,
    handleManualInput,
    formatSamplingValue,
    
    // 校验
    validateParameter,
    validateAllParameters,
    hasParameterError,
    
    // 操作
    toggleSamplingParametersEnabled,
    resetSamplingParameters,
    buildSamplingParameterOverrides
  }
}
