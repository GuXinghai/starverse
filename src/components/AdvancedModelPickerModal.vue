<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-container">
          <!-- 标题栏 -->
          <div class="modal-header">
            <h2 class="modal-title">高级模型选择器</h2>
            <button @click="closeModal" class="close-btn" title="关闭">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 主内容区 - 左右分栏 -->
          <div class="modal-content">
            <!-- 左侧窗格：搜索和筛选器 -->
            <div class="left-pane">
              <!-- 搜索框 -->
              <div class="search-section">
                <div class="search-box">
                  <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="搜索模型..."
                    class="search-input"
                  />
                  <button v-if="searchQuery" @click="searchQuery = ''" class="clear-search-btn">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 筛选器区域 -->
              <div ref="filtersContainer" class="filters-section scrollbar-auto-hide">
                <!-- 模型厂商筛选 -->
                <div class="filter-group">
                  <div class="filter-header">
                    <label class="filter-label">模型厂商</label>
                    <button @click="showProviderEditor = true" class="edit-btn" title="编辑显示的厂商">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                  <div class="filter-tags">
                    <button
                      v-for="provider in displayedProviders"
                      :key="provider"
                      @click="toggleFilter('providers', provider)"
                      :class="['filter-tag', { active: filters.providers.has(provider) }]"
                    >
                      {{ provider }}
                      <span class="tag-count">({{ getProviderCount(provider) }})</span>
                    </button>
                  </div>
                </div>

                <!-- 输入模态性筛选 -->
                <div class="filter-group">
                  <label class="filter-label">输入模态</label>
                  <div class="filter-tags">
                    <button
                      v-for="modality in ['text', 'image', 'file', 'audio', 'video']"
                      :key="modality"
                      @click="toggleFilter('inputModalities', modality)"
                      :class="['filter-tag', { active: filters.inputModalities.has(modality) }]"
                    >
                      <span class="flex items-center gap-1.5">
                        <svg v-if="modality === 'text'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <svg v-else-if="modality === 'image'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <svg v-else-if="modality === 'file'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <svg v-else-if="modality === 'audio'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <svg v-else-if="modality === 'video'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>{{ modality.charAt(0).toUpperCase() + modality.slice(1) }}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <!-- 输出模态性筛选 -->
                <div class="filter-group">
                  <label class="filter-label">输出模态</label>
                  <div class="filter-tags">
                    <button
                      v-for="modality in ['text', 'image', 'embeddings']"
                      :key="modality"
                      @click="toggleFilter('outputModalities', modality)"
                      :class="['filter-tag', { active: filters.outputModalities.has(modality) }]"
                    >
                      <span class="flex items-center gap-1.5">
                        <svg v-if="modality === 'text'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <svg v-else-if="modality === 'image'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <svg v-else-if="modality === 'embeddings'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <span>{{ modality.charAt(0).toUpperCase() + modality.slice(1) }}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <!-- 清除筛选按钮 -->
                <button @click="clearFilters" class="clear-filters-btn">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  清除所有筛选
                </button>
              </div>
            </div>

            <!-- 右侧窗格：模型列表 -->
            <div class="right-pane">
              <!-- 模型列表头部 -->
              <div class="models-header">
                <span class="results-count">
                  找到 {{ filteredModels.length }} 个模型
                </span>
                <div class="view-options">
                  <button
                    @click="sortBy = 'name'"
                    :class="['sort-btn', { active: sortBy === 'name' }]"
                    title="按名称排序"
                  >
                    A-Z
                  </button>
                  <button
                    @click="sortBy = 'context'"
                    :class="['sort-btn', { active: sortBy === 'context' }]"
                    title="按上下文长度排序"
                  >
                    📏
                  </button>
                  <button
                    @click="sortBy = 'price'"
                    :class="['sort-btn', { active: sortBy === 'price' }]"
                    title="按价格排序"
                  >
                    💰
                  </button>
                </div>
              </div>

              <!-- 模型列表 -->
              <div ref="modelsListContainer" class="models-list scrollbar-auto-hide">
                <div
                  v-for="model in sortedModels"
                  :key="model.id"
                  @click="selectModel(model.id)"
                  :class="['model-item', { selected: isSelected(model.id) }]"
                >
                  <div class="model-main">
                    <div class="model-title-row">
                      <h3 class="model-name">{{ model.name }}</h3>
                      <button
                        @click.stop="toggleFavorite(model.id)"
                        :class="['favorite-btn', { favorited: isFavorited(model.id) }]"
                        :title="isFavorited(model.id) ? '取消收藏' : '收藏'"
                      >
                        <svg class="w-5 h-5" :fill="isFavorited(model.id) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    </div>
                    <p class="model-id">{{ model.id }}</p>
                    <div v-if="model.description" class="model-description-container">
                      <div 
                        :ref="el => { if (el) descriptionRefs[model.id] = el }"
                        :class="['model-description-wrapper', { 
                          'collapsed': !isDescriptionExpanded(model.id) && shouldShowExpandBtn(model.id)
                        }]"
                      >
                        <p class="model-description">
                          {{ model.description }}
                        </p>
                        <!-- 渐隐遮罩 -->
                        <div 
                          v-if="!isDescriptionExpanded(model.id) && shouldShowExpandBtn(model.id)"
                          class="description-fade"
                        ></div>
                      </div>
                      <!-- 展开/收起按钮 -->
                      <button
                        v-if="shouldShowExpandBtn(model.id)"
                        @click.stop="toggleDescription(model.id)"
                        class="expand-btn"
                      >
                        {{ isDescriptionExpanded(model.id) ? '收起' : '展开' }}
                        <svg 
                          :class="['expand-icon', { 'rotate-180': isDescriptionExpanded(model.id) }]"
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div class="model-metadata">
                    <div class="metadata-row">
                      <span class="metadata-item">
                        <span class="metadata-label">系列:</span>
                        <span class="metadata-value series-badge">{{ model.series }}</span>
                      </span>
                      <span class="metadata-item">
                        <span class="metadata-label">上下文:</span>
                        <span class="metadata-value">{{ formatContextLength(model.context_length) }}</span>
                      </span>
                    </div>
                    <div class="metadata-row">
                      <span class="metadata-item">
                        <span class="metadata-label">输入:</span>
                        <span class="modalities">
                          <span v-for="mod in model.input_modalities" :key="mod" class="modality-icon" :title="mod">
                            <svg v-if="mod === 'text'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <svg v-else-if="mod === 'image'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <svg v-else-if="mod === 'file'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <svg v-else-if="mod === 'audio'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                            <svg v-else-if="mod === 'video'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </span>
                        </span>
                      </span>
                      <span class="metadata-item">
                        <span class="metadata-label">输出:</span>
                        <span class="modalities">
                          <span v-for="mod in model.output_modalities" :key="mod" class="modality-icon" :title="mod">
                            <svg v-if="mod === 'text'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <svg v-else-if="mod === 'image'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <svg v-else-if="mod === 'embeddings'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <svg v-else-if="mod === 'audio'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                            <svg v-else-if="mod === 'video'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </span>
                        </span>
                      </span>
                    </div>
                    <div class="metadata-row">
                      <span class="metadata-item">
                        <span class="metadata-label">价格 (USD / 1M tokens):</span>
                        <span class="metadata-value price">
                          ${{ formatUsdPer1MFromPerToken(model.pricing?.promptUsdPerToken) }} / ${{ formatUsdPer1MFromPerToken(model.pricing?.completionUsdPerToken) }}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 空状态 -->
                <div v-if="filteredModels.length === 0" class="empty-state">
                  <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="empty-text">没有找到符合条件的模型</p>
                  <button @click="clearFilters" class="empty-action-btn">
                    清除筛选条件
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 厂商编辑器 -->
        <Transition name="editor-modal">
          <div v-if="showProviderEditor" class="provider-editor-overlay" @click.self="showProviderEditor = false">
            <div class="provider-editor-container">
              <div class="editor-header">
                <h3 class="editor-title">编辑显示的厂商</h3>
                <button @click="showProviderEditor = false" class="close-btn" title="关闭">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="editor-content">
                <p class="editor-description">选择要在筛选器中显示的厂商（按数量排序）</p>
                <div class="provider-list">
                  <label
                    v-for="provider in allProviders"
                    :key="provider"
                    class="provider-checkbox-item"
                  >
                    <input
                      type="checkbox"
                      :checked="visibleProviders.has(provider)"
                      @change="toggleProviderVisibility(provider)"
                      class="provider-checkbox"
                    />
                    <span class="provider-name">{{ provider }}</span>
                    <span class="provider-count-badge">{{ getProviderCount(provider) }}</span>
                  </label>
                </div>
              </div>
              <div class="editor-footer">
                <button @click="resetProviderVisibility" class="reset-btn">
                  重置为默认
                </button>
                <button @click="showProviderEditor = false" class="confirm-btn">
                  确定
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useConversationStore } from '../stores/conversation'
import { useModelStore } from '../stores/model'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'select'])

