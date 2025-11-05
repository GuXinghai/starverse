/**
 * 消息分支树辅助函数（重构版 - 版本级后继关系）
 * 
 * 【核心原则】
 * 1. 所有树操作收口到少量纯函数
 * 2. 禁止 UI 直接修改深层字段
 * 3. 后继关系在版本级别（MessageVersion.childBranchIds）
 * 4. 分支记录源自父分支的哪个版本（MessageBranch.parentVersionId）
 * 5. 使用不可变更新模式强制触发 Vue 响应式
 */

import { reactive } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { 
  ConversationTree, 
  MessageBranch, 
  MessageVersion, 
  MessagePart,
  ImagePart,
  TextPart,
  MessageVersionMetadata
} from '../types/chat'

/**
 * 工具函数：使用 delete + set 强制触发 Vue 响应式更新
 * Map 的直接修改可能不触发响应式，展开拷贝确保更新
 */
function setBranch(tree: ConversationTree, branch: MessageBranch): void {
  if (tree.branches.has(branch.branchId)) {
    tree.branches.delete(branch.branchId)
  }
  tree.branches.set(branch.branchId, { ...branch })
}

/**
 * 创建空的对话树
 * 使用 reactive Map 确保响应式
 */
export function createEmptyTree(): ConversationTree {
  return {
    branches: reactive(new Map<string, MessageBranch>()),
    rootBranchIds: [],
    currentPath: [],
  }
}

/**
 * 获取分支的当前版本
 * 供 UI 与逻辑共用，避免从 types 文件导函数
 */
export function getCurrentVersion(branch: MessageBranch): MessageVersion | null {
  return branch.versions[branch.currentVersionIndex] ?? null
}

/**
 * 从分支中提取当前版本的文本内容
 * 供 UI 显示和搜索使用
 */
export function extractTextFromBranch(branch: MessageBranch): string {
  const version = getCurrentVersion(branch)
  if (!version) return ''
  
  return version.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('')
}

/**
 * 添加新分支到对话树
 * 
 * 【关键逻辑】
 * 1. 如果有父分支，记录 parentVersionId = 父分支当前版本的 id
 * 2. 把新分支挂到父版本的 childBranchIds 上（版本级后继）
 * 3. 如果没有父分支，则为根分支
 * 
 * @param tree - 对话树
 * @param role - 'user' | 'model'
 * @param parts - 消息内容
 * @param parentBranchId - 父分支ID，null 表示根分支
 * @returns 新分支ID
 */
export function addBranch(
  tree: ConversationTree,
  role: 'user' | 'model',
  parts: MessagePart[],
  parentBranchId: string | null
): string {
  let parentVersionId: string | null = null
  
  // 如果有父分支，找到父分支的当前版本
  if (parentBranchId) {
    const parent = tree.branches.get(parentBranchId)
    if (!parent) throw new Error(`Parent branch ${parentBranchId} not found`)
    
    const parentVersion = getCurrentVersion(parent)
    if (!parentVersion) throw new Error(`Parent branch ${parentBranchId} has no current version`)
    
    parentVersionId = parentVersion.id
  }

  // 创建新版本（初始化空的 childBranchIds）
  const version: MessageVersion = {
    id: uuidv4(),
    parts: parts ?? [],
    timestamp: Date.now(),
    childBranchIds: [], // 版本级的后继列表
    metadata: undefined
  }

  // 创建新分支
  const branch: MessageBranch = {
    branchId: uuidv4(),
    role,
    parentBranchId,
    parentVersionId,     // 记住源自父分支的哪个版本
    versions: [version],
    currentVersionIndex: 0,
  }

  // 添加到树中
  setBranch(tree, branch)

  // 反向维护：把新分支加到父版本的 childBranchIds
  if (parentBranchId) {
    const parent = tree.branches.get(parentBranchId)!
    const parentVersion = getCurrentVersion(parent)!
    
    // 不可变更新父版本
    const newParentVersion: MessageVersion = {
      ...parentVersion,
      childBranchIds: [...parentVersion.childBranchIds, branch.branchId]
    }
    
    // 不可变更新父分支的 versions 数组
    const newVersions = parent.versions.slice()
    newVersions.splice(parent.currentVersionIndex, 1, newParentVersion)
    
    const newParent: MessageBranch = {
      ...parent,
      versions: newVersions
    }
    
    setBranch(tree, newParent)
  }

  // 如果没有父分支，加入根分支列表
  if (!parentBranchId) {
    tree.rootBranchIds = [...tree.rootBranchIds, branch.branchId]
  }

  return branch.branchId
}

