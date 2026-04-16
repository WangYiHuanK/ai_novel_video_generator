/**
 * Batch generate all chapters with progress display
 */
import { useRef, useState } from 'react'
import { Zap, Square, CheckCircle, XCircle, Loader2, Play } from 'lucide-react'
import { aiGenerateApi, type BatchEvent } from '../../api/aiGenerateApi'
import { clsx } from 'clsx'

interface BatchGeneratePanelProps {
  projectId: string
  totalChapters: number
  onChapterDone?: () => void
}

interface ChapterStatus {
  id: string
  title: string
  status: 'pending' | 'generating' | 'continuing' | 'done' | 'error'
  words?: number
  message?: string
}

export function BatchGeneratePanel({ projectId, totalChapters, onChapterDone }: BatchGeneratePanelProps) {
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string>('')
  const [chapterStatuses, setChapterStatuses] = useState<ChapterStatus[]>([])
  const [doneCount, setDoneCount] = useState(0)
  const stopRef = useRef<(() => void) | null>(null)
  // Track how many chapters were done when stopped, to support resume
  const doneCountRef = useRef(0)

  function updateChapter(id: string, update: Partial<ChapterStatus>) {
    setChapterStatuses(prev => {
      const idx = prev.findIndex(c => c.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...update }
      return next
    })
  }

  function startFrom(skipDone: number) {
    setRunning(true)
    setLog('')

    const stop = aiGenerateApi.batchGenerate(
      projectId,
      { min_words: 3000, skip_done: skipDone },
      (event: BatchEvent) => {
        setLog(event.message)

        if (event.event === 'chapter_start' && event.chapter_id) {
          setChapterStatuses(prev => {
            const exists = prev.find(c => c.id === event.chapter_id)
            if (exists) return prev.map(c => c.id === event.chapter_id ? { ...c, status: 'generating', message: event.message } : c)
            return [...prev, { id: event.chapter_id!, title: event.title || '', status: 'generating', message: event.message }]
          })
        } else if (event.event === 'chapter_progress' && event.chapter_id) {
          updateChapter(event.chapter_id, { words: event.words, message: event.message })
        } else if (event.event === 'chapter_continue' && event.chapter_id) {
          updateChapter(event.chapter_id, { status: 'continuing', words: event.words, message: event.message })
        } else if (event.event === 'chapter_done' && event.chapter_id) {
          updateChapter(event.chapter_id, { status: 'done', words: event.words, message: event.message })
          setDoneCount(n => { doneCountRef.current = n + 1; return n + 1 })
          onChapterDone?.()
        } else if (event.event === 'chapter_error' && event.chapter_id) {
          updateChapter(event.chapter_id, { status: 'error', message: event.message })
        }
      },
      () => { setRunning(false); stopRef.current = null },
      (err) => { setLog(`错误: ${err.message}`); setRunning(false) }
    )

    stopRef.current = stop
  }

  function handleStart() {
    if (totalChapters === 0) return
    doneCountRef.current = 0
    setDoneCount(0)
    setChapterStatuses([])
    startFrom(0)
  }

  function handleResume() {
    startFrom(doneCountRef.current)
  }

  function handleStop() {
    stopRef.current?.()
    stopRef.current = null
    setRunning(false)
    setLog('已暂停，可点击继续')
  }

  const canResume = !running && doneCountRef.current > 0 && doneCountRef.current < totalChapters

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {running ? (
            <button onClick={handleStop} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700">
              <Square size={13} fill="currentColor" /> 暂停
            </button>
          ) : (
            <>
              <button
                onClick={handleStart}
                disabled={totalChapters === 0}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
                  totalChapters === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                )}
              >
                <Zap size={13} /> 批量 AI 写作
              </button>
              {canResume && (
                <button
                  onClick={handleResume}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Play size={13} /> 继续 ({doneCount}/{totalChapters})
                </button>
              )}
            </>
          )}
          <span className="text-xs text-gray-500">
            {running ? `${doneCount}/${totalChapters} 章` : `共 ${totalChapters} 章，每章至少 3000 字`}
          </span>
        </div>

        {log && (
          <span className={clsx(
            'text-xs px-2 py-1 rounded flex items-center gap-1',
            running ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'
          )}>
            {running && <Loader2 size={11} className="animate-spin" />}
            {log}
          </span>
        )}
      </div>

      {chapterStatuses.length > 0 && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {chapterStatuses.map(ch => (
            <div key={ch.id} className="flex items-center gap-2 text-xs">
              {ch.status === 'done' && <CheckCircle size={12} className="text-green-500 shrink-0" />}
              {ch.status === 'error' && <XCircle size={12} className="text-red-500 shrink-0" />}
              {(ch.status === 'generating' || ch.status === 'continuing') && (
                <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />
              )}
              {ch.status === 'pending' && <div className="w-3 h-3 rounded-full border border-gray-300 shrink-0" />}
              <span className={clsx(
                'truncate',
                ch.status === 'done' ? 'text-gray-600' : ch.status === 'error' ? 'text-red-500' : 'text-gray-700'
              )}>
                {ch.title}
              </span>
              {ch.words !== undefined && (
                <span className="text-gray-400 shrink-0">{ch.words.toLocaleString()} 字</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