const conversationStore = useConversationStore()
const modelStore = useModelStore()

// 滚动容器引用
const filtersContainer = ref(null)
const modelsListContainer = ref(null)
let filtersScrollTimer = null
let modelsScrollTimer = null

// 滚动事件处理
const handleFiltersScroll = () => {
  if (!filtersContainer.value) return
  filtersContainer.value.classList.add('scrolling')
  if (filtersScrollTimer !== null) clearTimeout(filtersScrollTimer)
  filtersScrollTimer = setTimeout(() => {
    filtersContainer.value?.classList.remove('scrolling')
  }, 1000)
}

const handleModelsScroll = () => {
  if (!modelsListContainer.value) return
  modelsListContainer.value.classList.add('scrolling')
  if (modelsScrollTimer !== null) clearTimeout(modelsScrollTimer)
  modelsScrollTimer = setTimeout(() => {
    modelsListContainer.value?.classList.remove('scrolling')
  }, 1000)
}

// 添加/移除滚动监听器
const attachScrollListeners = () => {
  nextTick(() => {
    if (filtersContainer.value) {
      filtersContainer.value.addEventListener('scroll', handleFiltersScroll)
    }
    if (modelsListContainer.value) {
      modelsListContainer.value.addEventListener('scroll', handleModelsScroll)
    }
  })
}

