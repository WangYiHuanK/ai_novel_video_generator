/**
 * Batch generate all chapters with progress display.
 * State lives in useBatchStore so navigation doesn't interrupt generation.
 */
import { useEffect } from 'react'
import { Zap, Square, CheckCircle, XCircle, Loader2, Play } from 'lucide-react'
import { clsx } from 'clsx'
import { useBatchStore } from '../../store/useBatchStore'

interface BatchGeneratePanelProps {
  projectId: string
  totalChapters: number
  onChapterDone?: () => void
}

export function BatchGeneratePanel({ projectId, totalChapters, onChapterDone }: BatchGeneratePanelProps) {
  const { running, log, chapterStatuses, doneCount, start, stop } = useBatchStore()

  useEffect(() => {
    useBatchStore.getState().setOnChapterDone(onChapterDone ?? null)
    return () => useBatchStore.getState().setOnChapterDone(null)
  }, [onChapterDone])

  function handleStart() {
    if (totalChapters === 0) return
    start(projectId, totalChapters, 0)
  }

  function handleResume() {
    const skip = useBatchStore.getState().doneCount
    start(projectId, totalChapters, skip)
  }

  const canResume = !running && doneCount > 0 && doneCount < totalChapters

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {running ? (
            <button onClick={stop} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700">
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
