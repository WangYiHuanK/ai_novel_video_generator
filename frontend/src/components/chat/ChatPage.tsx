import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Send, Square, Trash2, Download, ChevronDown, ChevronUp,
  BookOpen, Plus, Save, FileText, Zap, Settings2, RefreshCw, Sparkles, History, X, Check,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatApi } from '../../api/chatApi'
import { novelApi } from '../../api/novelApi'
import { useChatStore } from '../../store/useChatStore'
import { useSSEStream } from '../../hooks/useSSEStream'
import { OUTLINE_BASE, CHAPTER_BASE, DEFAULT_WORLDBUILDING, DEFAULT_CHARACTER } from '../../constants/systemPrompts'
import type { ChapterRead, OutlineVersion } from '../../types/novel'
import { clsx } from 'clsx'

type PromptMode = 'outline' | 'chapter'

// Parse chapter titles from AI-generated outline, normalizing to "第n章：副标题" format
function parseChaptersFromOutline(text: string): Array<{ title: string; summary: string }> {
  const chapters: Array<{ title: string; summary: string }> = []
  const seen = new Set<number>()
  const lines = text.split('\n')
  // Match "第n章" with optional subtitle after ：or :
  const chapterRe = /第([一二三四五六七八九十百千\d]+)章[：:：]?(.*)$/

  const cnMap: Record<string, number> = {
    一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,
    十一:11,十二:12,十三:13,十四:14,十五:15,十六:16,十七:17,十八:18,十九:19,二十:20,
    二十一:21,二十二:22,二十三:23,二十四:24,二十五:25,二十六:26,二十七:27,二十八:28,二十九:29,三十:30,
  }
  function toNum(s: string): number { return /^\d+$/.test(s) ? parseInt(s) : (cnMap[s] ?? 0) }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(chapterRe)
    if (!m) continue

    const n = toNum(m[1])
    if (!n || seen.has(n)) continue
    seen.add(n)

    // Build full title: "第n章：副标题" (strip markdown/table noise from subtitle)
    const rawSubtitle = m[2]
      .split(/[|｜]/)[0]          // stop at table cell boundary
      .replace(/<[^>]+>/g, '')    // strip HTML
      .replace(/[*_`[\]]/g, '')   // strip markdown
      .trim()
    const title = rawSubtitle ? `第${n}章：${rawSubtitle}` : `第${n}章`

    // Summary: remaining table cells (核心事件 | 冲突点 | 悬念)
    let summary = ''
    const cellParts = line.split(/[|｜]/).map(s =>
      s.replace(/<[^>]+>/g, '').replace(/[*_`[\]]/g, '').trim()
    ).filter(Boolean)

    // Find which cell contains the chapter title
    const titleCellIdx = cellParts.findIndex(c => chapterRe.test(c))
    if (titleCellIdx >= 0 && cellParts.length > titleCellIdx + 1) {
      const parts: string[] = []
      const labels = ['核心事件', '冲突点', '悬念']
      for (let k = 0; k < 3; k++) {
        const val = cellParts[titleCellIdx + 1 + k]
        if (val) parts.push(`${labels[k]}：${val}`)
      }
      summary = parts.join(' | ')
    }

    chapters.push({ title, summary })
  }
  return chapters
}

