export type ModelProvider = 'openai' | 'deepseek' | 'claude' | 'zhipu' | 'custom'
export type ModelType = 'text' | 'image' | 'video'

export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider
  model_type: ModelType
  model_name: string
  base_url: string | null
  is_default: boolean
  is_enabled: boolean
  max_tokens: number
  temperature: number
  api_key_masked: string
  created_at: string
  updated_at: string
}

export interface ModelConfigCreate {
  name: string
  provider: ModelProvider
  model_type: ModelType
  model_name: string
  base_url: string | null
  is_default: boolean
  is_enabled: boolean
  max_tokens: number
  temperature: number
  api_key: string
}

export interface ModelConfigUpdate extends Omit<ModelConfigCreate, 'api_key'> {
  api_key?: string
}

export interface ModelTestResult {
  success: boolean
  latency_ms: number | null
  error: string | null
}
