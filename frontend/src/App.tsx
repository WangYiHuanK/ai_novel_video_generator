import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProjectsPage } from './components/projects/ProjectsPage'
import { ModelConfigPage } from './components/models/ModelConfigPage'
import { ChatPage } from './components/chat/ChatPage'
import { NovelEditorPage } from './components/novel/NovelEditorPage'
import { ChapterDetailPage } from './components/novel/ChapterDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/models" element={<ModelConfigPage />} />
          <Route path="/projects/:projectId/chat" element={<ChatPage />} />
          <Route path="/projects/:projectId/novel" element={<NovelEditorPage />} />
          <Route path="/projects/:projectId/chapters/:chapterId" element={<ChapterDetailPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
