import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Plus, Trash2, Download, Check, Loader2, Send, Square,
  MessageSquare, Edit3, ChevronUp, ChevronDown, Copy,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { novelApi } from '../../api/novelApi'
import { chatApi } from '../../api/chatApi'
import { useNovelStore } from '../../store/useNovelStore'
import { useChatStore } from '../../store/useChatStore'
import { useSSEStream } from '../../hooks/useSSEStream'
import { useDebounce } from '../../hooks/useDebounce'
import { CHAPTER_BASE, DEFAULT_WORLDBUILDING, DEFAULT_CHARACTER } from '../../constants/systemPrompts'
import type { ChapterContent } from '../../types/novel'
import { clsx } from 'clsx'
import { AIGenerateButtons } from './AIGenerateButtons'
import { BatchGeneratePanel } from './BatchGeneratePanel'

// ──────────────────────── Chapter Nav ────────────────────────
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
    <div className="w-52 shrink-0 border-r border-gray-200 flex flex-col bg-white">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">章节</span>
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
                ? 'bg-brand-50 text-brand-700 border-l-2 border-brand-500'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
            onClick={() => loadChapter(ch.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{ch.title}</p>
              {ch.summary && <p className="text-xs text-gray-400 line-clamp-1">{ch.summary}</p>}
              <p className="text-xs text-gray-400">{ch.word_count.toLocaleString()} 字</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); deleteChapter(ch.id) }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-500 transition-opacity"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {chapters.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-4">点击 + 新建章节</p>
        )}
      </div>
    </div>
  )
}

