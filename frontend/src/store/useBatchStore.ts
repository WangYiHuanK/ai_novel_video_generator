import { create } from 'zustand'
import { aiGenerateApi, type BatchEvent } from '../api/aiGenerateApi'

export interface ChapterStatus {
  id: string
  title: string
  status: 'pending' | 'generating' | 'continuing' | 'done' | 'error'
  words?: number
  message?: string
}

interface BatchStore {
  running: boolean
  log: string
  chapterStatuses: ChapterStatus[]
  doneCount: number
  totalChapters: number

  start: (projectId: string, totalChapters: number, skipDone?: number) => void
  stop: () => void
  reset: () => void
  _stopFn: (() => void) | null
  _onChapterDone: (() => void) | null
  setOnChapterDone: (fn: (() => void) | null) => void
}

export const useBatchStore = create<BatchStore>((set, get) => ({
  running: false,
  log: '',
  chapterStatuses: [],
  doneCount: 0,
  totalChapters: 0,
  _stopFn: null,
  _onChapterDone: null,

  setOnChapterDone: (fn) => set({ _onChapterDone: fn }),

  start: (projectId, totalChapters, skipDone = 0) => {
    const prev = get()._stopFn
    if (prev) prev()

    set({
      running: true,
      log: '',
      totalChapters,
      ...(skipDone === 0 ? { chapterStatuses: [], doneCount: 0 } : {}),
    })

    function updateChapter(id: string, update: Partial<ChapterStatus>) {
      set(s => {
        const idx = s.chapterStatuses.findIndex(c => c.id === id)
        if (idx === -1) return s
        const next = [...s.chapterStatuses]
        next[idx] = { ...next[idx], ...update }
        return { chapterStatuses: next }
      })
    }

    const stop = aiGenerateApi.batchGenerate(
      projectId,
      { min_words: 3000, skip_done: skipDone },
      (event: BatchEvent) => {
        set({ log: event.message })

        if (event.event === 'chapter_start' && event.chapter_id) {
          set(s => {
            const exists = s.chapterStatuses.find(c => c.id === event.chapter_id)
            if (exists) {
              return { chapterStatuses: s.chapterStatuses.map(c => c.id === event.chapter_id ? { ...c, status: 'generating' as const, message: event.message } : c) }
            }
            return { chapterStatuses: [...s.chapterStatuses, { id: event.chapter_id!, title: event.title || '', status: 'generating' as const, message: event.message }] }
          })
        } else if (event.event === 'chapter_progress' && event.chapter_id) {
          updateChapter(event.chapter_id, { words: event.words, message: event.message })
        } else if (event.event === 'chapter_continue' && event.chapter_id) {
          updateChapter(event.chapter_id, { status: 'continuing', words: event.words, message: event.message })
        } else if (event.event === 'chapter_done' && event.chapter_id) {
          updateChapter(event.chapter_id, { status: 'done', words: event.words, message: event.message })
          set(s => ({ doneCount: s.doneCount + 1 }))
          get()._onChapterDone?.()
        } else if (event.event === 'chapter_error' && event.chapter_id) {
          updateChapter(event.chapter_id, { status: 'error', message: event.message })
        }
      },
      () => set({ running: false, _stopFn: null }),
      (err) => set({ log: `错误: ${err.message}`, running: false, _stopFn: null }),
    )

    set({ _stopFn: stop })
  },

  stop: () => {
    const fn = get()._stopFn
    if (fn) fn()
    set({ running: false, _stopFn: null, log: '已暂停，可点击继续' })
  },

  reset: () => set({
    running: false,
    log: '',
    chapterStatuses: [],
    doneCount: 0,
    totalChapters: 0,
    _stopFn: null,
  }),
}))