const removeScrollListeners = () => {
  if (filtersContainer.value) {
    filtersContainer.value.removeEventListener('scroll', handleFiltersScroll)
  }
  if (modelsListContainer.value) {
    modelsListContainer.value.removeEventListener('scroll', handleModelsScroll)
  }
  if (filtersScrollTimer !== null) clearTimeout(filtersScrollTimer)
  if (modelsScrollTimer !== null) clearTimeout(modelsScrollTimer)
}

// 监听模态框打开/关闭
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    attachScrollListeners()
  } else {
    removeScrollListeners()
  }
})

// 组件卸载时清理
onUnmounted(() => {
  removeScrollListeners()
})

// 搜索查询
const searchQuery = ref('')

// 描述 DOM 引用（用于高度检测）
const descriptionRefs = ref({})

// 需要展开按钮的模型 ID 集合
const modelsNeedingExpansion = ref(new Set())

// 模型描述展开状态（使用 Set 存储已展开的模型 ID）
const expandedDescriptions = ref(new Set())

// 厂商编辑器显示状态
const showProviderEditor = ref(false)

// 可见的厂商集合（从 localStorage 加载）
const visibleProviders = ref(new Set())

// 监听编辑器打开，确保 visibleProviders 与 displayedProviders 同步
watch(showProviderEditor, (isOpen) => {
  if (isOpen && visibleProviders.value.size === 0) {
    // 如果用户从未自定义过，初始化为当前显示的厂商
    displayedProviders.value.forEach(provider => {
      visibleProviders.value.add(provider)
    })
  }
})

// 筛选条件
const filters = ref({
  providers: new Set(),
  inputModalities: new Set(),
  outputModalities: new Set()
})

// 排序方式
const sortBy = ref('name')

// 从 store 获取所有模型
const allModelsData = computed(() => modelStore.appModels)

// ========== 厂商提取和管理 ==========

/**
 * 从模型 ID 提取厂商名称
 * @param {string} modelId - 模型 ID，例如 "google/gemini-2.5-pro-preview"
 * @returns {string} 厂商名称，例如 "google"
 */
const extractProvider = (modelId) => {
  if (!modelId || typeof modelId !== 'string') return 'unknown'
  const slashIndex = modelId.indexOf('/')
  if (slashIndex === -1) return 'unknown'
  return modelId.substring(0, slashIndex).toLowerCase()
}

/**
 * 获取所有厂商及其模型数量（按数量降序，数量相同按首字母排序）
 * @returns {Array<string>} 排序后的厂商名称数组
 */
