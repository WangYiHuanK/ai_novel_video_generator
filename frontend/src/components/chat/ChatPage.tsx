import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Send, Square, Trash2, Download, ChevronDown, ChevronUp, Settings2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { chatApi } from '../../api/chatApi'
import { useChatStore } from '../../store/useChatStore'
import { useSSEStream } from '../../hooks/useSSEStream'
import { SYSTEM_PROMPTS } from '../../constants/systemPrompts'
import { clsx } from 'clsx'

function SystemPromptPanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
      >
        <Settings2 size={14} />
        <span>系统提示词</span>
        {value && <span className="ml-auto text-xs text-brand-400 truncate max-w-48">{value.slice(0, 40)}...</span>}
        {open ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex gap-2 flex-wrap">
            {SYSTEM_PROMPTS.map(p => (
              <button
                key={p.id}
                onClick={() => onChange(p.prompt)}
                className={clsx(
                  'text-xs px-2 py-1 rounded border transition-colors',
                  value === p.prompt
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                )}
              >
                {p.label}
              </button>
            ))}
            <button onClick={() => onChange('')} className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200">
              清空
            </button>
          </div>
          <textarea
            className="input text-xs resize-none"
            rows={4}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="自定义系统提示词..."
          />
        </div>
      )}
    </div>
  )
}

function MessageBubble({ role, content, isStreaming }: { role: string; content: string; isStreaming?: boolean }) {
  const isUser = role === 'user'
  return (
    <div className={clsx('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={clsx(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1',
        isUser ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'
      )}>
        {isUser ? '我' : 'AI'}
      </div>
      <div className={clsx(
        'max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed',
        isUser ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-100 rounded-tl-sm'
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-0.5" />}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { messages, streaming, streamingText, setMessages, addMessage, setStreaming, appendStreamingText, commitStreamingMessage, clearMessages } = useChatStore()
  const { sendStream, stop, isStreaming } = useSSEStream()
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!projectId) return
    chatApi.getHistory(projectId).then(setMessages)
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
      { content: text, system_prompt: systemPrompt || undefined },
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="font-medium text-white">AI 对话创作</h2>
        <div className="flex gap-1">
          <button onClick={() => chatApi.exportDialogue(projectId!)} className="btn-ghost text-xs">
            <Download size={14} /> 导出
          </button>
          <button onClick={handleClear} className="btn-ghost text-xs text-red-400 hover:text-red-300">
            <Trash2 size={14} /> 清空
          </button>
        </div>
      </div>

      {/* System prompt */}
      <SystemPromptPanel value={systemPrompt} onChange={setSystemPrompt} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-sm">开始对话，让 AI 帮你创作故事</p>
            <p className="text-xs mt-1">选择上方的系统提示词预设，快速进入创作模式</p>
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
      <div className="border-t border-gray-800 p-4">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            className="input flex-1 resize-none min-h-[44px] max-h-32"
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
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
  )
}
