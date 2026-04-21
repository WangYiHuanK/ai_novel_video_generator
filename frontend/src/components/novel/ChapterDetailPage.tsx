import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, Loader2, Edit3, Send, Square, Trash2, Copy,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { novelApi } from '../../api/novelApi'
import { chatApi } from '../../api/chatApi'
import { useChatStore } from '../../store/useChatStore'
import { useSSEStream } from '../../hooks/useSSEStream'
import { useDebounce } from '../../hooks/useDebounce'
import { CHAPTER_BASE, DEFAULT_WORLDBUILDING, DEFAULT_CHARACTER } from '../../constants/systemPrompts'
import { AIGenerateButtons } from './AIGenerateButtons'
import type { ChapterContent } from '../../types/novel'
import { clsx } from 'clsx'
import { useBatchStore } from '../../store/useBatchStore'

function MessageBubble({ role, content, isStreaming, onCopyToEditor, onResend, showResend }: {
  role: string; content: string; isStreaming?: boolean; onCopyToEditor?: () => void; onResend?: () => void; showResend?: boolean
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
        isUser
          ? 'bg-brand-600 text-white rounded-tr-sm'
          : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
      )}>
        {isUser ? (
          <div>
            <p className="whitespace-pre-wrap">{content}</p>
            {showResend && onResend && (
              <button
                onClick={onResend}
                className="mt-2 flex items-center gap-1 text-xs text-white/80 hover:text-white bg-white/20 rounded px-2 py-0.5 transition-colors"
              >
                <Send size={10} /> 重新发送
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="prose prose-sm max-w-none prose-gray">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {isStreaming && <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-0.5" />}
            </div>
            {!isStreaming && onCopyToEditor && (
              <button
                onClick={onCopyToEditor}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-brand-600 text-white rounded text-xs hover:bg-brand-700 transition-all flex items-center gap-1"
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

export function ChapterDetailPage() {
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId: string }>()
  const navigate = useNavigate()

  const [chapter, setChapter] = useState<ChapterContent | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [narrativeState, setNarrativeState] = useState<import('../../types/novel').NarrativeState | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [narrativeContext, setNarrativeContext] = useState('')

  // Chat state
  const { messages, streaming, streamingText, thinkingText, setMessages, addMessage, setStreaming, appendStreamingText, appendThinkingText, commitStreamingMessage, clearMessages, setProjectId } = useChatStore()
  const { sendStream, stop } = useSSEStream()
  const [input, setInput] = useState('')
  const [agentActivity, setAgentActivity] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [stoppedMsgId, setStoppedMsgId] = useState<string | null>(null)
  const [worldEnabled, setWorldEnabled] = useState(false)
  const [worldText] = useState(DEFAULT_WORLDBUILDING)
  const [charEnabled, setCharEnabled] = useState(false)
  const [charText] = useState(DEFAULT_CHARACTER)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const TOOL_LABELS: Record<string, string> = {
    read_outline: '读取大纲', save_outline: '保存大纲',
    list_chapters: '列出章节', read_chapter: '读取章节',
    update_chapter: '更新章节', create_chapter: '创建章节', delete_chapter: '删除章节',
  }

  useEffect(() => {
    if (!projectId || !chapterId) return
    setProjectId(projectId)
    novelApi.getChapter(projectId, chapterId).then(ch => {
      setChapter(ch)
      setTitle(ch.title)
      setContent(ch.content)
      setNarrativeState(ch.narrative_state ?? null)
    })
    chatApi.getHistory(projectId).then(setMessages)
    // Load narrative context from previous chapters
    novelApi.getNarrativeContext(projectId, chapterId).then(ctx => setNarrativeContext(ctx))
  }, [projectId, chapterId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useDebounce(content, 800, async (val) => {
    if (!projectId || !chapterId || !chapter) return
    setSaveStatus('saving')
    try {
      await novelApi.saveChapter(projectId, chapterId, title, val)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
    }
  })

  const systemPrompt = [
    CHAPTER_BASE,
    `当前章节：${title}`,
    chapter?.summary ? `章节概述：${chapter.summary}` : '',
    narrativeContext || '',
    worldEnabled && worldText.trim() ? `世界观设定参考：\n${worldText}` : '',
    charEnabled && charText.trim() ? `人物设定参考：\n${charText}` : '',
  ].filter(Boolean).join('\n\n---\n\n')

  async function sendMessage(text: string) {
    if (!text.trim() || streaming || !projectId) return
    setAgentActivity('')
    setErrorMsg('')
    setStoppedMsgId(null)
    const msgId = Date.now().toString()
    addMessage({ id: msgId, role: 'user', content: text, created_at: new Date().toISOString() })
    setStreaming(true)
    await sendStream(
      `/api/chat/${projectId}/agent`,
      { content: text, system_prompt: systemPrompt },
      (delta) => appendStreamingText(delta),
      (msgId) => { commitStreamingMessage(msgId); setAgentActivity('') },
      (err) => { setStreaming(false); setAgentActivity(''); setErrorMsg(err) },
      (thinking) => appendThinkingText(thinking),
      (toolName) => setAgentActivity(TOOL_LABELS[toolName] || toolName),
      () => {},
    )
  }

  function handleSend() {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    sendMessage(text)
  }

  function handleResend(msgId: string) {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    setMessages(messages.filter(m => m.id !== msgId))
    setStoppedMsgId(null)
    sendMessage(msg.content)
  }

  function handleStop() {
    stop()
    setStreaming(false)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) setStoppedMsgId(lastUserMsg.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleInsertContent(text: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const before = content.substring(0, start)
    const after = content.substring(textarea.selectionEnd)
    const newContent = before + '\n\n' + text + '\n\n' + after
    setContent(newContent)
    setTimeout(() => {
      const pos = start + text.length + 4
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    }, 0)
  }

  async function handleClearChat() {
    if (!projectId) return
    await chatApi.clearHistory(projectId)
    clearMessages()
  }

  async function handleSaveManually() {
    if (!projectId || !chapterId || !chapter) return
    setSaveStatus('saving')
    try {
      const updated = await novelApi.saveChapter(projectId, chapterId, title, content)
      setChapter(updated)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
    }
  }

  function handleContentGenerated(newContent: string) {
    setContent(newContent)
    if (!projectId || !chapterId) return
    setSaveStatus('saving')
    novelApi.saveChapter(projectId, chapterId, title, newContent).then(updated => {
      setChapter(updated)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      // Auto-summarize after saving
      setSummarizing(true)
      novelApi.summarizeChapter(projectId, chapterId).then(ns => {
        setNarrativeState(ns)
        setSummarizing(false)
      }).catch(() => setSummarizing(false))
    }).catch(() => setSaveStatus('idle'))
  }

  const batchRunning = useBatchStore(s => s.running)
  const batchLog = useBatchStore(s => s.log)
  const batchDone = useBatchStore(s => s.doneCount)
  const batchTotal = useBatchStore(s => s.totalChapters)

  if (!chapter) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: editor */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
        {/* Batch status bar */}
        {batchRunning && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 shrink-0">
            <Loader2 size={11} className="animate-spin" />
            <span>批量写作中 {batchDone}/{batchTotal} 章</span>
            {batchLog && <span className="text-amber-500 truncate">— {batchLog}</span>}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <Edit3 size={14} className="text-gray-400" />
          <input
            className="flex-1 bg-transparent text-lg font-semibold text-gray-900 focus:outline-none placeholder-gray-300"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => projectId && chapterId && novelApi.saveChapter(projectId, chapterId, title, content)}
            placeholder="章节标题"
          />
          <AIGenerateButtons
            projectId={projectId!}
            chapterId={chapterId}
            chapterOrder={chapter.order}
            chapterTitle={title}
            currentContent={content}
            onContentGenerated={handleContentGenerated}
          />
          <button
            onClick={handleSaveManually}
            disabled={saveStatus === 'saving'}
            className="btn-ghost text-xs"
            title="手动保存"
          >
            {saveStatus === 'saving' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check size={13} className="text-green-500" />
            ) : (
              '保存'
            )}
          </button>
          <div className="text-xs text-gray-400 shrink-0">{content.length.toLocaleString()} 字符</div>
        </div>

        {/* Chapter meta */}
        {chapter.summary && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
            {chapter.summary}
          </div>
        )}

        {/* Narrative state */}
        {(narrativeState || summarizing) && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 space-y-0.5">
            {summarizing ? (
              <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> 正在提取主角状态...</span>
            ) : narrativeState && (
              <>
                <div className="font-medium text-blue-800 mb-1">本章主角状态</div>
                {narrativeState.stats && <div>📊 数值：{narrativeState.stats}</div>}
                {narrativeState.abilities && <div>⚡ 能力：{narrativeState.abilities}</div>}
                {narrativeState.items && <div>🎒 道具：{narrativeState.items}</div>}
                {narrativeState.relations && <div>👥 关系：{narrativeState.relations}</div>}
                {narrativeState.other && <div>📝 其他：{narrativeState.other}</div>}
              </>
            )}
          </div>
        )}

        {/* Editor */}
        <textarea
          ref={textareaRef}
          className="flex-1 w-full px-6 py-4 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none bg-white"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="开始写作..."
        />
      </div>

      {/* Right: chat */}
      <div className="w-96 shrink-0 flex flex-col bg-gray-50 overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <span className="text-sm font-medium text-gray-700">AI 对话辅助</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWorldEnabled(v => !v)}
              className={clsx('text-xs px-2 py-0.5 rounded border transition-colors', worldEnabled ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400')}
            >世界观</button>
            <button
              onClick={() => setCharEnabled(v => !v)}
              className={clsx('text-xs px-2 py-0.5 rounded border transition-colors', charEnabled ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400')}
            >人物</button>
            {messages.length > 0 && (
              <button onClick={handleClearChat} className="p-1 text-red-400 hover:text-red-500 rounded">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streaming && (
            <p className="text-xs text-gray-400 text-center py-8">告诉 AI 你想写什么内容，生成后可插入编辑器</p>
          )}
          {messages.map(m => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              onCopyToEditor={m.role === 'assistant' ? () => handleInsertContent(m.content) : undefined}
              showResend={m.id === stoppedMsgId}
              onResend={m.id === stoppedMsgId ? () => handleResend(m.id) : undefined}
            />
          ))}
          {streaming && !streamingText && agentActivity && (
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
            <MessageBubble
              role="assistant"
              content={streamingText}
              isStreaming
              onCopyToEditor={() => handleInsertContent(streamingText)}
            />
          )}
          {!streaming && errorMsg && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              <span className="flex-1">⚠ {errorMsg}</span>
              <button
                onClick={() => { const userMsgs = messages.filter(m => m.role === 'user'); setErrorMsg(''); setInput(userMsgs[userMsgs.length - 1]?.content ?? '') }}
                className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 shrink-0"
              >
                重试
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-3 bg-white shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              className="input flex-1 resize-none text-xs min-h-[44px] max-h-28"
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：重写开头段落，让节奏更紧张..."
              disabled={streaming}
            />
            {streaming ? (
              <button onClick={handleStop} className="btn-danger shrink-0 text-xs px-2 py-1">
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className="btn-primary shrink-0 text-xs px-2 py-1">
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
