import { useRef, useState } from 'react'
import type { StreamEvent } from '../types/chat'

export function useSSEStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function sendStream(
    url: string,
    body: object,
    onDelta: (token: string) => void,
    onDone: (messageId: string) => void,
    onError: (err: string) => void,
  ) {
    abortRef.current = new AbortController()
    setIsStreaming(true)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        onError(`HTTP error ${res.status}`)
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          try {
            const event: StreamEvent = JSON.parse(line.slice(5).trim())
            if (event.event === 'delta') onDelta(event.data)
            else if (event.event === 'done') {
              onDone(event.message_id ?? '')
              setIsStreaming(false)
            } else if (event.event === 'error') {
              onError(event.data)
              setIsStreaming(false)
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        onError(String(err))
      }
      setIsStreaming(false)
    }
  }

  function stop() {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  return { sendStream, stop, isStreaming }
}
