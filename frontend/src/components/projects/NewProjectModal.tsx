import { useState } from 'react'
import { X } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import type { Genre, Project, WritingStyle } from '../../types/projects'
import { GENRE_LABELS, STYLE_LABELS } from '../../types/projects'

interface Props {
  onClose: () => void
  onCreated: (p: Project) => void
}

export function NewProjectModal({ onClose, onCreated }: Props) {
  const { create } = useProjectStore()
  const [form, setForm] = useState({
    name: '',
    description: '',
    genre: 'other' as Genre,
    style: 'commercial' as WritingStyle,
    language: 'zh',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const project = await create(form)
      onCreated(project)
    } catch (err: unknown) {
      setError(String((err as { message?: string }).message ?? err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">新建项目</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">项目名称</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="我的故事" required />
          </div>

          <div>
            <label className="label">简介（可选）</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="故事简介..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">题材</label>
              <select className="input" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value as Genre }))}>
                {(Object.entries(GENRE_LABELS) as [Genre, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">风格</label>
              <select className="input" value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value as WritingStyle }))}>
                {(Object.entries(STYLE_LABELS) as [WritingStyle, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">语言</label>
            <select className="input" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">取消</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
