import { useState } from 'react'
import { X } from 'lucide-react'
import { modelsApi } from '../../api/modelsApi'
import type { ModelConfig, ModelConfigCreate, ModelProvider, ModelType } from '../../types/models'

const PROVIDERS: { value: ModelProvider; label: string; defaultBase?: string; defaultModel?: string }[] = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { value: 'deepseek', label: 'DeepSeek', defaultBase: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  { value: 'claude', label: 'Claude (Anthropic)', defaultModel: 'claude-3-5-haiku-20241022' },
  { value: 'zhipu', label: '智谱 GLM', defaultBase: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash' },
  { value: 'custom', label: '自定义' },
]

interface Props {
  editing: ModelConfig | null
  onClose: () => void
  onSaved: () => void
}

export function ModelFormModal({ editing, onClose, onSaved }: Props) {
  const providerDef = editing ? PROVIDERS.find(p => p.value === editing.provider) : PROVIDERS[0]

  const [form, setForm] = useState({
    name: editing?.name ?? '',
    provider: (editing?.provider ?? 'openai') as ModelProvider,
    model_type: (editing?.model_type ?? 'text') as ModelType,
    model_name: editing?.model_name ?? providerDef?.defaultModel ?? '',
    base_url: editing?.base_url ?? providerDef?.defaultBase ?? '',
    api_key: '',
    is_default: editing?.is_default ?? false,
    is_enabled: editing?.is_enabled ?? true,
    max_tokens: editing?.max_tokens ?? 4096,
    temperature: editing?.temperature ?? 0.7,
    enable_thinking: editing?.enable_thinking ?? false,
    thinking_budget: editing?.thinking_budget ?? null as number | null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function onProviderChange(p: ModelProvider) {
    const def = PROVIDERS.find(x => x.value === p)
    setForm(f => ({
      ...f,
      provider: p,
      model_name: def?.defaultModel ?? '',
      base_url: def?.defaultBase ?? '',
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) {
        const payload = { ...form, api_key: form.api_key || undefined }
        await modelsApi.update(editing.id, payload)
      } else {
        if (!form.api_key) { setError('API Key 不能为空'); setSaving(false); return }
        await modelsApi.create(form as ModelConfigCreate)
      }
      onSaved()
    } catch (err: unknown) {
      setError(String((err as { message?: string }).message ?? err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">{editing ? '编辑模型' : '添加模型'}</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">显示名称</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：DeepSeek V3" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">提供商</label>
              <select className="input" value={form.provider} onChange={e => onProviderChange(e.target.value as ModelProvider)}>
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">类型</label>
              <select className="input" value={form.model_type} onChange={e => setForm(f => ({ ...f, model_type: e.target.value as ModelType }))}>
                <option value="text">文本生成</option>
                <option value="image">图片生成</option>
                <option value="video">视频生成</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">模型 ID</label>
            <input className="input" value={form.model_name} onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))} placeholder="例：deepseek-chat" required />
          </div>

          <div>
            <label className="label">Base URL（可选，留空使用默认）</label>
            <input className="input" value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} placeholder="https://api.example.com/v1" />
          </div>

          <div>
            <label className="label">API Key{editing && ' （留空保留原有）'}</label>
            <input
              className="input"
              type="password"
              value={form.api_key}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              placeholder={editing ? '不修改请留空' : 'sk-...'}
              required={!editing}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Max Tokens</label>
              <input className="input" type="number" value={form.max_tokens} onChange={e => setForm(f => ({ ...f, max_tokens: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Temperature</label>
              <input className="input" type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.enable_thinking} onChange={e => setForm(f => ({ ...f, enable_thinking: e.target.checked, thinking_budget: e.target.checked ? (f.thinking_budget ?? 4096) : null }))} />
              启用 Thinking（推理模型）
            </label>
            {form.enable_thinking && (
              <div>
                <label className="label">Thinking 预算（token）</label>
                <input className="input" type="number" value={form.thinking_budget ?? ''} onChange={e => setForm(f => ({ ...f, thinking_budget: e.target.value ? Number(e.target.value) : null }))} placeholder="4096" />
                <p className="text-xs text-gray-400 mt-1">限制模型思考过程的 token 数量，防止死循环。建议 4096。</p>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
              设为默认模型
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.is_enabled} onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked }))} />
              启用
            </label>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">取消</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
