# 环境依赖清单

## 系统要求

- Python 3.11+
- Node.js 18+（附带 npm）

---

## 后端依赖（Python）

安装命令：
```bash
cd backend
pip install -r requirements.txt
```

### requirements.txt 内容

| 包名 | 版本 | 用途 |
|------|------|------|
| fastapi | 0.115.0 | Web 框架 |
| uvicorn[standard] | 0.30.6 | ASGI 服务器 |
| sqlmodel | 0.0.21 | SQLite ORM（基于 Pydantic + SQLAlchemy） |
| aiosqlite | 0.20.0 | SQLite 异步驱动 |
| openai | 1.51.0 | OpenAI 兼容 API 客户端（支持 DeepSeek/Claude/自定义） |
| cryptography | 43.0.3 | Fernet 对称加密（保护 API Key） |
| python-multipart | 0.0.12 | 文件上传/下载支持 |
| pydantic-settings | 2.5.2 | 配置管理 |
| python-dotenv | 1.0.1 | .env 文件加载 |

---

## 前端依赖（Node.js）

安装命令：
```bash
cd frontend
npm install
```

### 运行时依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| react | ^18.3.1 | UI 框架 |
| react-dom | ^18.3.1 | React DOM 渲染 |
| react-router-dom | ^6.26.2 | 前端路由 |
| zustand | ^5.0.0 | 状态管理 |
| axios | ^1.7.7 | HTTP 客户端 |
| react-markdown | ^9.0.1 | 渲染 AI 输出的 Markdown |
| lucide-react | ^0.447.0 | 图标库 |
| clsx | ^2.1.1 | 条件 className 工具 |
| tailwind-merge | ^2.5.3 | Tailwind class 合并 |

### 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| vite | ^5.4.9 | 构建工具 |
| @vitejs/plugin-react | ^4.3.2 | React 热更新 |
| typescript | ^5.6.3 | TypeScript 编译 |
| tailwindcss | ^3.4.14 | CSS 框架 |
| postcss | ^8.4.47 | CSS 后处理 |
| autoprefixer | ^10.4.20 | CSS 前缀自动补全 |
| @types/react | ^18.3.11 | React 类型定义 |
| @types/react-dom | ^18.3.1 | React DOM 类型定义 |

---

## 启动方式

### 开发模式（两个终端）

终端 1 - 后端：
```bash
cd backend
uvicorn main:app --reload --port 8000
```

终端 2 - 前端：
```bash
cd frontend
npm run dev
```

浏览器访问：http://localhost:5173

### 生产模式

```bash
# 构建前端
cd frontend && npm run build

# 后端同时提供前端静态文件
cd backend && uvicorn main:app --port 8000
```

浏览器访问：http://localhost:8000
