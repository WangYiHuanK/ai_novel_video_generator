/**
 * API client for LangChain-powered AI generation
 */

const API_BASE = '/api/ai-generate'

export interface OutlineGenerateRequest {
  user_request: string
  model_id?: string
}

export interface ChapterGenerateRequest {
  chapter_order: number
  chapter_title: string
  chapter_summary?: string
  user_request?: string
  model_id?: string
}

export interface ChapterContinueRequest {
  chapter_id: string
  current_content: string
  user_request?: string
  model_id?: string
}

export interface ChapterExpandRequest {
  chapter_order: number
  section_description: string
  user_request: string
  model_id?: string
}

export interface BatchGenerateRequest {
  min_words?: number
  model_id?: string
  skip_done?: number
}

export type BatchEventType = 'start' | 'chapter_start' | 'chapter_progress' | 'chapter_continue' | 'chapter_done' | 'chapter_error' | 'done' | 'error'

export interface BatchEvent {
  event: BatchEventType
  total?: number
  index?: number
  chapter_id?: string
  title?: string
  words?: number
  message: string
}

export const aiGenerateApi = {
  /**
   * Generate or update outline with AI assistance
   */
  async generateOutline(projectId: string, request: OutlineGenerateRequest) {
    const res = await fetch(`${API_BASE}/${projectId}/outline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || '生成大纲失败')
    }
    return res.json()
  },

  /**
   * Generate a new chapter with full context awareness
   */
  async generateChapter(projectId: string, request: ChapterGenerateRequest) {
    const res = await fetch(`${API_BASE}/${projectId}/chapter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || '生成章节失败')
    }
    return res.json()
  },

  /**
   * Continue writing an existing chapter
   */
  async continueChapter(projectId: string, request: ChapterContinueRequest) {
    const res = await fetch(`${API_BASE}/${projectId}/chapter/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || '续写章节失败')
    }
    return res.json()
  },

  /**
   * Expand a specific section
   */
  async expandSection(projectId: string, request: ChapterExpandRequest) {
    const res = await fetch(`${API_BASE}/${projectId}/chapter/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || '扩写失败')
    }
    return res.json()
  },

  /**
   * Clear outline generation memory
   */
  async clearOutlineMemory(projectId: string) {
    const res = await fetch(`${API_BASE}/${projectId}/memory/outline`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || '清除记忆失败')
    }
    return res.json()
  },

  /**
   * Clear chapter generation memory
   */
  async clearChapterMemory(projectId: string) {
    const res = await fetch(`${API_BASE}/${projectId}/memory/chapter`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || '清除记忆失败')
    }
    return res.json()
  },

  /**
   * Batch generate all chapters with SSE progress
   */
  batchGenerate(
    projectId: string,
    request: BatchGenerateRequest,
    onEvent: (event: BatchEvent) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): () => void {
    const controller = new AbortController()

    fetch(`${API_BASE}/${projectId}/batch-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json()
        onError(new Error(error.detail || '批量生成失败'))
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) { onDone(); break }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as BatchEvent
              onEvent(event)
              if (event.event === 'done' || event.event === 'error') onDone()
            } catch {}
          }
        }
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') onError(err)
    })

    return () => controller.abort()
  },
}
