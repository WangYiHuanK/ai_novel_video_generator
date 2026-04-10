import { create } from 'zustand'
import type { ChatMessage } from '../types/chat'

interface ChatStore {
  messages: ChatMessage[]
  streaming: boolean
  streamingText: string
  setMessages: (msgs: ChatMessage[]) => void
  addMessage: (msg: ChatMessage) => void
  setStreaming: (v: boolean) => void
  appendStreamingText: (delta: string) => void
  commitStreamingMessage: (id: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  streaming: false,
  streamingText: '',

  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ streaming, streamingText: streaming ? '' : '' }),
  appendStreamingText: (delta) => set(s => ({ streamingText: s.streamingText + delta })),

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
    })),

  clearMessages: () => set({ messages: [], streaming: false, streamingText: '' }),
}))
