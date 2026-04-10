export interface ChapterRead {
  id: string
  title: string
  order: number
  word_count: number
  updated_at: string
}

export interface ChapterContent extends ChapterRead {
  content: string
}

export interface ChapterCreate {
  title: string
  order: number
  content?: string
}

export type ExportFormat = 'md' | 'txt'
