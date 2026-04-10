import { useEffect, useState } from 'react'
import { Plus, Trash2, Star, Zap, Edit2 } from 'lucide-react'
import { useModelStore } from '../../store/useModelStore'
import { ModelFormModal } from './ModelFormModal'
import { modelsApi } from '../../api/modelsApi'
import type { ModelConfig } from '../../types/models'
import { clsx } from 'clsx'

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  claude: 'Claude',
  zhipu: '智谱 GLM',
  custom: '自定义',
}

export function ModelConfigPage() {
  const { models, loading, fetch, remove, setDefault } = useModelStore()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ModelConfig | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latency?: number; error?: string }>>({})

  useEffect(() => { fetch() }, [])

  async function handleTest(id: string) {
    setTesting(id)
    const result = await modelsApi.test(id)
    setTestResults(r => ({ ...r, [id]: { success: result.success, latency: result.latency_ms ?? undefined, error: result.error ?? undefined } }))
    setTesting(null)
  }

  function openCreate() { setEditing(null); setShowModal(true) }
  function openEdit(m: ModelConfig) { setEditing(m); setShowModal(true) }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">模型配置</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理 AI 模型的 API 连接</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> 添加模型
        </button>
      </div>

      {loading && <p className="text-gray-500 text-sm">加载中...</p>}

      {!loading && models.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-gray-500">暂无模型配置</p>
          <p className="text-gray-400 text-sm mt-1">点击「添加模型」开始配置</p>
        </div>
      )}

      <div className="space-y-3">
        {models.map(m => {
          const tr = testResults[m.id]
          return (
            <div key={m.id} className="card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{m.name}</span>
                  {m.is_default && (
                    <span className="text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded">默认</span>
                  )}
                  {!m.is_enabled && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">已禁用</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {PROVIDER_LABELS[m.provider]} · {m.model_name}
                  {m.base_url && <span className="ml-2 text-gray-400">{m.base_url}</span>}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Key: {m.api_key_masked}</p>
                {tr && (
                  <p className={clsx('text-xs mt-1', tr.success ? 'text-green-600' : 'text-red-500')}>
                    {tr.success ? `✓ 连接成功 ${tr.latency}ms` : `✗ ${tr.error}`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleTest(m.id)}
                  disabled={testing === m.id}
                  className="btn-ghost text-xs"
                  title="测试连接"
                >
                  <Zap size={14} />
                  {testing === m.id ? '测试中...' : '测试'}
                </button>
                {!m.is_default && (
                  <button onClick={() => setDefault(m.id)} className="btn-ghost text-xs" title="设为默认">
                    <Star size={14} /> 设默认
                  </button>
                )}
                <button onClick={() => openEdit(m)} className="btn-ghost" title="编辑">
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => remove(m.id)}
                  className="btn-ghost text-red-500 hover:text-red-600"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showModal && (
        <ModelFormModal
          editing={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetch() }}
        />
      )}
    </div>
  )
}