// ──────────────────────── Outline version drawer ────────────────────────
function OutlineVersionDrawer({
  projectId,
  open,
  onClose,
  onRestore,
  chapters,
  onChaptersChange,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  onRestore: (content: string) => void
  chapters: ChapterRead[]
  onChaptersChange: (chs: ChapterRead[]) => void
}) {
  const [versions, setVersions] = useState<OutlineVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmVersion, setConfirmVersion] = useState<OutlineVersion | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    novelApi.listOutlineVersions(projectId).then(v => { setVersions(v); setLoading(false) })
  }, [open, projectId])

  async function handleDelete(versionId: string) {
    await novelApi.deleteOutlineVersion(projectId, versionId)
    setVersions(v => v.filter(x => x.id !== versionId))
  }

  async function handleConfirmRestore() {
    if (!confirmVersion) return
    setRestoring(true)
    try {
      // Delete all existing chapters
      for (const ch of chapters) {
        await novelApi.deleteChapter(projectId, ch.id)
      }
      // Save outline
      await novelApi.saveOutline(projectId, confirmVersion.content)
      // Re-create chapters from outline
      const parsed = parseChaptersFromOutline(confirmVersion.content)
      const created: ChapterRead[] = []
      for (let i = 0; i < parsed.length; i++) {
        const ch = await novelApi.createChapter(projectId, {
          title: parsed[i].title,
          order: i + 1,
          summary: parsed[i].summary,
        })
        created.push(ch)
      }
      onChaptersChange(created)
      onRestore(confirmVersion.content)
      onClose()
    } finally {
      setRestoring(false)
      setConfirmVersion(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-96 bg-white shadow-xl flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-medium text-gray-900 text-sm">大纲历史版本</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-gray-400 px-4 py-6 text-center">加载中...</p>}
          {!loading && versions.length === 0 && (
            <p className="text-xs text-gray-400 px-4 py-6 text-center">暂无历史版本</p>
          )}
          {versions.map(v => (
            <div key={v.id} className="border-b border-gray-100 px-4 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <span className={clsx(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  v.source === 'manual' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'
                )}>
                  {v.source === 'manual' ? '手动保存' : 'AI 自动'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(v.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed mb-2">{v.content.slice(0, 120)}...</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmVersion(v)}
                  className="flex items-center gap-1 text-xs px-2 py-1 bg-brand-600 text-white rounded hover:bg-brand-700"
                >
                  <Check size={11} /> 使用此版本
                </button>
                <button
                  onClick={() => handleDelete(v.id)}
                  className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded border border-red-200"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmVersion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="bg-black/40 absolute inset-0" onClick={() => !restoring && setConfirmVersion(null)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-80 z-10">
            <h4 className="font-medium text-gray-900 text-sm mb-2">切换大纲版本</h4>
            <p className="text-xs text-gray-600 mb-4">
              此操作将<span className="text-red-600 font-medium">清空现有 {chapters.length} 个章节</span>，并根据所选版本大纲重新创建章节列表。章节正文内容将丢失，无法恢复。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmVersion(null)}
                disabled={restoring}
                className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={restoring}
                className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {restoring ? '处理中...' : '确认切换'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────── Left panel ────────────────────────
function LeftPanel({
  projectId,
  outline,
  chapters,
  versionCount,
  onOutlineChange,
  onChaptersChange,
  onExpandOutline,
  onShowVersions,
}: {
  projectId: string
  outline: string
  chapters: ChapterRead[]
  versionCount: number
  onOutlineChange: (v: string) => void
  onChaptersChange: (chs: ChapterRead[]) => void
  onExpandOutline: () => void
  onShowVersions: () => void
}) {
  const navigate = useNavigate()
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [generating, setGenerating] = useState(false)
  const parsedChapters = useMemo(() => parseChaptersFromOutline(outline), [outline])

  async function addChapter() {
    const order = chapters.length + 1
    const ch = await novelApi.createChapter(projectId, { title: `第 ${order} 章`, order })
    onChaptersChange([...chapters, ch])
  }

  async function handleGenerateChapters() {
    if (parsedChapters.length === 0) return
    if (!window.confirm(`从大纲生成 ${parsedChapters.length} 个章节？\n\n${parsedChapters.slice(0, 6).map(c => c.title).join('\n')}${parsedChapters.length > 6 ? '\n...' : ''}`)) return
    setGenerating(true)
    try {
      const start = chapters.length + 1
      const created: ChapterRead[] = []
      for (let i = 0; i < parsedChapters.length; i++) {
        const ch = await novelApi.createChapter(projectId, {
          title: parsedChapters[i].title,
          order: start + i,
          summary: parsedChapters[i].summary,
        })
        created.push(ch)
      }
      onChaptersChange([...chapters, ...created])
    } finally {
      setGenerating(false)
    }
  }

  async function refreshChapters() {
    const chs = await novelApi.listChapters(projectId)
    onChaptersChange(chs)
  }

  return (
    <div className="w-52 shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-hidden">
      {/* Outline section */}
      <div className="border-b border-gray-200">
        <button
          onClick={() => setOutlineOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <FileText size={14} className="text-brand-600 shrink-0" />
          <span className="flex-1 text-left">故事大纲</span>
          {outline && <span className="text-xs text-green-600">已保存</span>}
          {outlineOpen ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        </button>
        {outlineOpen && (
          <div className="px-3 pb-3">
            {outline ? (
              <textarea
                className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed"
                rows={8}
                value={outline}
                onChange={e => onOutlineChange(e.target.value)}
              />
            ) : (
              <p className="text-xs text-gray-400 py-2">在对话中生成大纲后，点击「保存大纲」</p>
            )}
            {outline && parsedChapters.length > 0 && chapters.length === 0 && (
              <button
                onClick={handleGenerateChapters}
                disabled={generating}
                className="mt-2 w-full text-xs btn bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 justify-center"
              >
                <Zap size={12} />
                {generating ? '生成中...' : `生成 ${parsedChapters.length} 个章节`}
              </button>
            )}
            {outline && (
              <button
                onClick={onExpandOutline}
                className="mt-2 w-full text-xs btn bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 justify-center"
              >
                <Sparkles size={12} />
                扩充大纲
              </button>
            )}
            <button
              onClick={onShowVersions}
              className="mt-2 w-full text-xs btn bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 justify-center"
            >
              <History size={12} />
              历史版本{versionCount > 0 && <span className="ml-1 bg-gray-300 text-gray-700 rounded-full px-1.5 py-0.5 text-xs leading-none">{versionCount}</span>}
            </button>
          </div>
        )}
      </div>

      {/* Chapters section */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-600">章节列表</span>
        <div className="flex gap-0.5">
          <button onClick={refreshChapters} className="p-1 text-gray-400 hover:text-gray-700 rounded" title="刷新">
            <RefreshCw size={12} />
          </button>
          <button onClick={addChapter} className="p-1 text-gray-400 hover:text-gray-700 rounded" title="新建章节">
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {chapters.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-3">暂无章节</p>
        )}
        {chapters.map(ch => (
          <button
            key={ch.id}
            onClick={() => navigate(`/projects/${projectId}/chapters/${ch.id}`)}
            className="w-full flex flex-col px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors group"
            title={ch.summary || undefined}
          >
            <span className="text-xs text-gray-700 truncate group-hover:text-brand-600">{ch.title}</span>
            {ch.summary && <span className="text-xs text-gray-400 line-clamp-2 mt-0.5">{ch.summary}</span>}
            <span className="text-xs text-gray-400 mt-0.5">{ch.word_count.toLocaleString()} 字</span>
          </button>
        ))}
      </div>

      {/* Navigate to editor */}
      {chapters.length > 0 && (
        <button
          onClick={() => navigate(`/projects/${projectId}/novel`)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-brand-600 hover:bg-brand-50 border-t border-gray-200 transition-colors font-medium"
        >
          <BookOpen size={13} />
          进入章节编辑
        </button>
      )}
    </div>
  )
}

// ──────────────────────── System prompt panel ────────────────────────
function SystemPromptPanel({
  mode, onModeChange,
  worldEnabled, onWorldToggle, worldText, onWorldText,
  charEnabled, onCharToggle, charText, onCharText,
  chapters, selectedChapterId, onChapterSelect,
}: {
  mode: PromptMode; onModeChange: (m: PromptMode) => void
  worldEnabled: boolean; onWorldToggle: () => void; worldText: string; onWorldText: (v: string) => void
  charEnabled: boolean; onCharToggle: () => void; charText: string; onCharText: (v: string) => void
  chapters: ChapterRead[]; selectedChapterId: string | null; onChapterSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedChapter = chapters.find(c => c.id === selectedChapterId)

  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <Settings2 size={14} />
        <span>提示词设置</span>
        <span className={clsx(
          'ml-1 text-xs px-1.5 py-0.5 rounded font-medium',
          mode === 'outline' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        )}>
          {mode === 'outline' ? '大纲模式' : '章节模式'}
        </span>
        {mode === 'chapter' && selectedChapter && (
          <span className="text-xs text-blue-600 truncate max-w-32">{selectedChapter.title}</span>
        )}
        {(worldEnabled || charEnabled) && (
          <span className="text-xs text-brand-600">+{[worldEnabled, charEnabled].filter(Boolean).length} 个补充</span>
        )}
        {open ? <ChevronUp size={13} className="ml-auto text-gray-400" /> : <ChevronDown size={13} className="ml-auto text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-gray-50 border-t border-gray-100">
          {/* Mode toggle */}
          <div className="pt-3">
            <p className="text-xs text-gray-500 mb-2">创作模式</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => onModeChange('outline')}
                className={clsx('text-xs px-3 py-1.5 rounded border font-medium transition-colors', mode === 'outline' ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-400')}
              >
                大纲模式
              </button>
              <button
                onClick={() => onModeChange('chapter')}
                className={clsx('text-xs px-3 py-1.5 rounded border font-medium transition-colors', mode === 'chapter' ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-400')}
              >
                章节模式
              </button>
            </div>
          </div>

          {/* Chapter selector — only in chapter mode */}
          {mode === 'chapter' && chapters.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">选择章节（可选）</p>
              <select
                className="w-full text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={selectedChapterId || ''}
                onChange={e => onChapterSelect(e.target.value || null)}
              >
                <option value="">不指定章节</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.title}</option>
                ))}
              </select>
              {selectedChapter?.summary && (
                <p className="text-xs text-gray-500 mt-1.5 bg-blue-50 border border-blue-200 rounded p-2 leading-relaxed">
                  <span className="font-medium text-blue-700">章节概述：</span>{selectedChapter.summary}
                </p>
              )}
            </div>
          )}

          {/* Worldbuilding supplement */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button onClick={onWorldToggle} className={clsx(
                'text-xs px-2 py-0.5 rounded border transition-colors',
                worldEnabled ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400'
              )}>
                世界观设定
              </button>
              <span className="text-xs text-gray-400">{worldEnabled ? '已启用' : '点击启用'}</span>
            </div>
            {worldEnabled && (
              <textarea
                className="w-full text-xs bg-white border border-gray-300 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-700 leading-relaxed"
                rows={4}
                value={worldText}
                onChange={e => onWorldText(e.target.value)}
                placeholder="描述故事的世界观设定..."
              />
            )}
          </div>

          {/* Character supplement — only in chapter mode */}
          {mode === 'chapter' && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <button onClick={onCharToggle} className={clsx(
                  'text-xs px-2 py-0.5 rounded border transition-colors',
                  charEnabled ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400'
                )}>
                  人物设定
                </button>
                <span className="text-xs text-gray-400">{charEnabled ? '已启用' : '点击启用'}</span>
              </div>
              {charEnabled && (
                <textarea
                  className="w-full text-xs bg-white border border-gray-300 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-700 leading-relaxed"
                  rows={4}
                  value={charText}
                  onChange={e => onCharText(e.target.value)}
                  placeholder="描述故事中的人物设定..."
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────── Message bubble ────────────────────────
function ThinkingBubble({ text }: { text?: string }) {
  const [expanded, setExpanded] = useState(false)
  const isStreaming = !text || text.length === 0

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1 bg-gray-200 text-gray-600">
        AI
      </div>
      <div className="max-w-[75%] rounded-xl px-4 py-3 text-sm bg-white border border-gray-200 rounded-tl-sm shadow-sm">
        <button
          onClick={() => !isStreaming && setExpanded(v => !v)}
          className="flex items-center gap-2 text-gray-400 w-full text-left"
        >
          <span className="text-xs">{isStreaming ? '' : ' Thinking...'}</span>
          {isStreaming ? (
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          ) : (
            <span className="text-xs text-gray-300">{expanded ? '▲ 收起' : '▼ 展开'}</span>
          )}
        </button>
        {(isStreaming || expanded) && text && (
          <div className="mt-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap border-t border-gray-100 pt-2 max-h-48 overflow-y-auto">
            {text}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ role, content, isStreaming }: { role: string; content: string; isStreaming?: boolean }) {
  const isUser = role === 'user'
  return (
    <div className={clsx('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={clsx(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1',
        isUser ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600'
      )}>
        {isUser ? '我' : 'AI'}
      </div>
      <div className={clsx(
        'max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed',
        isUser ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-gray">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            {isStreaming && <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-0.5" />}
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────── Main page ────────────────────────
export function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { messages, streaming, streamingText, thinkingText, setMessages, addMessage, setStreaming, appendStreamingText, appendThinkingText, commitStreamingMessage, clearMessages, setProjectId } = useChatStore()
  const { sendStream, stop } = useSSEStream()

  const [input, setInput] = useState('')
  const [agentActivity, setAgentActivity] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamingTextRef = useRef('')

  // Prompt mode state
  const [promptMode, setPromptMode] = useState<PromptMode>('outline')
  const [worldEnabled, setWorldEnabled] = useState(false)
  const [worldText, setWorldText] = useState(DEFAULT_WORLDBUILDING)
  const [charEnabled, setCharEnabled] = useState(false)
  const [charText, setCharText] = useState(DEFAULT_CHARACTER)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)

  // Left panel state
  const [outline, setOutline] = useState('')
  const [chapters, setChapters] = useState<ChapterRead[]>([])
  const [versionCount, setVersionCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const selectedChapter = chapters.find(c => c.id === selectedChapterId)

  // Combined system prompt
  const systemPrompt = useMemo(() => {
    const base = promptMode === 'outline' ? OUTLINE_BASE : CHAPTER_BASE
    const parts = [base]

    // Add chapter summary if in chapter mode and chapter is selected
    if (promptMode === 'chapter' && selectedChapter?.summary) {
      parts.push(`当前章节：${selectedChapter.title}\n章节概述：${selectedChapter.summary}`)
    }

    if (worldEnabled && worldText.trim()) parts.push(`世界观设定参考：\n${worldText}`)
    if (promptMode === 'chapter' && charEnabled && charText.trim()) parts.push(`人物设定参考：\n${charText}`)
    return parts.join('\n\n---\n\n')
  }, [promptMode, worldEnabled, worldText, charEnabled, charText, selectedChapter])

  useEffect(() => {
    if (!projectId) return
    setProjectId(projectId)
    chatApi.getHistory(projectId).then(setMessages)
    novelApi.listChapters(projectId).then(setChapters)
    novelApi.getOutline(projectId).then(text => setOutline(text || ''))
    novelApi.listOutlineVersions(projectId).then(vs => setVersionCount(vs.length))
  }, [projectId])

  useEffect(() => {
    streamingTextRef.current = streamingText
  }, [streamingText])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const TOOL_LABELS: Record<string, string> = {
    read_outline: '读取大纲',
    save_outline: '保存大纲',
    list_chapters: '列出章节',
    read_chapter: '读取章节',
    update_chapter: '更新章节',
    create_chapter: '创建章节',
    delete_chapter: '删除章节',
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || streaming || !projectId) return
    setInput('')
    setAgentActivity('')
    setErrorMsg('')
    addMessage({ id: Date.now().toString(), role: 'user', content: text, created_at: new Date().toISOString() })
    setStreaming(true)
    await sendStream(
      `/api/chat/${projectId}/agent`,
      { content: text, system_prompt: systemPrompt },
      (delta) => appendStreamingText(delta),
      (msgId) => {
        const finalText = streamingTextRef.current
        commitStreamingMessage(msgId)
        setAgentActivity('')
        if (promptMode === 'outline' && finalText && projectId) {
          novelApi.saveOutlineVersion(projectId, finalText, 'auto')
            .then(() => setVersionCount(c => c + 1))
            .catch(() => {})
        }
      },
      (err) => { setStreaming(false); setAgentActivity(''); setErrorMsg(err) },
      (thinking) => appendThinkingText(thinking),
      (toolName) => setAgentActivity(TOOL_LABELS[toolName] || toolName),
      (_result) => { /* tool result received, keep activity label until next tool or done */ },
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  async function handleClear() {
    if (!projectId) return
    await chatApi.clearHistory(projectId)
    clearMessages()
  }

  async function handleSaveOutline() {
    if (!projectId) return
    const lastAI = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAI) return

    await novelApi.saveOutline(projectId, lastAI.content)
    setOutline(lastAI.content)

    const parsedChapters = parseChaptersFromOutline(lastAI.content)
    if (parsedChapters.length === 0) return

    // Delete all existing chapters then recreate from latest outline
    for (const ch of chapters) {
      await novelApi.deleteChapter(projectId, ch.id)
    }
    const created: ChapterRead[] = []
    for (let i = 0; i < parsedChapters.length; i++) {
      const ch = await novelApi.createChapter(projectId, {
        title: parsedChapters[i].title,
        order: i + 1,
        summary: parsedChapters[i].summary,
      })
      created.push(ch)
    }
    setChapters(created)
  }

  const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant')

  function handleExpandOutline() {
    handleSend('请扩充大纲，在现有内容基础上继续新增章节。')
  }

  return (
    <div className="flex h-full">
      {/* Left: chapter nav */}
      <LeftPanel
        projectId={projectId!}
        outline={outline}
        chapters={chapters}
        versionCount={versionCount}
        onOutlineChange={async (v) => {
          setOutline(v)
          if (projectId) await novelApi.saveOutline(projectId, v)
        }}
        onChaptersChange={setChapters}
        onExpandOutline={handleExpandOutline}
        onShowVersions={() => setDrawerOpen(true)}
      />
      <OutlineVersionDrawer
        projectId={projectId!}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRestore={(content) => setOutline(content)}
        chapters={chapters}
        onChaptersChange={setChapters}
      />

      {/* Right: chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-gray-900">AI 对话创作</h2>
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded font-medium',
              promptMode === 'outline' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            )}>
              {promptMode === 'outline' ? '大纲模式' : '章节模式'}
            </span>
          </div>
          <div className="flex gap-1">
            {promptMode === 'outline' && lastAIMessage && (
              <button onClick={handleSaveOutline} className="btn-ghost text-xs text-green-600 hover:text-green-700">
                <Save size={13} /> 保存大纲
              </button>
            )}
            <button onClick={() => chatApi.exportDialogue(projectId!)} className="btn-ghost text-xs">
              <Download size={13} /> 导出
            </button>
            <button onClick={handleClear} className="btn-ghost text-xs text-red-500 hover:text-red-600">
              <Trash2 size={13} /> 清空
            </button>
          </div>
        </div>

        {/* System prompt panel */}
        <SystemPromptPanel
          mode={promptMode} onModeChange={setPromptMode}
          worldEnabled={worldEnabled} onWorldToggle={() => setWorldEnabled(v => !v)}
          worldText={worldText} onWorldText={setWorldText}
          charEnabled={charEnabled} onCharToggle={() => setCharEnabled(v => !v)}
          charText={charText} onCharText={setCharText}
          chapters={chapters}
          selectedChapterId={selectedChapterId}
          onChapterSelect={setSelectedChapterId}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-16 text-gray-400">
              {promptMode === 'outline' ? (
                <>
                  <FileText size={32} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">大纲模式：描述你的故事创意</p>
                  <p className="text-xs mt-1">AI 将帮你生成包含章节列表的故事大纲</p>
                </>
              ) : (
                <>
                  <BookOpen size={32} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">章节模式：告诉 AI 要写哪一章</p>
                  <p className="text-xs mt-1">可在左侧启用人物设定和世界观作为背景参考</p>
                </>
              )}
            </div>
          )}
          {messages.map(m => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          {streaming && !streamingText && <ThinkingBubble text={thinkingText || undefined} />}
          {streaming && thinkingText && streamingText && <ThinkingBubble text={thinkingText} />}
          {streaming && agentActivity && !streamingText && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1 bg-gray-200 text-gray-600">AI</div>
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {agentActivity}...
              </div>
            </div>
          )}
          {streaming && streamingText && (
            <MessageBubble role="assistant" content={streamingText} isStreaming />
          )}
          {!streaming && errorMsg && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              <span className="flex-1">⚠ {errorMsg}</span>
              <button
                onClick={() => { setErrorMsg(''); const userMsgs = messages.filter(m => m.role === 'user'); setInput(userMsgs[userMsgs.length - 1]?.content ?? '') }}
                className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 shrink-0"
              >
                重试
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4 bg-white shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              className="input flex-1 resize-none min-h-[44px] max-h-32"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={promptMode === 'outline' ? '描述你的故事创意，例如：写一个古风修仙故事，主角是一个落魄书生...' : '告诉 AI 要写哪一章，例如：写第一章，主角初入江湖...'}
              disabled={streaming}
            />
            {streaming ? (
              <button onClick={() => { stop(); setStreaming(false) }} className="btn-danger shrink-0">
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button id="chat-send-btn" onClick={() => handleSend()} disabled={!input.trim()} className="btn-primary shrink-0">
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
