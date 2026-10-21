export const PROJECT_DUPLICATE_POLICY_KEY = 'projectDuplicatePolicy'
export type ProjectDuplicatePolicy = 'allow' | 'deny' | 'ask'

export function isProjectDuplicatePolicy(value: unknown): value is ProjectDuplicatePolicy {
  return value === 'allow' || value === 'deny' || value === 'ask'
}

export function normalizeProjectDuplicatePolicy(value: unknown): ProjectDuplicatePolicy {
  return isProjectDuplicatePolicy(value) ? value : 'ask'
}

export type ProjectNameMutationResult = Readonly<{ status: 'saved'; projectId: string }>
  | Readonly<{ status: 'duplicate'; policy: 'deny' | 'ask' }>
