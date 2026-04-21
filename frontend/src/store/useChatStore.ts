import { create } from 'zustand'
import type { ChatMessage } from '../types/chat'

interface ChatStore {
  projectId: string | null
  messages: ChatMessage[]
  streaming: boolean
  streamingText: string
  thinkingText: string
  setProjectId: (id: string) => void
  setMessages: (msgs: ChatMessage[]) => void
  addMessage: (msg: ChatMessage) => void
  setStreaming: (v: boolean) => void
  appendStreamingText: (delta: string) => void
  appendThinkingText: (delta: string) => void
  commitStreamingMessage: (id: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  projectId: null,
  messages: [],
  streaming: false,
  streamingText: '',
  thinkingText: '',

  setProjectId: (id) => set(s => {
    // Clear messages when switching to a different project
    if (s.projectId !== id) {
      return { projectId: id, messages: [], streaming: false, streamingText: '', thinkingText: '' }
    }
    return { projectId: id }
  }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ streaming, streamingText: '', thinkingText: '' }),
  appendStreamingText: (delta) => set(s => ({ streamingText: s.streamingText + delta })),
  appendThinkingText: (delta) => set(s => ({ thinkingText: s.thinkingText + delta })),

  commitStreamingMessage: (id) =>
    set(s => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'assistant' as const,
          content: s.streamingText,
          created_at: new Date().toISOString(),
        },
      ],
      streaming: false,
      streamingText: '',
      thinkingText: '',
    })),

  clearMessages: () => set({ messages: [], streaming: false, streamingText: '', thinkingText: '' }),
}))