const allProviders = computed(() => {
  const providerCounts = new Map()
  
  // 统计每个厂商的模型数量
  allModelsData.value.forEach(model => {
    const provider = extractProvider(model.id)
    providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1)
  })
  
  // 转换为数组并排序
  return Array.from(providerCounts.entries())
    .sort((a, b) => {
      // 首先按数量降序
      if (b[1] !== a[1]) {
        return b[1] - a[1]
      }
      // 数量相同，按首字母升序
      return a[0].localeCompare(b[0])
    })
    .map(([provider]) => provider)
})

/**
 * 显示的厂商列表（根据用户设置）
 */
const displayedProviders = computed(() => {
  if (visibleProviders.value.size === 0) {
    // 如果没有设置，返回前8个
    return allProviders.value.slice(0, 8)
  }
  // 返回用户选择的厂商，但按照 allProviders 的顺序
  return allProviders.value.filter(p => visibleProviders.value.has(p))
})

/**
 * 获取指定厂商的模型数量
 */
const getProviderCount = (provider) => {
  return allModelsData.value.filter(m => extractProvider(m.id) === provider).length
}

/**
 * 切换厂商的可见性
 */
const toggleProviderVisibility = (provider) => {
  if (visibleProviders.value.has(provider)) {
    visibleProviders.value.delete(provider)
  } else {
    visibleProviders.value.add(provider)
  }
  saveProviderVisibility()
}

/**
 * 重置厂商可见性为默认（前8个）
 */
const resetProviderVisibility = () => {
  visibleProviders.value.clear()
  saveProviderVisibility()
}

/**
 * 保存厂商可见性设置到 localStorage
 */
const saveProviderVisibility = () => {
  try {
    const data = Array.from(visibleProviders.value)
    localStorage.setItem('advancedModelPicker_visibleProviders', JSON.stringify(data))
  } catch (error) {
    console.error('保存厂商可见性设置失败:', error)
  }
}

/**
 * 从 localStorage 加载厂商可见性设置
 */
const loadProviderVisibility = () => {
  try {
    const data = localStorage.getItem('advancedModelPicker_visibleProviders')
    if (data) {
      const parsed = JSON.parse(data)
      visibleProviders.value = new Set(parsed)
    }
  } catch (error) {
    console.error('加载厂商可见性设置失败:', error)
  }
}

// 组件挂载时加载设置
onMounted(() => {
  loadProviderVisibility()
})

// ========== 原有的分位数刻度算法（已移除，保留注释供参考） ==========

// 动态提取所有可用的模型系列（已废弃，改为厂商）
// const availableSeries = computed(() => { ... })

// 计算最大上下文长度（已废弃）
// const maxContextLength = computed(() => { ... })

// 切换筛选条件
const toggleFilter = (filterType, value) => {
  if (filters.value[filterType].has(value)) {
    filters.value[filterType].delete(value)
  } else {
    filters.value[filterType].add(value)
  }
}

// 清除所有筛选
const clearFilters = () => {
  filters.value = {
    providers: new Set(),
    inputModalities: new Set(),
    outputModalities: new Set()
  }
  searchQuery.value = ''
}

// 过滤后的模型列表
const filteredModels = computed(() => {
  let models = allModelsData.value

  // 搜索过滤（仅匹配 ID 和名称的连续字段）
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    models = models.filter(model => 
      model.id.toLowerCase().includes(query) ||
      model.name.toLowerCase().includes(query)
    )
  }

  // 厂商过滤
  if (filters.value.providers.size > 0) {
    models = models.filter(model => 
      filters.value.providers.has(extractProvider(model.id))
    )
  }

  // 输入模态性过滤（AND 逻辑 - 必须包含所有选中的模态）
  if (filters.value.inputModalities.size > 0) {
    models = models.filter(model => {
      const modelModalities = new Set(model.input_modalities || [])
      for (const requiredModality of filters.value.inputModalities) {
        if (!modelModalities.has(requiredModality)) {
          return false
        }
      }
      return true
    })
  }

  // 输出模态性过滤（AND 逻辑 - 必须包含所有选中的模态）
  if (filters.value.outputModalities.size > 0) {
    models = models.filter(model => {
      const modelModalities = new Set(model.output_modalities || [])
      for (const requiredModality of filters.value.outputModalities) {
        if (!modelModalities.has(requiredModality)) {
          return false
        }
      }
      return true
    })
  }

  return models
})

