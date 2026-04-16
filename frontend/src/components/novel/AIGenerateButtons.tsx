/**
 * AI Generation buttons for novel editor
 */
import { useState } from 'react'
import { Sparkles, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { aiGenerateApi } from '../../api/aiGenerateApi'
import { clsx } from 'clsx'

interface AIGenerateButtonsProps {
  projectId: string
  chapterId?: string
  chapterOrder?: number
  chapterTitle?: string
  currentContent?: string
  onContentGenerated?: (content: string) => void
  onChapterCreated?: () => void
}

type GenerateStatus = 'idle' | 'generating' | 'success' | 'error'

export function AIGenerateButtons({
  projectId,
  chapterId,
  chapterOrder,
  chapterTitle,
  currentContent,
  onContentGenerated,
  onChapterCreated,
}: AIGenerateButtonsProps) {
  const [status, setStatus] = useState<GenerateStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')

  async function handleGenerateChapter() {
    if (!chapterOrder || !chapterTitle) {
      setStatus('error')
      setStatusMessage('缺少章节信息')
      setTimeout(() => setStatus('idle'), 3000)
      return
    }

    setStatus('generating')
    setStatusMessage('正在发送请求到 AI 模型...')

    try {
      const result = await aiGenerateApi.generateChapter(projectId, {
        chapter_order: chapterOrder,
        chapter_title: chapterTitle,
        user_request: '根据大纲和前文，创作这一章节，保持连贯性',
      })

      if (result.success && result.content) {
        setStatus('success')
        setStatusMessage('章节生成成功！')
        onContentGenerated?.(result.content)
        onChapterCreated?.()
        setTimeout(() => setStatus('idle'), 3000)
      }
    } catch (err) {
      setStatus('error')
      setStatusMessage(err instanceof Error ? err.message : '生成失败')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  async function handleContinueChapter() {
    if (!chapterId || !currentContent) {
      setStatus('error')
      setStatusMessage('缺少章节内容')
      setTimeout(() => setStatus('idle'), 3000)
      return
    }

    setStatus('generating')
    setStatusMessage('正在发送续写请求...')

    try {
      const result = await aiGenerateApi.continueChapter(projectId, {
        chapter_id: chapterId,
        current_content: currentContent,
        user_request: '继续写下去，保持风格和情节连贯',
      })

      if (result.success && result.content) {
        setStatus('success')
        setStatusMessage('续写完成！')
        onContentGenerated?.(currentContent + '\n\n' + result.content)
        setTimeout(() => setStatus('idle'), 3000)
      }
    } catch (err) {
      setStatus('error')
      setStatusMessage(err instanceof Error ? err.message : '续写失败')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {chapterId && currentContent ? (
        <button
          onClick={handleContinueChapter}
          disabled={status === 'generating'}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
            status === 'generating'
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : status === 'success'
              ? 'bg-green-600 text-white'
              : status === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
          title="AI 续写当前章节"
        >
          {status === 'generating' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>续写中...</span>
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle size={14} />
              <span>续写成功</span>
            </>
          ) : status === 'error' ? (
            <>
              <XCircle size={14} />
              <span>续写失败</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>AI 续写</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleGenerateChapter}
          disabled={status === 'generating' || !chapterOrder || !chapterTitle}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
            status === 'generating' || !chapterOrder || !chapterTitle
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : status === 'success'
              ? 'bg-green-600 text-white'
              : status === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
          title="AI 生成章节内容"
        >
          {status === 'generating' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>生成中...</span>
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle size={14} />
              <span>生成成功</span>
            </>
          ) : status === 'error' ? (
            <>
              <XCircle size={14} />
              <span>生成失败</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>AI 生成</span>
            </>
          )}
        </button>
      )}

      {statusMessage && (
        <span
          className={clsx(
            'text-xs px-2 py-1 rounded',
            status === 'generating' && 'text-blue-600 bg-blue-50',
            status === 'success' && 'text-green-600 bg-green-50',
            status === 'error' && 'text-red-600 bg-red-50'
          )}
        >
          {statusMessage}
        </span>
      )}
    </div>
  )
}