/**
 * 为现有分支添加新版本（重新生成）
 * 
 * 【关键】新版本初始化空的 childBranchIds
 * 切换到新版本后，需要调用路径校正
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 * @param parts - 新版本内容
 * @param inheritChildren - 是否继承旧版本的子分支（默认 false）
 * @returns 新版本的 ID
 */
export function addVersionToBranch(
  tree: ConversationTree,
  branchId: string,
  parts: MessagePart[],
  inheritChildren: boolean = false,
  metadata?: MessageVersionMetadata
): string {
  const branch = tree.branches.get(branchId)
  if (!branch) throw new Error(`Branch ${branchId} not found`)

  const currentVersion = getCurrentVersion(branch)
  
  // 创建新版本
  const version: MessageVersion = {
    id: uuidv4(),
    parts: parts ?? [],
    timestamp: Date.now(),
    // ✅ 关键修复：编辑时继承子分支，重新生成时不继承
    childBranchIds: inheritChildren && currentVersion 
      ? [...currentVersion.childBranchIds]  // 继承旧版本的子分支
      : [], // 新生成的版本没有后继
    metadata: metadata ? { ...metadata } : undefined
  }

  // 不可变更新
  const newVersions = [...branch.versions, version]
  const newBranch: MessageBranch = {
    ...branch,
    versions: newVersions,
    currentVersionIndex: newVersions.length - 1
  }

  setBranch(tree, newBranch)
  
  // ✅ 如果继承了子分支，需要更新子分支的 parentVersionId
  if (inheritChildren && currentVersion && currentVersion.childBranchIds.length > 0) {
    for (const childId of currentVersion.childBranchIds) {
      const childBranch = tree.branches.get(childId)
      if (childBranch) {
        const updatedChild: MessageBranch = {
          ...childBranch,
          parentVersionId: version.id  // 更新为新版本ID
        }
        setBranch(tree, updatedChild)
      }
    }
  }

  // 切换版本后需要路径校正
  updatePathAfterVersionSwitch(tree, branchId)
  
  // 返回新版本的 ID
  return version.id
}

/**
 * 切换分支的当前版本
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 * @param direction - +1 向后，-1 向前
 */
export function switchVersion(
  tree: ConversationTree,
  branchId: string,
  direction: 1 | -1
): void {
  const branch = tree.branches.get(branchId)
  if (!branch) return

  const nextIndex = Math.max(
    0,
    Math.min(branch.versions.length - 1, branch.currentVersionIndex + direction)
  )

  if (nextIndex === branch.currentVersionIndex) return

  // 不可变更新
  const newBranch: MessageBranch = {
    ...branch,
    currentVersionIndex: nextIndex
  }

  setBranch(tree, newBranch)

  // 切换后校正 currentPath（保证后继语义一致）
  updatePathAfterVersionSwitch(tree, branchId)
}

/**
 * 版本切换后的路径校正（核心逻辑）
 * 
 * 【关键】只保留与新版本匹配的后继链
 * 验证逻辑：child.parentVersionId 必须等于当前 parent 的版本 id
 * 
 * 这解决了"切换版本后路径跳错"的根本问题：
 * - 旧实现：切换版本后仍使用分支级的 childBranchIds，导致路径错乱
 * - 新实现：严格验证每个后继是否源自当前版本，不匹配则截断
 * 
 * @param tree - 对话树
 * @param changedBranchId - 发生版本切换的分支ID
 */