// 排序后的模型列表
const sortedModels = computed(() => {
  const models = [...filteredModels.value]

  switch (sortBy.value) {
    case 'name':
      return models.sort((a, b) => a.name.localeCompare(b.name))
    case 'context':
      return models.sort((a, b) => b.context_length - a.context_length)
    case 'price':
      return models.sort((a, b) => parseUsdPerToken(a.pricing?.promptUsdPerToken) - parseUsdPerToken(b.pricing?.promptUsdPerToken))
    default:
      return models
  }
})

// 获取当前选中的模型
const currentModel = computed(() => {
  const activeConv = conversationStore.activeConversation
  return activeConv?.model || modelStore.selectedModelId
})

// 检查是否选中
const isSelected = (modelId) => {
  return modelId === currentModel.value
}

// 检查是否收藏
const isFavorited = (modelId) => {
  return modelStore.isFavorite(modelId)
}

// 切换收藏
const toggleFavorite = (modelId) => {
  modelStore.toggleFavorite(modelId)
}

// 检查描述是否展开
const isDescriptionExpanded = (modelId) => {
  return expandedDescriptions.value.has(modelId)
}

// 切换描述展开状态
const toggleDescription = (modelId) => {
  if (expandedDescriptions.value.has(modelId)) {
    expandedDescriptions.value.delete(modelId)
  } else {
    expandedDescriptions.value.add(modelId)
  }
}

// 检查是否应该显示展开按钮（基于真实 DOM 高度）
const shouldShowExpandBtn = (modelId) => {
  return modelsNeedingExpansion.value.has(modelId)
}

// 检测哪些描述需要展开按钮
const detectOverflowingDescriptions = async () => {
  await nextTick()
  modelsNeedingExpansion.value.clear()
  
  // 4 行的最大高度（line-height: 1.5, font-size: 0.875rem ≈ 14px）
  // 4 行 ≈ 14px * 1.5 * 4 = 84px
  const maxHeight = 84
  
  for (const [modelId, el] of Object.entries(descriptionRefs.value)) {
    if (el && el.scrollHeight > maxHeight) {
      modelsNeedingExpansion.value.add(modelId)
    }
  }
}

// 选择模型
const selectModel = (modelId) => {
  const activeConv = conversationStore.activeConversation
  if (activeConv) {
    conversationStore.updateConversationModel(activeConv.id, modelId)
  } else {
    modelStore.selectedModelId = modelId
  }
  emit('select', modelId)
  closeModal()
}

// 关闭模态框
const closeModal = () => {
  emit('close')
}

// 格式化上下文长度
const formatContextLength = (length) => {
  if (!length) return 'N/A'
  if (length >= 1000000) {
    return `${(length / 1000000).toFixed(1)}M`
  }
  if (length >= 1000) {
    return `${Math.floor(length / 1000)}K`
  }
  return length.toString()
}

import { formatUsdPer1MFromPerToken, parseUsdPerToken } from '@/utils/pricing'

// 获取模态性图标（返回 SVG 路径）
const getModalityIcon = (modality) => {
  // 返回简短的标识符，用于在模板中渲染对应的 SVG
  return modality
}

// 监听打开状态，初始化筛选器
watch(() => props.isOpen, (newVal) => {
  if (newVal && allModelsData.value.length > 0) {
    // 检测溢出的描述
    detectOverflowingDescriptions()
  }
})

