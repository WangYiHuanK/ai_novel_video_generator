import client from './client'
import type { ChapterContent, ChapterCreate, ChapterRead, ExportFormat, NarrativeState, OutlineVersion } from '../types/novel'
import { projectsApi } from './projectsApi'

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
  exportNovel: async (projectId: string, format: ExportFormat = 'md') => {
    const project = await projectsApi.get(projectId)
    const filename = `${project.name}.${format}`
    const res = await client.get(`/novel/${projectId}/export?format=${format}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  getOutline: (projectId: string) =>
    client.get<{ content: string }>(`/novel/${projectId}/outline`).then(r => r.data.content),
  saveOutline: (projectId: string, content: string) =>
    client.put(`/novel/${projectId}/outline`, { content }),
  summarizeChapter: (projectId: string, chapterId: string) =>
    client.post<NarrativeState>(`/novel/${projectId}/chapters/${chapterId}/summarize`).then(r => r.data),
  getNarrativeContext: (projectId: string, chapterId: string) =>
    client.get<{ context: string }>(`/novel/${projectId}/chapters/${chapterId}/narrative-context`).then(r => r.data.context),
  listOutlineVersions: (projectId: string) =>
    client.get<OutlineVersion[]>(`/novel/${projectId}/outline/versions`).then(r => r.data),
  saveOutlineVersion: (projectId: string, content: string, source: 'auto' | 'manual' = 'auto') =>
    client.post<OutlineVersion>(`/novel/${projectId}/outline/versions`, { content, source }).then(r => r.data),
  deleteOutlineVersion: (projectId: string, versionId: string) =>
    client.delete(`/novel/${projectId}/outline/versions/${versionId}`),
}
