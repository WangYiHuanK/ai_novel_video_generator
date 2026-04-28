import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, BookOpen, MessageSquare } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { NewProjectModal } from './NewProjectModal'
import type { Project } from '../../types/projects'
import { GENRE_LABELS, STYLE_LABELS } from '../../types/projects'
import { clsx } from 'clsx'

function ProjectCard({ project, onDelete, onOpen }: { project: Project; onDelete: () => void; onOpen: (tab: 'chat' | 'novel') => void }) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{project.description || '暂无描述'}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="btn-ghost p-1 text-red-500 hover:text-red-600 shrink-0 ml-2"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          {GENRE_LABELS[project.genre]}
        </span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          {STYLE_LABELS[project.style]}
        </span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          {project.chapter_count} 章 · {project.word_count.toLocaleString()} 字
        </span>
      </div>

      <div className="flex gap-2 mt-auto pt-1">
        <button onClick={() => onOpen('chat')} className="btn-primary flex-1 justify-center text-xs">
          <MessageSquare size={13} /> 对话创作
        </button>
        <button onClick={() => onOpen('novel')} className={clsx('btn-ghost flex-1 justify-center text-xs border border-gray-200', project.chapter_count === 0 && 'opacity-50')}>
          <BookOpen size={13} /> 小说编辑
        </button>
      </div>
    </div>
  )
}

export function ProjectsPage() {
  const { projects, loading, fetch, remove, setCurrent } = useProjectStore()
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetch() }, [])

  function handleOpen(project: Project, tab: 'chat' | 'novel') {
    setCurrent(project)
    navigate(`/projects/${project.id}/${tab}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">我的项目</h1>
          <p className="text-sm text-gray-500 mt-0.5">每个项目对应一个独立故事</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> 新建项目
        </button>
      </div>

      {loading && <p className="text-gray-500 text-sm">加载中...</p>}

      {!loading && projects.length === 0 && (
        <div className="card p-16 text-center">
          <BookOpen size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">还没有项目</p>
          <p className="text-gray-400 text-sm mt-1">点击「新建项目」开始创作</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            onDelete={() => remove(p.id)}
            onOpen={(tab) => handleOpen(p, tab)}
          />
        ))}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={(p) => { setShowModal(false); setCurrent(p); navigate(`/projects/${p.id}/chat`) }}
        />
      )}
    </div>
  )
}