export function updatePathAfterVersionSwitch(
  tree: ConversationTree,
  changedBranchId: string
): void {
  const changedIndex = tree.currentPath.indexOf(changedBranchId)
  if (changedIndex === -1) return

  // 保留到切换点的路径
  let validPath = tree.currentPath.slice(0, changedIndex + 1)
  
  let parentBranch = tree.branches.get(changedBranchId)
  if (!parentBranch) {
    tree.currentPath = validPath
    return
  }

  let parentVersion = getCurrentVersion(parentBranch)
  if (!parentVersion) {
    tree.currentPath = validPath
    return
  }

  // 逐级校验后继：child.parentVersionId 必须等于当前 parentVersion.id
  for (let i = changedIndex + 1; i < tree.currentPath.length; i++) {
    const childBranchId = tree.currentPath[i]
    const childBranch = tree.branches.get(childBranchId)
    
    if (!childBranch) break
    
    // 验证父子关系
    if (childBranch.parentBranchId !== parentBranch.branchId) break
    
    // 【核心验证】子分支必须源自当前父版本
    if (childBranch.parentVersionId !== parentVersion.id) break

    // 验证通过：纳入新路径
    validPath.push(childBranchId)
    
    // 推进窗口，继续验证更下游的分支
    parentBranch = childBranch
    parentVersion = getCurrentVersion(parentBranch)
    if (!parentVersion) break
  }

  tree.currentPath = validPath

  // 当路径被截断且当前版本仅有唯一合法子分支时，自动延伸路径
  while (true) {
    const lastBranchId = tree.currentPath[tree.currentPath.length - 1]
    if (!lastBranchId) break

    const lastBranch = tree.branches.get(lastBranchId)
    if (!lastBranch) break
    const lastVersion = getCurrentVersion(lastBranch)
    if (!lastVersion) break

    const validChildren = lastVersion.childBranchIds.filter((childId: string) => {
      if (tree.currentPath.includes(childId)) {
        return false
      }
      const childBranch = tree.branches.get(childId)
      if (!childBranch) {
        return false
      }
      return (
        childBranch.parentBranchId === lastBranch.branchId &&
        childBranch.parentVersionId === lastVersion.id
      )
    })

    if (validChildren.length !== 1) {
      break
    }

    tree.currentPath = [...tree.currentPath, validChildren[0]]
  }
}

/**
 * 进入当前版本的第一个子分支
 * 用于 UI 的"继续对话"等导航行为
 * 
 * @param tree - 对话树
 * @param branchId - 当前分支ID
 * @returns 进入的子分支ID，如果没有子分支则返回 null
 */
export function enterFirstChildOfCurrentVersion(
  tree: ConversationTree,
  branchId: string
): string | null {
  const branch = tree.branches.get(branchId)
  if (!branch) return null

  const version = getCurrentVersion(branch)
  if (!version) return null

  const firstChildId = version.childBranchIds[0]
  if (!firstChildId) return null

  // 添加到路径
  tree.currentPath = [...tree.currentPath, firstChildId]
  return firstChildId
}

/**
 * 获取当前路径的消息（用于API调用）
 * 
 * @param tree - 对话树
 * @returns 消息数组，用于发送给 AI API
 */
export function getCurrentPathMessages(tree: ConversationTree) {
  return tree.currentPath.map((branchId: string) => {
    const branch = tree.branches.get(branchId)
    if (!branch) return null
    
    const version = getCurrentVersion(branch)
    if (!version) return null
    
    return {
      role: branch.role,
      parts: version.parts
    }
  }).filter((msg: any) => msg !== null)
}

/**
 * 删除分支（两种模式）
 * 
 * @param tree - 对话树
 * @param branchId - 要删除的分支ID
 * @param deleteAllVersions - true: 删除整个分支，false: 仅删除当前版本
 * @returns 是否成功删除
 */
export function deleteBranch(
  tree: ConversationTree,
  branchId: string,
  deleteAllVersions: boolean
): boolean {
  const branch = tree.branches.get(branchId)
  if (!branch) return false

  if (deleteAllVersions || branch.versions.length === 1) {
    // 删除整个分支及其所有后续分支
    const nextFocusBranchId = findNextFocusBranchId(tree, branch)
    deleteBranchRecursively(tree, branchId)
    normalizeCurrentPath(tree, nextFocusBranchId)
  } else {
    // 仅删除当前版本（需要从父版本的 childBranchIds 中移除所有该版本的子分支）
    const currentVersion = getCurrentVersion(branch)
    if (currentVersion) {
      // 递归删除当前版本的所有子分支
      for (const childId of currentVersion.childBranchIds) {
        deleteBranchRecursively(tree, childId)
      }
    }

    // 移除当前版本
    const newVersions = branch.versions.slice()
    newVersions.splice(branch.currentVersionIndex, 1)

    // 调整索引
    const newIndex = Math.min(branch.currentVersionIndex, newVersions.length - 1)

    const newBranch: MessageBranch = {
      ...branch,
      versions: newVersions,
      currentVersionIndex: newIndex
    }

    setBranch(tree, newBranch)
    normalizeCurrentPath(tree, branch.branchId)
  }

  return true
}

