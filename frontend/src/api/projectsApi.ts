import client from './client'
import type { Project, ProjectCreate } from '../types/projects'

export const projectsApi = {
  list: () => client.get<Project[]>('/projects/').then(r => r.data),
  create: (data: ProjectCreate) => client.post<Project>('/projects/', data).then(r => r.data),
  get: (id: string) => client.get<Project>(`/projects/${id}`).then(r => r.data),
  update: (id: string, data: ProjectCreate) => client.put<Project>(`/projects/${id}`, data).then(r => r.data),
  delete: (id: string) => client.delete(`/projects/${id}`),
}
