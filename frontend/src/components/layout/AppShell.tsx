import { Link, useLocation } from 'react-router-dom'
import { BookOpen, MessageSquare, Settings, FolderOpen, Film } from 'lucide-react'
import { clsx } from 'clsx'
import { useProjectStore } from '../../store/useProjectStore'

const NAV_ITEMS = [
  { to: '/projects', icon: FolderOpen, label: '项目' },
  { to: '/models', icon: Settings, label: '模型配置' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { current } = useProjectStore()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <nav className="w-14 flex flex-col items-center py-4 gap-2 bg-white border-r border-gray-200">
        <Link to="/projects" className="mb-4">
          <Film size={24} className="text-brand-600" />
        </Link>

        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            title={label}
            className={clsx(
              'p-2.5 rounded-lg transition-colors',
              location.pathname.startsWith(to)
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
            )}
          >
            <Icon size={20} />
          </Link>
        ))}

        {current && (
          <>
            <div className="w-8 border-t border-gray-200 my-1" />
            <Link
              to={`/projects/${current.id}/chat`}
              title="对话"
              className={clsx(
                'p-2.5 rounded-lg transition-colors',
                location.pathname.includes('/chat')
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <MessageSquare size={20} />
            </Link>
            <Link
              to={`/projects/${current.id}/novel`}
              title="小说编辑"
              className={clsx(
                'p-2.5 rounded-lg transition-colors',
                location.pathname.includes('/novel')
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <BookOpen size={20} />
            </Link>
          </>
        )}
      </nav>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
