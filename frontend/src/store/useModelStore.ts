import { create } from 'zustand'
import { modelsApi } from '../api/modelsApi'
import type { ModelConfig } from '../types/models'

interface ModelStore {
  models: ModelConfig[]
  loading: boolean
  fetch: () => Promise<void>
  remove: (id: string) => Promise<void>
  setDefault: (id: string) => Promise<void>
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const models = await modelsApi.list()
    set({ models, loading: false })
  },

  remove: async (id) => {
    await modelsApi.delete(id)
    set(s => ({ models: s.models.filter(m => m.id !== id) }))
  },

  setDefault: async (id) => {
    await modelsApi.setDefault(id)
    await get().fetch()
  },
}))