/**
 * 移除分支上的指定版本（通常用于清理出错的版本）
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 * @param versionId - 要移除的版本ID
 * @returns 是否成功移除
 */
export function removeBranchVersion(
  tree: ConversationTree,
  branchId: string,
  versionId: string
): boolean {
  const branch = tree.branches.get(branchId)
  if (!branch) return false

  const targetIndex = branch.versions.findIndex((version: MessageVersion) => version.id === versionId)
  if (targetIndex === -1) return false

  const targetVersion = branch.versions[targetIndex]

  if (targetVersion.childBranchIds && targetVersion.childBranchIds.length > 0) {
    for (const childId of targetVersion.childBranchIds) {
      deleteBranchRecursively(tree, childId)
    }
  }

  const newVersions = branch.versions.filter((_: MessageVersion, idx: number) => idx !== targetIndex)

  if (newVersions.length === 0) {
    deleteBranchRecursively(tree, branchId)
    normalizeCurrentPath(tree)
    return true
  }

  let newCurrentIndex = branch.currentVersionIndex

  if (branch.currentVersionIndex === targetIndex) {
    newCurrentIndex = Math.min(targetIndex, newVersions.length - 1)
  } else if (branch.currentVersionIndex > targetIndex) {
    newCurrentIndex = branch.currentVersionIndex - 1
  }

  const newBranch: MessageBranch = {
    ...branch,
    versions: newVersions,
    currentVersionIndex: newCurrentIndex
  }

  setBranch(tree, newBranch)

  return true
}

function findNextFocusBranchId(tree: ConversationTree, branch: MessageBranch): string | null {
  if (branch.parentBranchId && branch.parentVersionId) {
    const parentBranch = tree.branches.get(branch.parentBranchId)
    if (!parentBranch) {
      return null
    }

    const parentVersion = parentBranch.versions.find(
      (version: MessageVersion) => version.id === branch.parentVersionId
    )

    if (!parentVersion) {
      return null
    }

    if (!Array.isArray(parentVersion.childBranchIds)) {
      return null
    }

    if (parentVersion.childBranchIds.length <= 1) {
      // 删除后将没有兄弟分支
      return null
    }

    const originalOrder = parentVersion.childBranchIds
    const removedIndex = originalOrder.indexOf(branch.branchId)
    const afterCandidates = originalOrder
      .slice(removedIndex + 1)
      .filter((id: string) => id !== branch.branchId)
    if (afterCandidates.length > 0) {
      return afterCandidates[0]
    }

    const beforeCandidates = originalOrder
      .slice(0, removedIndex)
      .filter((id: string) => id !== branch.branchId)
    if (beforeCandidates.length > 0) {
      return beforeCandidates[beforeCandidates.length - 1]
    }

    const fallbackSibling = parentVersion.childBranchIds.find(
      (id: string) => id !== branch.branchId
    )
    return fallbackSibling ?? null
  }

  // 根分支，选择其它根分支作为焦点
  const rootIndex = tree.rootBranchIds.indexOf(branch.branchId)
  const afterRootCandidates = tree.rootBranchIds
    .slice(rootIndex + 1)
    .filter((id: string) => id !== branch.branchId && tree.branches.has(id))
  if (afterRootCandidates.length > 0) {
    return afterRootCandidates[0]
  }

  const beforeRootCandidates = tree.rootBranchIds
    .slice(0, rootIndex)
    .filter((id: string) => id !== branch.branchId && tree.branches.has(id))
  if (beforeRootCandidates.length > 0) {
    return beforeRootCandidates[beforeRootCandidates.length - 1]
  }

  const fallbackRoot = tree.rootBranchIds.find(
    (id: string) => id !== branch.branchId && tree.branches.has(id)
  )
  return fallbackRoot ?? null
}

