export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  created_at: string
}

export interface SendMessageRequest {
  content: string
  system_prompt?: string
  model_id?: string
  temperature?: number
  max_tokens?: number
}

export interface StreamEvent {
  event: 'delta' | 'done' | 'error'
  data: string
  message_id?: string
}
