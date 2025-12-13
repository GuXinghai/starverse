export interface PricingFormatOptions {
  /** 最小小数位（默认 0） */
  minFractionDigits?: number
  /** 最大小数位（默认 6） */
  maxFractionDigits?: number
}

function toNumericString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(value)
  }
  if (typeof value === 'string') return value.trim()
  return ''
}

/**
 * 解析 OpenRouter pricing 原值：USD per token。
 * - 输入容错：null/''/非数字 -> 0
 * - 允许科学计数法（如 "1e-6"）
 */
export function parseUsdPerToken(value: unknown): number {
  const str = toNumericString(value)
  if (!str) return 0
  const num = Number(str)
  return Number.isFinite(num) ? num : 0
}

type DecimalParts = {
  negative: boolean
  digits: string // 无小数点的纯数字（至少 1 位）
  scale: number // 小数位数（digits 末尾有 scale 位属于小数部分）
}

function parseDecimalString(input: string): DecimalParts | null {
  const str = input.trim()
  if (!str) return null

  let negative = false
  let s = str
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  if (!s) return null

  // 拆 exponent
  let exp = 0
  const eIndex = s.toLowerCase().indexOf('e')
  if (eIndex !== -1) {
    const base = s.slice(0, eIndex)
    const expStr = s.slice(eIndex + 1)
    if (!base || !expStr) return null
    if (!/^[+-]?\d+$/.test(expStr.trim())) return null
    exp = parseInt(expStr.trim(), 10)
    s = base
  }

  // base part
  if (!/^\d*(\.\d*)?$/.test(s)) return null

  const [intPartRaw, fracPartRaw = ''] = s.split('.')
  const intPart = intPartRaw || '0'
  const fracPart = fracPartRaw || ''

  // 去掉前导零（但至少留 1 位）
  let digits = (intPart + fracPart).replace(/^0+/, '')
  if (digits === '') digits = '0'

  // scale = frac length（注意：如果 intPart 全是 0 且被去掉了，也不影响 scale 语义）
  let scale = fracPart.length

  // 应用 exponent：value = digits * 10^(exp - scale)
  // 等价于调整 scale = scale - exp
  scale = scale - exp

  if (scale < 0) {
    // 小数位为负：补零到末尾
    digits = digits + '0'.repeat(-scale)
    scale = 0
  }

  return { negative, digits, scale }
}

function addOneToDigits(digits: string): string {
  let carry = 1
  const arr = digits.split('')
  for (let i = arr.length - 1; i >= 0; i--) {
    const d = arr[i].charCodeAt(0) - 48
    const sum = d + carry
    if (sum >= 10) {
      arr[i] = '0'
      carry = 1
    } else {
      arr[i] = String(sum)
      carry = 0
      break
    }
  }
  if (carry === 1) arr.unshift('1')
  return arr.join('')
}

function shiftDecimalRight(parts: DecimalParts, places: number): DecimalParts {
  // 右移小数点 = scale - places
  let { negative, digits, scale } = parts
  scale = scale - places
  if (scale < 0) {
    digits = digits + '0'.repeat(-scale)
    scale = 0
  }
  return { negative, digits, scale }
}

function roundToMaxFraction(parts: DecimalParts, maxFractionDigits: number): DecimalParts {
  const { negative } = parts
  let { digits, scale } = parts

  if (scale <= maxFractionDigits) return parts

  const cut = scale - maxFractionDigits
  if (cut >= digits.length) {
    // 全部被截掉，结果为 0（按四舍五入规则处理）
    // 例如 digits="1", scale=10, max=6 -> 0.000000????
    const firstDropped = digits[0]
    const shouldRoundUp = firstDropped >= '5'
    return {
      negative,
      digits: shouldRoundUp ? '1' : '0',
      scale: maxFractionDigits,
    }
  }

  const keepLen = digits.length - cut
  const keep = digits.slice(0, keepLen)
  const dropped = digits.slice(keepLen) // 长度=cut
  const shouldRoundUp = dropped[0] >= '5'

  digits = shouldRoundUp ? addOneToDigits(keep) : keep
  scale = maxFractionDigits
  return { negative, digits, scale }
}

function toPlainString(parts: DecimalParts): string {
  const { negative } = parts
  let { digits, scale } = parts

  // 归一化：去掉 leading zeros（保留至少 1 位）
  digits = digits.replace(/^0+/, '') || '0'

  // 插入小数点
  let intPart: string
  let fracPart: string

  if (scale === 0) {
    intPart = digits
    fracPart = ''
  } else {
    const splitPos = digits.length - scale
    if (splitPos > 0) {
      intPart = digits.slice(0, splitPos)
      fracPart = digits.slice(splitPos)
    } else {
      intPart = '0'
      fracPart = '0'.repeat(-splitPos) + digits
    }
  }

  // 清理 intPart
  intPart = intPart.replace(/^0+/, '') || '0'

  let out = fracPart ? `${intPart}.${fracPart}` : intPart
  if (negative && out !== '0' && out !== '0.0') out = `-${out}`
  return out
}

function trimFraction(value: string, minFractionDigits: number): string {
  if (!value.includes('.')) {
    if (minFractionDigits > 0) return `${value}.${'0'.repeat(minFractionDigits)}`
    return value
  }

  const [intPart, fracPartRaw] = value.split('.')
  let fracPart = fracPartRaw

  // 去尾零，但至少保留 minFractionDigits
  while (fracPart.length > minFractionDigits && fracPart.endsWith('0')) {
    fracPart = fracPart.slice(0, -1)
  }

  if (fracPart.length === 0) {
    return minFractionDigits > 0 ? `${intPart}.${'0'.repeat(minFractionDigits)}` : intPart
  }

  if (fracPart.length < minFractionDigits) {
    fracPart = fracPart + '0'.repeat(minFractionDigits - fracPart.length)
  }

  return `${intPart}.${fracPart}`
}

/**
 * 把 per-token 的 USD 单价换算成 UI 展示口径：USD / 1M tokens。
 * - 输入容错：空/非数字 -> 0
 * - 字符串安全换算：避免 19.999999 这类浮点尾差
 */
export function formatUsdPer1MFromPerToken(
  value: unknown,
  opts: PricingFormatOptions = {}
): string {
  const { minFractionDigits = 0, maxFractionDigits = 6 } = opts
  const raw = toNumericString(value)
  if (!raw) return '0'

  const parts = parseDecimalString(raw)
  if (!parts) return '0'

  // per-token * 1_000_000
  let shifted = shiftDecimalRight(parts, 6)

  // 价格不应为负；若出现负数，按 0 处理（避免 UI 误导）
  if (shifted.negative) return '0'

  shifted = roundToMaxFraction(shifted, Math.max(0, maxFractionDigits))

  const plain = toPlainString(shifted)
  const trimmed = trimFraction(plain, Math.max(0, minFractionDigits))

  // 归一化零
  if (trimmed === '-0' || trimmed === '-0.0') return '0'
  return trimmed
}

/**
 * debug/高级视图：格式化 per-token 原值（不换算）。
 */
export function formatUsdPerToken(
  value: unknown,
  opts: PricingFormatOptions = {}
): string {
  const { minFractionDigits = 0, maxFractionDigits = 12 } = opts
  const raw = toNumericString(value)
  if (!raw) return '0'
  const parts = parseDecimalString(raw)
  if (!parts || parts.negative) return '0'

  const rounded = roundToMaxFraction(parts, Math.max(0, maxFractionDigits))
  const plain = toPlainString(rounded)
  return trimFraction(plain, Math.max(0, minFractionDigits))
}
