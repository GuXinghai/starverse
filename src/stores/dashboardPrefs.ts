import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dbService } from '../services/db'
import type {
  DashboardPrefRecord,
  SaveDashboardPrefPayload,
  DashboardLayoutWidget,
  DashboardFilters
} from '../services/db'
import { v4 as uuidv4 } from 'uuid'

const DEFAULT_USER_ID = 'local-user'

export const useDashboardPrefsStore = defineStore('dashboardPrefs', () => {
  const views = ref<DashboardPrefRecord[]>([])
  const defaultView = ref<DashboardPrefRecord | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const listViews = async (userId: string = DEFAULT_USER_ID) => {
    loading.value = true
    error.value = null
    try {
      const res = await dbService.listDashboardPrefs(userId)
      views.value = res.items
      defaultView.value = res.items.find((v) => v.isDefault) ?? null
    } catch (err: any) {
      error.value = err?.message || '加载视图失败'
    } finally {
      loading.value = false
    }
  }

  const saveView = async (payload: {
    name: string
    layout: DashboardLayoutWidget[]
    filters?: DashboardFilters | null
    viewId?: string
    setDefault?: boolean
    userId?: string
  }) => {
    const viewId = payload.viewId ?? uuidv4()
    const body: SaveDashboardPrefPayload = {
      userId: payload.userId ?? DEFAULT_USER_ID,
      viewId,
      name: payload.name,
      layout: payload.layout,
      filters: payload.filters ?? null,
      isDefault: payload.setDefault ?? false
    }
    const saved = await dbService.saveDashboardPref(body)
    const idx = views.value.findIndex((v) => v.viewId === saved.viewId)
    if (idx >= 0) {
      views.value.splice(idx, 1, saved)
    } else {
      views.value.unshift(saved)
    }
    if (saved.isDefault) {
      defaultView.value = saved
    }
    return saved
  }

  const removeView = async (viewId: string, userId: string = DEFAULT_USER_ID) => {
    await dbService.deleteDashboardPref({ userId, viewId })
    views.value = views.value.filter((v) => v.viewId !== viewId)
    if (defaultView.value?.viewId === viewId) {
      defaultView.value = null
    }
  }

  const applyDefault = async (userId: string = DEFAULT_USER_ID) => {
    const res = await dbService.getDefaultDashboardPref(userId)
    if (res) {
      defaultView.value = res
    }
    return res
  }

  return {
    views,
    defaultView,
    loading,
    error,
    listViews,
    saveView,
    removeView,
    applyDefault
  }
})
