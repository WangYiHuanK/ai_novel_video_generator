import { create } from 'zustand'
import type { ChapterContent, ChapterRead } from '../types/novel'

interface NovelStore {
  chapters: ChapterRead[]
  activeChapter: ChapterContent | null
  saveStatus: 'idle' | 'saving' | 'saved'
  setChapters: (chapters: ChapterRead[]) => void
  setActiveChapter: (chapter: ChapterContent | null) => void
  setSaveStatus: (status: 'idle' | 'saving' | 'saved') => void
  updateActiveContent: (content: string) => void
}

export const useNovelStore = create<NovelStore>((set) => ({
  chapters: [],
  activeChapter: null,
  saveStatus: 'idle',

  setChapters: (chapters) => set({ chapters }),
  setActiveChapter: (activeChapter) => set({ activeChapter }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  updateActiveContent: (content) =>
    set(s => s.activeChapter ? { activeChapter: { ...s.activeChapter, content } } : {}),
}))
