import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2, Download, Check, Loader2 } from 'lucide-react'
import { novelApi } from '../../api/novelApi'
import { useNovelStore } from '../../store/useNovelStore'
import { useDebounce } from '../../hooks/useDebounce'
import type { ChapterContent } from '../../types/novel'
import { clsx } from 'clsx'

function ChapterNav({ projectId }: { projectId: string }) {
  const { chapters, activeChapter, setChapters, setActiveChapter } = useNovelStore()

  async function loadChapter(id: string) {
    const ch = await novelApi.getChapter(projectId, id)
    setActiveChapter(ch)
  }

  async function addChapter() {
    const order = chapters.length + 1
    const ch = await novelApi.createChapter(projectId, { title: `第 ${order} 章`, order })
    setChapters([...chapters, ch])
    const full = await novelApi.getChapter(projectId, ch.id)
    setActiveChapter(full)
  }

  async function deleteChapter(id: string) {
    await novelApi.deleteChapter(projectId, id)
    const updated = chapters.filter(c => c.id !== id)
    setChapters(updated)
    if (activeChapter?.id === id) {
      if (updated.length > 0) {
        const full = await novelApi.getChapter(projectId, updated[0].id)
        setActiveChapter(full)
      } else {
        setActiveChapter(null)
      }
    }
  }

  return (
    <div className="w-52 shrink-0 border-r border-gray-800 flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        <span className="text-sm font-medium text-gray-300">章节</span>
        <button onClick={addChapter} className="btn-ghost p-1" title="新增章节">
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chapters.map(ch => (
          <div
            key={ch.id}
            className={clsx(
              'flex items-center gap-1 px-3 py-2 cursor-pointer group transition-colors',
              activeChapter?.id === ch.id
                ? 'bg-brand-600/20 text-white border-l-2 border-brand-500'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
            onClick={() => loadChapter(ch.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{ch.title}</p>
              <p className="text-xs text-gray-500">{ch.word_count.toLocaleString()} 字</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); deleteChapter(ch.id) }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-300 transition-opacity"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {chapters.length === 0 && (
          <p className="text-xs text-gray-500 px-3 py-4">点击 + 新建章节</p>
        )}
      </div>
    </div>
  )
}

function ChapterEditor({ projectId, chapter }: { projectId: string; chapter: ChapterContent }) {
  const { updateActiveContent, setSaveStatus, saveStatus } = useNovelStore()
  const [title, setTitle] = useState(chapter.title)
  const [content, setContent] = useState(chapter.content)

  useEffect(() => { setTitle(chapter.title); setContent(chapter.content) }, [chapter.id])

  useDebounce(content, 800, async (val) => {
    setSaveStatus('saving')
    try {
      await novelApi.saveChapter(projectId, chapter.id, title, val)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
    }
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-800">
        <input
          className="flex-1 bg-transparent text-lg font-semibold text-white focus:outline-none placeholder-gray-600"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => novelApi.saveChapter(projectId, chapter.id, title, content)}
          placeholder="章节标题"
        />
        <div className="text-xs text-gray-500 shrink-0">
          {content.length.toLocaleString()} 字符
        </div>
        {saveStatus === 'saving' && <Loader2 size={13} className="text-gray-400 animate-spin" />}
        {saveStatus === 'saved' && <Check size={13} className="text-green-400" />}
      </div>
      <textarea
        className="flex-1 bg-transparent text-sm text-gray-200 p-6 resize-none focus:outline-none leading-relaxed placeholder-gray-600"
        value={content}
        onChange={e => { setContent(e.target.value); updateActiveContent(e.target.value) }}
        placeholder="开始写作..."
      />
    </div>
  )
}

export function NovelEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { chapters, activeChapter, setChapters, setActiveChapter } = useNovelStore()

  useEffect(() => {
    if (!projectId) return
    novelApi.listChapters(projectId).then(async (chs) => {
      setChapters(chs)
      if (chs.length > 0) {
        const full = await novelApi.getChapter(projectId, chs[0].id)
        setActiveChapter(full)
      }
    })
  }, [projectId])

  return (
    <div className="flex h-full">
      <ChapterNav projectId={projectId!} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Export toolbar */}
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-800 gap-1">
          <button onClick={() => novelApi.exportNovel(projectId!, 'md')} className="btn-ghost text-xs">
            <Download size={13} /> 导出 .md
          </button>
          <button onClick={() => novelApi.exportNovel(projectId!, 'txt')} className="btn-ghost text-xs">
            <Download size={13} /> 导出 .txt
          </button>
        </div>

        {activeChapter ? (
          <ChapterEditor projectId={projectId!} chapter={activeChapter} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-sm">没有章节</p>
              <p className="text-xs mt-1">在左侧点击 + 创建第一章</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