// 监听筛选后的模型变化，重新检测溢出
watch(filteredModels, () => {
  detectOverflowingDescriptions()
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
}

.modal-container {
  background: white;
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  max-width: 1400px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.close-btn {
  padding: 0.5rem;
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

/* 主内容区 - 左右分栏 */
.modal-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* 左侧窗格 - 搜索和筛选器 */
.left-pane {
  width: 320px;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
  flex-shrink: 0;
}

.search-section {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 1rem;
  width: 1.25rem;
  height: 1.25rem;
  color: #9ca3af;
}

.search-input {
  width: 100%;
  padding: 0.75rem 3rem 0.75rem 3rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  font-size: 0.9rem;
  transition: all 0.2s;
  background: white;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.clear-search-btn {
  position: absolute;
  right: 0.75rem;
  padding: 0.25rem;
  background: #f3f4f6;
  border: none;
  border-radius: 0.375rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-search-btn:hover {
  background: #e5e7eb;
  color: #111827;
}

.filters-section {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.filter-group {
  margin-bottom: 1.5rem;
}

.filter-group:last-of-type {
  margin-bottom: 1rem;
}

.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.edit-btn {
  padding: 0.375rem;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-btn:hover {
  background: #f3f4f6;
  border-color: #667eea;
  color: #667eea;
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-tag {
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.filter-tag:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.filter-tag.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.tag-count {
  font-size: 0.75rem;
  opacity: 0.7;
}

.clear-filters-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-filters-btn:hover {
  background: #f3f4f6;
  border-color: #667eea;
  color: #667eea;
}

/* 右侧窗格 - 模型列表 */
.right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  flex-shrink: 0;
}

.results-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.view-options {
  display: flex;
  gap: 0.5rem;
}

.sort-btn {
  padding: 0.375rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.sort-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.models-list {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background: #f9fafb;
}

.model-item {
  padding: 1.25rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.model-item:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.model-item.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
}

.model-main {
  margin-bottom: 1rem;
}

.model-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.model-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  flex: 1;
}

.favorite-btn {
  padding: 0.25rem;
  background: transparent;
  border: none;
  color: #d1d5db;
  cursor: pointer;
  transition: all 0.2s;
}

.favorite-btn:hover {
  color: #fbbf24;
  transform: scale(1.1);
}

.favorite-btn.favorited {
  color: #fbbf24;
}

.model-id {
  font-size: 0.875rem;
  color: #6b7280;
  font-family: 'Courier New', monospace;
  margin-bottom: 0.5rem;
}

.model-description-container {
  position: relative;
  margin-bottom: 0.75rem;
}

.model-description-wrapper {
  position: relative;
}

.model-description-wrapper.collapsed {
  max-height: 84px; /* 4 行：14px * 1.5 * 4 */
  overflow: hidden;
}

.model-description {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.5;
  margin: 0;
}

.description-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2rem;
  background: linear-gradient(to bottom, transparent, white);
  pointer-events: none;
}

.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: #3b82f6;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.25rem;
}

.expand-btn:hover {
  color: #2563eb;
  background: #eff6ff;
  border-radius: 0.25rem;
}

.expand-icon {
  width: 1rem;
  height: 1rem;
  transition: transform 0.2s;
}

.expand-icon.rotate-180 {
  transform: rotate(180deg);
}

.model-metadata {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.metadata-row {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.metadata-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.metadata-label {
  color: #6b7280;
  font-weight: 500;
}

.metadata-value {
  color: #111827;
  font-weight: 600;
}

.series-badge {
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.modalities {
  display: flex;
  gap: 0.25rem;
}

.modality-icon {
  font-size: 1rem;
}

.price {
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  width: 4rem;
  height: 4rem;
  color: #d1d5db;
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.empty-action-btn {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.empty-action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}

/* 厂商编辑器模态框 */
.provider-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 2rem;
}

.provider-editor-container {
  background: white;
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.editor-title {
  font-size: 1.25rem;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.editor-description {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.provider-checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.provider-checkbox-item:hover {
  background: #f9fafb;
  border-color: #667eea;
}

.provider-checkbox {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  flex-shrink: 0;
}

.provider-name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 500;
  color: #374151;
  text-transform: capitalize;
}

.provider-count-badge {
  padding: 0.25rem 0.625rem;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  color: #667eea;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.reset-btn {
  padding: 0.625rem 1.25rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: #f3f4f6;
  border-color: #667eea;
  color: #667eea;
}

.confirm-btn {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 编辑器模态框动画 */
.editor-modal-enter-active,
.editor-modal-leave-active {
  transition: opacity 0.25s ease;
}

.editor-modal-enter-from,
.editor-modal-leave-to {
  opacity: 0;
}

.editor-modal-enter-active .provider-editor-container,
.editor-modal-leave-active .provider-editor-container {
  transition: transform 0.25s ease;
}

.editor-modal-enter-from .provider-editor-container,
.editor-modal-leave-to .provider-editor-container {
  transform: scale(0.95);
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .left-pane {
    width: 280px;
  }
}

@media (max-width: 768px) {
  .modal-content {
    flex-direction: column;
  }
  
  .left-pane {
    width: 100%;
    max-height: 40%;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .right-pane {
    max-height: 60%;
  }
}
</style>
