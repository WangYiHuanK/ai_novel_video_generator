import client from './client'
import type { ModelConfig, ModelConfigCreate, ModelConfigUpdate, ModelTestResult } from '../types/models'

export const modelsApi = {
  list: () => client.get<ModelConfig[]>('/models/').then(r => r.data),
  create: (data: ModelConfigCreate) => client.post<ModelConfig>('/models/', data).then(r => r.data),
  update: (id: string, data: ModelConfigUpdate) => client.put<ModelConfig>(`/models/${id}`, data).then(r => r.data),
  delete: (id: string) => client.delete(`/models/${id}`),
  test: (id: string) => client.post<ModelTestResult>(`/models/${id}/test`).then(r => r.data),
  setDefault: (id: string) => client.post(`/models/${id}/set-default`),
}
