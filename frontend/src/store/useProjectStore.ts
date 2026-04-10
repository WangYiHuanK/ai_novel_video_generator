import { create } from 'zustand'
import { projectsApi } from '../api/projectsApi'
import type { Project, ProjectCreate } from '../types/projects'

interface ProjectStore {
  projects: Project[]
  current: Project | null
  loading: boolean
  fetch: () => Promise<void>
  create: (data: ProjectCreate) => Promise<Project>
  setCurrent: (project: Project) => void
  remove: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  current: null,
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const projects = await projectsApi.list()
    set({ projects, loading: false })
  },

  create: async (data) => {
    const project = await projectsApi.create(data)
    set(s => ({ projects: [project, ...s.projects] }))
    return project
  },

  setCurrent: (project) => set({ current: project }),

  remove: async (id) => {
    await projectsApi.delete(id)
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      current: s.current?.id === id ? null : s.current,
    }))
  },
}))