function normalizeCurrentPath(tree: ConversationTree, preferredBranchId?: string | null): void {
  let normalizedPath: string[] = []

  if (preferredBranchId) {
    const preferredPath = getPathToBranch(tree, preferredBranchId)
    if (preferredPath.length > 0) {
      normalizedPath = preferredPath
    }
  }

  if (normalizedPath.length === 0) {
    const reconstructedPath: string[] = []
    let prevBranchId: string | null = null
    let prevVersionId: string | null = null

    for (const branchId of tree.currentPath) {
      const currentBranch = tree.branches.get(branchId)
      if (!currentBranch) {
        break
      }

      if (
        prevBranchId !== null &&
        (currentBranch.parentBranchId !== prevBranchId || currentBranch.parentVersionId !== prevVersionId)
      ) {
        break
      }

      reconstructedPath.push(branchId)
      const currentVersion = getCurrentVersion(currentBranch)
      if (!currentVersion) {
        prevBranchId = null
        prevVersionId = null
        break
      }

      prevBranchId = currentBranch.branchId
      prevVersionId = currentVersion.id
    }

    normalizedPath = reconstructedPath
  }

  if (normalizedPath.length === 0) {
    const firstRootId = tree.rootBranchIds.find((id: string) => tree.branches.has(id))
    if (!firstRootId) {
      tree.currentPath = []
      return
    }

    normalizedPath = [firstRootId]
  }

  let lastBranchId = normalizedPath[normalizedPath.length - 1]
  const visited = new Set<string>(normalizedPath)

  while (lastBranchId) {
    const lastBranch = tree.branches.get(lastBranchId)
    if (!lastBranch) {
      break
    }

    const lastVersion = getCurrentVersion(lastBranch)
    if (!lastVersion || !Array.isArray(lastVersion.childBranchIds) || lastVersion.childBranchIds.length === 0) {
      break
    }

    const validChildren = lastVersion.childBranchIds.filter((childId: string) => {
      if (visited.has(childId)) {
        return false
      }
      const childBranch = tree.branches.get(childId)
      if (!childBranch) {
        return false
      }
      return (
        childBranch.parentBranchId === lastBranchId &&
        childBranch.parentVersionId === lastVersion.id
      )
    })

    if (validChildren.length === 0) {
      break
    }

    const nextChildId = validChildren[0]
    normalizedPath = [...normalizedPath, nextChildId]
    visited.add(nextChildId)
    lastBranchId = nextChildId
  }

  tree.currentPath = normalizedPath
}

/**
 * 递归删除分支及其所有子分支
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 */
function deleteBranchRecursively(tree: ConversationTree, branchId: string): void {
  const branch = tree.branches.get(branchId)
  if (!branch) return
  
  // 递归删除所有版本的所有子分支
  for (const version of branch.versions) {
    for (const childId of version.childBranchIds) {
      deleteBranchRecursively(tree, childId)
    }
  }
  
  // 从父版本的 childBranchIds 中移除引用
  if (branch.parentBranchId && branch.parentVersionId) {
    const parentBranch = tree.branches.get(branch.parentBranchId)
    if (parentBranch) {
      const parentVersion = parentBranch.versions.find((v: MessageVersion) => v.id === branch.parentVersionId)
      if (parentVersion) {
        // 不可变更新
        const newChildIds = parentVersion.childBranchIds.filter((id: string) => id !== branchId)
        const newParentVersion: MessageVersion = {
          ...parentVersion,
          childBranchIds: newChildIds
        }
        
        const versionIndex = parentBranch.versions.findIndex((v: MessageVersion) => v.id === branch.parentVersionId)
        const newVersions = parentBranch.versions.slice()
        newVersions.splice(versionIndex, 1, newParentVersion)
        
        const newParentBranch: MessageBranch = {
          ...parentBranch,
          versions: newVersions
        }
        
        setBranch(tree, newParentBranch)
      }
    }
  } else {
    // 从根分支列表中移除
    tree.rootBranchIds = tree.rootBranchIds.filter((id: string) => id !== branchId)
  }
  
  // 删除分支本身
  tree.branches.delete(branchId)
  
  // 更新当前路径
  const pathIndex = tree.currentPath.indexOf(branchId)
  if (pathIndex !== -1) {
    tree.currentPath = tree.currentPath.slice(0, pathIndex)
  }
}

/**
 * 追加文本到分支的当前版本（流式生成）
 * 
 * 【关键】采用不可变更新策略，确保 Vue 响应式
 * - 不直接修改 part.text
 * - 重建整个 parts 数组和 version 对象
 * - 强制触发 Vue 的响应式更新
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 * @param token - 要追加的文本
 * @returns 是否成功
 */
