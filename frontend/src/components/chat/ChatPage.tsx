import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Send, Square, Trash2, Download, ChevronDown, ChevronUp,
  BookOpen, Plus, Save, FileText, Zap, Settings2, RefreshCw,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { chatApi } from '../../api/chatApi'
import { novelApi } from '../../api/novelApi'
import { useChatStore } from '../../store/useChatStore'
import { useSSEStream } from '../../hooks/useSSEStream'
import { OUTLINE_BASE, CHAPTER_BASE, DEFAULT_WORLDBUILDING, DEFAULT_CHARACTER } from '../../constants/systemPrompts'
import type { ChapterRead } from '../../types/novel'
import { clsx } from 'clsx'

type PromptMode = 'outline' | 'chapter'

// Parse chapter titles from AI-generated outline
function parseChapterTitles(text: string): string[] {
  const titles: string[] = []
  for (const line of text.split('\n')) {
    const t = line.trim().replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^#{1,3}\s+/, '')
    if (/^第[一二三四五六七八九十百\d]+章/.test(t) || /^Chapter\s+\d+/i.test(t)) {
      titles.push(t)
    }
  }
  return titles
}

// ──────────────────────── Left panel ────────────────────────
function LeftPanel({
  projectId,
  outline,
  chapters,
  onOutlineChange,
  onChaptersChange,
}: {
  projectId: string
  outline: string
  chapters: ChapterRead[]
  onOutlineChange: (v: string) => void
  onChaptersChange: (chs: ChapterRead[]) => void
}) {
  const navigate = useNavigate()
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [generating, setGenerating] = useState(false)
  const parsedTitles = useMemo(() => parseChapterTitles(outline), [outline])

  async function addChapter() {
    const order = chapters.length + 1
    const ch = await novelApi.createChapter(projectId, { title: `第 ${order} 章`, order })
    onChaptersChange([...chapters, ch])
  }

  async function handleGenerateChapters() {
    if (parsedTitles.length === 0) return
    if (!window.confirm(`从大纲生成 ${parsedTitles.length} 个章节？\n\n${parsedTitles.slice(0, 6).join('\n')}${parsedTitles.length > 6 ? '\n...' : ''}`)) return
    setGenerating(true)
    try {
      const start = chapters.length + 1
      const created: ChapterRead[] = []
      for (let i = 0; i < parsedTitles.length; i++) {
        const ch = await novelApi.createChapter(projectId, { title: parsedTitles[i], order: start + i })
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
            {outline && parsedTitles.length > 0 && chapters.length === 0 && (
              <button
                onClick={handleGenerateChapters}
                disabled={generating}
                className="mt-2 w-full text-xs btn bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 justify-center"
              >
                <Zap size={12} />
                {generating ? '生成中...' : `生成 ${parsedTitles.length} 个章节`}
              </button>
            )}
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
            onClick={() => navigate(`/projects/${projectId}/novel?chapter=${ch.id}`)}
            className="w-full flex flex-col px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors group"
          >
            <span className="text-xs text-gray-700 truncate group-hover:text-brand-600">{ch.title}</span>
            <span className="text-xs text-gray-400">{ch.word_count.toLocaleString()} 字</span>
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
}: {
  mode: PromptMode; onModeChange: (m: PromptMode) => void
  worldEnabled: boolean; onWorldToggle: () => void; worldText: string; onWorldText: (v: string) => void
  charEnabled: boolean; onCharToggle: () => void; charText: string; onCharText: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

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
            <ReactMarkdown>{content}</ReactMarkdown>
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
  const { messages, streaming, streamingText, setMessages, addMessage, setStreaming, appendStreamingText, commitStreamingMessage, clearMessages } = useChatStore()
  const { sendStream, stop, isStreaming } = useSSEStream()

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Prompt mode state
  const [promptMode, setPromptMode] = useState<PromptMode>('outline')
  const [worldEnabled, setWorldEnabled] = useState(false)
  const [worldText, setWorldText] = useState(DEFAULT_WORLDBUILDING)
  const [charEnabled, setCharEnabled] = useState(false)
  const [charText, setCharText] = useState(DEFAULT_CHARACTER)

  // Left panel state
  const [outline, setOutline] = useState('')
  const [chapters, setChapters] = useState<ChapterRead[]>([])

  // Combined system prompt
  const systemPrompt = useMemo(() => {
    const base = promptMode === 'outline' ? OUTLINE_BASE : CHAPTER_BASE
    const parts = [base]
    if (worldEnabled && worldText.trim()) parts.push(`世界观设定参考：\n${worldText}`)
    if (promptMode === 'chapter' && charEnabled && charText.trim()) parts.push(`人物设定参考：\n${charText}`)
    return parts.join('\n\n---\n\n')
  }, [promptMode, worldEnabled, worldText, charEnabled, charText])

  useEffect(() => {
    if (!projectId) return
    chatApi.getHistory(projectId).then(setMessages)
    novelApi.listChapters(projectId).then(setChapters)
    novelApi.getOutline(projectId).then(text => setOutline(text || ''))
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function handleSend() {
    if (!input.trim() || isStreaming || !projectId) return
    const text = input.trim()
    setInput('')
    addMessage({ id: Date.now().toString(), role: 'user', content: text, created_at: new Date().toISOString() })
    setStreaming(true)
    await sendStream(
      `/api/chat/${projectId}/send`,
      { content: text, system_prompt: systemPrompt },
      (delta) => appendStreamingText(delta),
      (msgId) => commitStreamingMessage(msgId),
      (err) => { console.error(err); setStreaming(false) },
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
  }

  const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant')

  return (
    <div className="flex h-full">
      {/* Left: chapter nav */}
      <LeftPanel
        projectId={projectId!}
        outline={outline}
        chapters={chapters}
        onOutlineChange={async (v) => {
          setOutline(v)
          if (projectId) await novelApi.saveOutline(projectId, v)
        }}
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
          {streaming && streamingText && (
            <MessageBubble role="assistant" content={streamingText} isStreaming />
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
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button onClick={stop} className="btn-danger shrink-0">
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className="btn-primary shrink-0">
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
