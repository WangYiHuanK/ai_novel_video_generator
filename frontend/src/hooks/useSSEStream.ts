import { useRef, useState } from 'react'
import type { StreamEvent } from '../types/chat'

const MAX_RETRIES = 0
const RETRY_DELAY_MS = 1500

export function useSSEStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function sendStream(
    url: string,
    body: object,
    onDelta: (token: string) => void,
    onDone: (messageId: string) => void,
    onError: (err: string) => void,
    onThinking?: (token: string) => void,
    onToolUse?: (toolName: string) => void,
    onToolResult?: (result: string) => void,
  ) {
    abortRef.current = new AbortController()
    setIsStreaming(true)

    // Timeout for the initial connection (model hasn't started responding yet)
    const connectTimeoutId = setTimeout(() => abortRef.current?.abort(), 120000)

    let attempt = 0

    while (attempt <= MAX_RETRIES) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          const msg = `HTTP error ${res.status}`
          if (attempt < MAX_RETRIES) {
            attempt++
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
            continue
          }
          onError(msg)
          setIsStreaming(false)
          return
        }

        const reader = res.body.getReader()
        clearTimeout(connectTimeoutId) // first byte received, cancel connect timeout
        const decoder = new TextDecoder()
        let buffer = ''
        let receivedDone = false
        let lastChunkTime = Date.now()
        const TIMEOUT_MS = 120000

        // Timeout watchdog: if no data for 30s, treat as interrupted
        const timeoutId = setInterval(() => {
          if (Date.now() - lastChunkTime > TIMEOUT_MS) {
            clearInterval(timeoutId)
            reader.cancel()
          }
        }, 2000)

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            lastChunkTime = Date.now()
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''

            for (const part of parts) {
              const line = part.trim()
              if (!line.startsWith('data:')) continue
              try {
                const event: StreamEvent = JSON.parse(line.slice(5).trim())
                if (event.event === 'thinking') onThinking?.(event.data)
                else if (event.event === 'tool_use') onToolUse?.(event.data)
                else if (event.event === 'tool_result') onToolResult?.(event.data)
                else if (event.event === 'delta') onDelta(event.data)
                else if (event.event === 'done') {
                  receivedDone = true
                  onDone(event.message_id ?? '')
                  setIsStreaming(false)
                } else if (event.event === 'error') {
                  receivedDone = true
                  onError(event.data)
                  setIsStreaming(false)
                }
              } catch {
                // ignore malformed lines
              }
            }
          }
        } finally {
          clearInterval(timeoutId)
        }

        // Stream ended without a done/error event — treat as interrupted
        if (!receivedDone) {
          if (attempt < MAX_RETRIES) {
            attempt++
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
            continue
          }
          onDone('')
          setIsStreaming(false)
        }
        return

      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          clearTimeout(connectTimeoutId)
          setIsStreaming(false)
          return
        }
        if (attempt < MAX_RETRIES) {
          attempt++
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
          continue
        }
        onError(`连接失败：${(err as Error).message ?? String(err)}`)
        setIsStreaming(false)
        return
      }
    }
  }

  function stop() {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  return { sendStream, stop, isStreaming }
}
