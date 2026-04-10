import client from './client'
import type { ChapterContent, ChapterCreate, ChapterRead, ExportFormat } from '../types/novel'

export const novelApi = {
  listChapters: (projectId: string) =>
    client.get<ChapterRead[]>(`/novel/${projectId}/chapters`).then(r => r.data),
  getChapter: (projectId: string, chapterId: string) =>
    client.get<ChapterContent>(`/novel/${projectId}/chapters/${chapterId}`).then(r => r.data),
  createChapter: (projectId: string, data: ChapterCreate) =>
    client.post<ChapterRead>(`/novel/${projectId}/chapters`, data).then(r => r.data),
  saveChapter: (projectId: string, chapterId: string, title: string, content: string) =>
    client.put<ChapterContent>(`/novel/${projectId}/chapters/${chapterId}`, { title, content }).then(r => r.data),
  deleteChapter: (projectId: string, chapterId: string) =>
    client.delete(`/novel/${projectId}/chapters/${chapterId}`),
  exportNovel: (projectId: string, format: ExportFormat = 'md') => {
    window.open(`/api/novel/${projectId}/export?format=${format}`, '_blank')
  },
  getOutline: (projectId: string) =>
    client.get<{ content: string }>(`/novel/${projectId}/outline`).then(r => r.data.content),
  saveOutline: (projectId: string, content: string) =>
    client.put(`/novel/${projectId}/outline`, { content }),
}
