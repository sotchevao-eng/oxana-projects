export type ProjectFilterId =
  | 'all'
  | 'sites'
  | 'web-apps'
  | 'business'
  | 'games'
  | 'mobile'
  | 'ai-assistants'
  | 'bot'

export type ProjectSortId = 'newest' | 'oldest' | 'title' | 'featured'

export interface ProjectFilterOption {
  id: ProjectFilterId
  label: string
}

export interface ProjectSortOption {
  id: ProjectSortId
  label: string
}