// ──────────────────────── Message Bubble ────────────────────────
function MessageBubble({
  role, content, isStreaming, onCopyToEditor,
}: {
  role: string; content: string; isStreaming?: boolean; onCopyToEditor?: () => void
}) {
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
        'max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed relative group',
        isUser ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            <div className="prose prose-sm max-w-none prose-gray">
              <ReactMarkdown>{content}</ReactMarkdown>
              {isStreaming && <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-0.5" />}
            </div>
            {!isStreaming && onCopyToEditor && (
              <button
                onClick={onCopyToEditor}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-brand-600 text-white rounded text-xs hover:bg-brand-700 transition-all flex items-center gap-1"
                title="插入到编辑器"
              >
                <Copy size={12} /> 插入
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ──────────────────────── Chat Panel ────────────────────────
function ChatPanel({
  projectId, chapter, onInsertContent,
}: {
  projectId: string; chapter: ChapterContent; onInsertContent: (text: string) => void
}) {
  const { messages, streaming, streamingText, setMessages, addMessage, setStreaming, appendStreamingText, commitStreamingMessage, clearMessages } = useChatStore()
  const { sendStream, stop, isStreaming } = useSSEStream()
  const [input, setInput] = useState('')
  const [chatOpen, setChatOpen] = useState(true)
  const [worldEnabled, setWorldEnabled] = useState(false)
  const [worldText, setWorldText] = useState(DEFAULT_WORLDBUILDING)
  const [charEnabled, setCharEnabled] = useState(false)
  const [charText, setCharText] = useState(DEFAULT_CHARACTER)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!projectId) return
    chatApi.getHistory(projectId).then(setMessages)
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const systemPrompt = `${CHAPTER_BASE}

当前章节：${chapter.title}
${chapter.summary ? `章节概述：${chapter.summary}` : ''}

${worldEnabled && worldText.trim() ? `---\n\n世界观设定参考：\n${worldText}` : ''}
${charEnabled && charText.trim() ? `---\n\n人物设定参考：\n${charText}` : ''}`

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

  return (
    <div className="flex flex-col border-b border-gray-200 bg-white">
      {/* Header */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-brand-600" />
          <span className="text-sm font-medium text-gray-700">AI 对话辅助</span>
          <span className="text-xs text-gray-400">生成内容后可插入编辑器</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); handleClear() }} className="text-xs text-red-500 hover:text-red-600 px-2 py-1">
              清空
            </button>
          )}
          {chatOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {chatOpen && (
        <>
          {/* Supplements */}
          <div className="px-4 pb-2 flex gap-2 border-t border-gray-100 pt-2">
            <button
              onClick={() => setWorldEnabled(v => !v)}
              className={clsx('text-xs px-2 py-1 rounded border transition-colors', worldEnabled ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400')}
            >
              世界观
            </button>
            <button
              onClick={() => setCharEnabled(v => !v)}
              className={clsx('text-xs px-2 py-1 rounded border transition-colors', charEnabled ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400')}
            >
              人物
            </button>
          </div>

          {/* Messages */}
          <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50 border-t border-gray-100">
            {messages.length === 0 && !streaming && (
              <p className="text-xs text-gray-400 text-center py-4">告诉 AI 你想写什么内容</p>
            )}
            {messages.map(m => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                onCopyToEditor={m.role === 'assistant' ? () => onInsertContent(m.content) : undefined}
              />
            ))}
            {streaming && streamingText && (
              <MessageBubble role="assistant" content={streamingText} isStreaming />
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-200 bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                className="input flex-1 resize-none text-xs"
                rows={2}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="例如：写主角初入江湖的场景，遇到一位神秘老者..."
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button onClick={stop} className="btn-danger shrink-0 text-xs px-2 py-1">
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button onClick={handleSend} disabled={!input.trim()} className="btn-primary shrink-0 text-xs px-2 py-1">
                  <Send size={13} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ──────────────────────── Editor ────────────────────────
function ChapterEditor({ projectId, chapter }: { projectId: string; chapter: ChapterContent }) {
  const { updateActiveContent, setSaveStatus, saveStatus, setChapters, chapters } = useNovelStore()
  const [title, setTitle] = useState(chapter.title)
  const [content, setContent] = useState(chapter.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  function handleInsertContent(text: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = content.substring(0, start)
    const after = content.substring(end)
    const newContent = before + '\n\n' + text + '\n\n' + after

    setContent(newContent)
    updateActiveContent(newContent)

    // Move cursor to end of inserted text
    setTimeout(() => {
      const newPos = start + text.length + 4
      textarea.setSelectionRange(newPos, newPos)
      textarea.focus()
    }, 0)
  }

  async function handleChapterCreated() {
    // Reload chapters list
    const chs = await novelApi.listChapters(projectId)
    setChapters(chs)
  }

  async function handleContentGenerated(newContent: string) {
    // Update content in editor
    setContent(newContent)
    updateActiveContent(newContent)

    // Immediately save to backend
    setSaveStatus('saving')
    try {
      await novelApi.saveChapter(projectId, chapter.id, title, newContent)
      setSaveStatus('saved')

      // Refresh chapter list to update word count
      const chs = await novelApi.listChapters(projectId)
      setChapters(chs)

      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chat panel */}
      <ChatPanel projectId={projectId} chapter={chapter} onInsertContent={handleInsertContent} />

      {/* Editor header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <Edit3 size={14} className="text-gray-400" />
        <input
          className="flex-1 bg-transparent text-lg font-semibold text-gray-900 focus:outline-none placeholder-gray-300"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => novelApi.saveChapter(projectId, chapter.id, title, content)}
          placeholder="章节标题"
        />
        <AIGenerateButtons
          projectId={projectId}
          chapterId={chapter.id}
          chapterOrder={chapter.order}
          chapterTitle={title}
          currentContent={content}
          onContentGenerated={handleContentGenerated}
          onChapterCreated={handleChapterCreated}
        />
        <div className="text-xs text-gray-400 shrink-0">
          {content.length.toLocaleString()} 字符
        </div>
        {saveStatus === 'saving' && <Loader2 size={13} className="text-gray-400 animate-spin" />}
        {saveStatus === 'saved' && <Check size={13} className="text-green-500" />}
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        className="flex-1 bg-white text-sm text-gray-800 p-6 resize-none focus:outline-none leading-relaxed placeholder-gray-300"
        value={content}
        onChange={e => { setContent(e.target.value); updateActiveContent(e.target.value) }}
        placeholder="开始写作，或使用 AI 生成按钮自动创作内容..."
      />
    </div>
  )
}

// ──────────────────────── Main Page ────────────────────────
export function NovelEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const { chapters, activeChapter, setChapters, setActiveChapter } = useNovelStore()

  useEffect(() => {
    if (!projectId) return
    novelApi.listChapters(projectId).then(async (chs) => {
      setChapters(chs)
      if (chs.length === 0) return
      const targetId = searchParams.get('chapter')
      const target = targetId ? chs.find(c => c.id === targetId) : chs[0]
      const chapterToLoad = target ?? chs[0]
      const full = await novelApi.getChapter(projectId, chapterToLoad.id)
      setActiveChapter(full)
    })
  }, [projectId])

  return (
    <div className="flex h-full">
      <ChapterNav projectId={projectId!} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Export toolbar */}
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-200 bg-white gap-1 shrink-0">
          <button onClick={() => novelApi.exportNovel(projectId!, 'md')} className="btn-ghost text-xs">
            <Download size={13} /> 导出 .md
          </button>
          <button onClick={() => novelApi.exportNovel(projectId!, 'txt')} className="btn-ghost text-xs">
            <Download size={13} /> 导出 .txt
          </button>
        </div>

        {/* Batch generate panel */}
        <BatchGeneratePanel
          projectId={projectId!}
          totalChapters={chapters.length}
          onChapterDone={async () => {
            const chs = await novelApi.listChapters(projectId!)
            setChapters(chs)
          }}
        />

        {activeChapter ? (
          <ChapterEditor projectId={projectId!} chapter={activeChapter} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">
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
