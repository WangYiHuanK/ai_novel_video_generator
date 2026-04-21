export interface NarrativeState {
  stats: string
  abilities: string
  items: string
  relations: string
  other: string
}

export interface ChapterRead {
  id: string
  title: string
  order: number
  word_count: number
  updated_at: string
  summary?: string
  narrative_state?: NarrativeState | null
}

export interface ChapterContent extends ChapterRead {
  content: string
}

export interface ChapterCreate {
  title: string
  order: number
  content?: string
  summary?: string
}

export type ExportFormat = 'md' | 'txt'

export interface OutlineVersion {
  id: string
  project_id: string
  content: string
  source: 'auto' | 'manual'
  created_at: string
}
