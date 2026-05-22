import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  type Placement,
} from '@floating-ui/vue'
import { computed, ref, type Ref, type CSSProperties } from 'vue'

export type FloatingDropdownOptions = Readonly<{
  placement?: Placement
  offset?: number
  padding?: number
}>

export function useFloatingDropdown(
  reference: Ref<HTMLElement | null>,
  floating: Ref<HTMLElement | null>,
  options: FloatingDropdownOptions = {},
) {
  const maxHeight = ref<string | null>(null)
  const placement = options.placement ?? 'top-start'
  const offsetPx = options.offset ?? 8
  const padding = options.padding ?? 8

  const { floatingStyles, update } = useFloating(reference, floating, {
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(offsetPx),
      flip({ padding }),
      shift({ padding }),
      size({
        padding,
        apply({ availableHeight }) {
          maxHeight.value = `${Math.max(0, Math.floor(availableHeight))}px`
        },
      }),
    ],
  })

  const dropdownStyle = computed<CSSProperties>(() => ({
    ...floatingStyles.value,
    maxHeight: maxHeight.value ?? undefined,
    overflowY: 'auto',
  }))

  return {
    dropdownStyle,
    update,
  }
}