export function appendTokenToBranch(
  tree: ConversationTree,
  branchId: string,
  token: string
): boolean {
  const branch = tree.branches.get(branchId)
  if (!branch) return false
  
  const currentIndex = branch.currentVersionIndex
  const currentVersion = branch.versions[currentIndex]
  if (!currentVersion) return false
  
  // 查找 text part，采用不可变更新
  const textPartIndex = currentVersion.parts.findIndex((p: MessagePart) => p.type === 'text')
  
  let newParts: MessagePart[]
  
  if (textPartIndex === -1) {
    // 没有 text part，创建新的
    newParts = [...currentVersion.parts, { type: 'text', text: token }]
  } else {
    // 更新现有 text part（不可变方式）
    const oldTextPart = currentVersion.parts[textPartIndex]
    const updatedTextPart = {
      ...oldTextPart,
      text: (oldTextPart as any).text + token
    }
    
    // 重建 parts 数组
    newParts = currentVersion.parts.slice()
    newParts.splice(textPartIndex, 1, updatedTextPart)
  }
  
  // 重建 version 对象
  const newVersion: MessageVersion = {
    ...currentVersion,
    parts: newParts
  }
  
  // 重建 versions 数组
  const newVersions = branch.versions.slice()
  newVersions.splice(currentIndex, 1, newVersion)
  
  // 重建 branch 对象并更新
  const newBranch: MessageBranch = {
    ...branch,
    versions: newVersions
  }
  
  setBranch(tree, newBranch)
  
  return true
}

/**
 * 追加图片到分支的当前版本
 * 
 * 【关键】与文本流式采用相同的不可变更新策略
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 * @param imageUrl - 图片URL（base64 data URI）
 * @returns 是否成功
 */
export function appendImageToBranch(
  tree: ConversationTree,
  branchId: string,
  imageUrl: string
): boolean {
  const branch = tree.branches.get(branchId)
  if (!branch) {
    console.error('❌ appendImageToBranch: 找不到分支', branchId)
    return false
  }
  
  const currentIndex = branch.currentVersionIndex
  const currentVersion = branch.versions[currentIndex]
  if (!currentVersion) {
    console.error('❌ appendImageToBranch: 找不到版本')
    return false
  }
  
  // 创建图片 part，附加唯一 id 以便 Vue 能稳定追踪（避免 v-for 使用索引带来的渲染问题）
  const imagePart: ImagePart = {
    id: uuidv4(),
    type: 'image_url',
    image_url: {
      url: imageUrl
    }
  }
  
  // 不可变更新：重建整个对象链
  const newParts = [...currentVersion.parts, imagePart]
  
  const newVersion: MessageVersion = {
    ...currentVersion,
    parts: newParts
  }
  
  const newVersions = branch.versions.slice()
  newVersions.splice(currentIndex, 1, newVersion)
  
  const newBranch: MessageBranch = {
    ...branch,
    versions: newVersions
  }
  
  setBranch(tree, newBranch)
  
  return true
}

/**
 * 更新分支当前版本的内容
 * 
 * @param tree - 对话树
 * @param branchId - 分支ID
 * @param parts - 新内容
 * @returns 是否成功
 */
export interface UpdateBranchContentOptions {
  metadata?: MessageVersionMetadata | null;
}

export function updateBranchContent(
  tree: ConversationTree,
  branchId: string,
  parts: MessagePart[],
  options: UpdateBranchContentOptions = {}
): boolean {
  const branch = tree.branches.get(branchId)
  if (!branch) return false
  
  const version = getCurrentVersion(branch)
  if (!version) return false
  
  let newMetadata = version.metadata
  if (options.metadata !== undefined) {
    newMetadata = options.metadata === null ? undefined : { ...options.metadata }
  }

  // 不可变更新
  const newVersion: MessageVersion = {
    ...version,
    parts: [...parts],
    metadata: newMetadata
  }
  
  const newVersions = branch.versions.slice()
  newVersions.splice(branch.currentVersionIndex, 1, newVersion)
  
  const newBranch: MessageBranch = {
    ...branch,
    versions: newVersions
  }
  
  setBranch(tree, newBranch)
  
  return true
}

/**
 * 迁移旧的消息数组格式到树形结构
 * 
 * @param oldMessages - 旧的消息数组
 * @returns 转换后的树形结构
 */
