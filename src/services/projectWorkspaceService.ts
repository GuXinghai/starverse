import {
  sqliteProjectPersistence,
  createDefaultProjectMeta,
  normalizeProjectMeta,
  normalizeProjectOverview,
  type ProjectHomepageConfig,
  type ProjectOverview,
  type ProjectSnapshot,
  normalizePromptTemplates,
  type ProjectPromptTemplate,
  normalizeProjectHomepage
} from './projectPersistence'

export type ProjectWorkspaceSummary = {
  id: string
  name: string
  overview: ProjectOverview
  homepage: ProjectHomepageConfig
  promptTemplates: ProjectPromptTemplate[]
  createdAt: number
  updatedAt: number
}

const cloneOverview = (overview: ProjectOverview): ProjectOverview => ({
  goal: overview.goal,
  status: overview.status,
  tags: [...overview.tags]
})

const cloneHomepage = (homepage: ProjectHomepageConfig): ProjectHomepageConfig => ({
  quickStartPromptIds: [...homepage.quickStartPromptIds]
})

const mapSnapshotToWorkspace = (snapshot: ProjectSnapshot): ProjectWorkspaceSummary => {
  const meta = snapshot.meta ? normalizeProjectMeta(snapshot.meta) : createDefaultProjectMeta()
  return {
    id: snapshot.id,
    name: snapshot.name,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    overview: cloneOverview(meta.overview),
    homepage: cloneHomepage(meta.homepage),
    promptTemplates: normalizePromptTemplates(meta.promptTemplates)
  }
}

export class ProjectWorkspaceService {
  async getWorkspace(projectId: string): Promise<ProjectWorkspaceSummary | null> {
    const snapshot = await sqliteProjectPersistence.findById(projectId)
    if (!snapshot) {
      return null
    }
    return mapSnapshotToWorkspace(snapshot)
  }

  async updateProjectOverview(
    projectId: string,
    patch: Partial<ProjectOverview>
  ): Promise<ProjectWorkspaceSummary | null> {
    const snapshot = await sqliteProjectPersistence.findById(projectId)
    if (!snapshot) {
      return null
    }

    const meta = snapshot.meta
      ? normalizeProjectMeta(snapshot.meta)
      : createDefaultProjectMeta()

    const nextOverview = normalizeProjectOverview({
      goal: patch.goal ?? meta.overview.goal,
      status: patch.status ?? meta.overview.status,
      tags: patch.tags ?? meta.overview.tags
    })

    const updatedSnapshot: ProjectSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      meta: {
        ...meta,
        overview: nextOverview
      }
    }

    await sqliteProjectPersistence.saveProject(updatedSnapshot)
    return mapSnapshotToWorkspace(updatedSnapshot)
  }

  async updatePromptTemplates(
    projectId: string,
    templates: ProjectPromptTemplate[]
  ): Promise<ProjectWorkspaceSummary | null> {
    const snapshot = await sqliteProjectPersistence.findById(projectId)
    if (!snapshot) {
      return null
    }

    const meta = snapshot.meta
      ? normalizeProjectMeta(snapshot.meta)
      : createDefaultProjectMeta()

    const normalizedTemplates = normalizePromptTemplates(templates)

    const updatedSnapshot: ProjectSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      meta: {
        ...meta,
        promptTemplates: normalizedTemplates
      }
    }

    await sqliteProjectPersistence.saveProject(updatedSnapshot)
    return mapSnapshotToWorkspace(updatedSnapshot)
  }

  async updateHomepageConfig(
    projectId: string,
    patch: Partial<ProjectHomepageConfig>
  ): Promise<ProjectWorkspaceSummary | null> {
    const snapshot = await sqliteProjectPersistence.findById(projectId)
    if (!snapshot) {
      return null
    }

    const meta = snapshot.meta
      ? normalizeProjectMeta(snapshot.meta)
      : createDefaultProjectMeta()

    const nextHomepage = normalizeProjectHomepage({
      ...meta.homepage,
      ...patch
    })

    const updatedSnapshot: ProjectSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      meta: {
        ...meta,
        homepage: nextHomepage
      }
    }

    await sqliteProjectPersistence.saveProject(updatedSnapshot)
    return mapSnapshotToWorkspace(updatedSnapshot)
  }
}

export const projectWorkspaceService = new ProjectWorkspaceService()
