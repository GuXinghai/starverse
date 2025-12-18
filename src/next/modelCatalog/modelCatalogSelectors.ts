import type { ModelCatalogItem } from './modelCatalogTypes'

export function selectModelCatalogVisible(items: readonly ModelCatalogItem[]): ModelCatalogItem[] {
  return items.filter((m) => m.status === 'visible')
}

export function selectModelCatalogAll(items: readonly ModelCatalogItem[]): ModelCatalogItem[] {
  return [...items]
}