export function migrateMessagesToTree(oldMessages: any[]): ConversationTree {
  const tree = createEmptyTree()
  
  if (!oldMessages || oldMessages.length === 0) {
    return tree
  }
  
  let previousBranchId: string | null = null
  let previousVersionId: string | null = null
  
  for (const oldMsg of oldMessages) {
    const versionId = uuidv4()
    const version: MessageVersion = {
      id: versionId,
      parts: oldMsg.parts || [{ type: 'text' as const, text: oldMsg.text || '' }],
      timestamp: oldMsg.timestamp || Date.now(),
      childBranchIds: [] // 初始化空的子分支列表
    }
    
    const branchId = uuidv4()
    const branch: MessageBranch = {
      branchId,
      role: oldMsg.role === 'model' ? 'model' : 'user',
      parentBranchId: previousBranchId,
      parentVersionId: previousVersionId, // 记录源自父分支的哪个版本
      versions: [version],
      currentVersionIndex: 0,
    }
    
    setBranch(tree, branch)
    tree.currentPath.push(branchId)
    
    // 更新父版本的 childBranchIds
    if (previousBranchId && previousVersionId) {
      const parentBranch = tree.branches.get(previousBranchId)
      if (parentBranch) {
        const parentVersion = parentBranch.versions.find((v: MessageVersion) => v.id === previousVersionId)
        if (parentVersion) {
          parentVersion.childBranchIds = [...parentVersion.childBranchIds, branchId]
        }
      }
    } else {
      tree.rootBranchIds.push(branchId)
    }
    
    previousBranchId = branchId
    previousVersionId = versionId
  }
  
  return tree
}

/**
 * 获取从根到指定分支的路径
 * 
 * @param tree - 对话树
 * @param targetBranchId - 目标分支ID
 * @returns 分支ID数组
 */
export function getPathToBranch(tree: ConversationTree, targetBranchId: string): string[] {
  const path: string[] = []
  let currentBranchId: string | null = targetBranchId
  
  while (currentBranchId) {
    path.unshift(currentBranchId)
    const branch: MessageBranch | undefined = tree.branches.get(currentBranchId)
    if (!branch) break
    currentBranchId = branch.parentBranchId
  }
  
  return path
}

/**
 * 从持久化存储恢复对话树（处理 Map 响应式）
 * 
 * 【关键】确保 Map 使用 reactive 包装，处理不同序列化格式
 * - Map 类型：直接用 reactive 包装
 * - 数组类型：从数组恢复 Map（JSON 序列化格式）
 * - 对象类型：从对象恢复 Map（旧格式兼容）
 * 
 * @param raw - 从存储中读取的原始对话树数据
 * @returns 响应式的对话树
 */
export function restoreTree(raw: any): ConversationTree {
  let branchesMap: Map<string, MessageBranch>
  
  if (!raw?.branches) {
    // 没有 branches，返回空树
    return createEmptyTree()
  }
  
  if (raw.branches instanceof Map) {
    // 已经是 Map，直接使用
    branchesMap = raw.branches
  } else if (Array.isArray(raw.branches)) {
    // 从数组恢复 Map（JSON 序列化后的格式）
    branchesMap = new Map(raw.branches)
  } else if (typeof raw.branches === 'object') {
    // 从对象恢复 Map（Object.entries 兼容）
    branchesMap = new Map(Object.entries(raw.branches))
  } else {
    // 无法识别的格式，返回空树
    console.warn('⚠️ restoreTree: 无法识别的 branches 格式', typeof raw.branches)
    return createEmptyTree()
  }
  
  return {
    branches: reactive(branchesMap), // 关键：用 reactive 包装 Map
    rootBranchIds: raw.rootBranchIds ?? [],
    currentPath: raw.currentPath ?? []
  }
}

/**
 * 序列化对话树用于持久化存储
 * 
 * 将 Map 转换为数组格式，以便 JSON 序列化
 * 
 * @param tree - 对话树
 * @returns 可序列化的对话树数据
 */
export function serializeTree(tree: ConversationTree): any {
  // 处理 reactive 包装的 Map
  let branchesArray: any[]
  const branches: any = tree.branches
  
  if (branches instanceof Map) {
    branchesArray = Array.from(branches.entries())
  } else if (branches && typeof branches.entries === 'function') {
    // reactive 包装后的 Map 仍有 entries 方法
    branchesArray = Array.from(branches.entries())
  } else if (Array.isArray(branches)) {
    // 已经是数组
    branchesArray = branches
  } else {
    console.warn('⚠️ serializeTree: 无法识别的 branches 类型', typeof branches)
    branchesArray = []
  }
  
  return {
    branches: branchesArray,
    rootBranchIds: tree.rootBranchIds,
    currentPath: tree.currentPath
  }
}

