import client from './client'
import type { ChatMessage } from '../types/chat'

export const chatApi = {
  getHistory: (projectId: string) =>
    client.get<ChatMessage[]>(`/chat/${projectId}/history`).then(r => r.data),
  clearHistory: (projectId: string) =>
    client.delete(`/chat/${projectId}/history`),
  exportDialogue: (projectId: string) => {
    window.open(`/api/chat/${projectId}/export`, '_blank')
  },
}
