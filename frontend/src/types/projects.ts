export type Genre =
  | 'fantasy' | 'sci_fi' | 'romance' | 'mystery'
  | 'thriller' | 'historical' | 'contemporary' | 'other'

export type WritingStyle = 'literary' | 'commercial' | 'experimental' | 'classic'

export const GENRE_LABELS: Record<Genre, string> = {
  fantasy: '奇幻',
  sci_fi: '科幻',
  romance: '言情',
  mystery: '悬疑',
  thriller: '惊悚',
  historical: '历史',
  contemporary: '现代',
  other: '其他',
}

export const STYLE_LABELS: Record<WritingStyle, string> = {
  literary: '文学',
  commercial: '商业',
  experimental: '实验',
  classic: '古典',
}

export interface Project {
  id: string
  name: string
  description: string
  genre: Genre
  style: WritingStyle
  language: string
  created_at: string
  updated_at: string
  word_count: number
  chapter_count: number
}

export interface ProjectCreate {
  name: string
  description: string
  genre: Genre
  style: WritingStyle
  language: string
}
