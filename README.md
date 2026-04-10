# AI Novel Video Generator

AI 驱动的小说创作工具，支持对话式写作、章节编辑与导出。

---

## 功能

- **模型配置**：支持 OpenAI、DeepSeek、Claude、智谱等，可自定义 BaseURL 和 API Key
- **项目管理**：每个故事独立项目，保存对话历史和章节文件
- **对话写作**：流式输出，内置大纲/章节/人物/世界观等预设提示词
- **小说编辑器**：章节管理，自动保存，支持导出 .md / .txt

---

## 开发模式运行

### 环境要求

- Python 3.9+
- Node.js 18+

### 安装依赖

```bash
pip install -r backend/requirements.txt
cd frontend && npm install
```

### 启动

```bash
python start.py
```

启动后访问：`http://localhost:5173`

---

## 打包为 Windows 安装包

> 需要在 **Windows** 机器上执行以下步骤。

### 第一步：安装依赖

```bat
pip install -r backend\requirements.txt
```

### 第二步：构建

双击 `build.bat`，或在命令行运行：

```bat
python build.py
```

构建流程：
1. `npm run build` 编译前端为静态文件
2. PyInstaller 将 Python + 所有依赖 + 前端文件打包为独立程序

输出：`dist\AINovelVideoGenerator\AINovelVideoGenerator.exe`

### 第三步：制作安装包（可选）

1. 安装 [Inno Setup](https://jrsoftware.org/isinfo.php)
2. 用 Inno Setup 打开 `installer\setup.iss`
3. 点击 Build → 生成 `installer\AINovelVideoGenerator-Setup.exe`

### 最终用户体验

1. 双击 `AINovelVideoGenerator-Setup.exe`，按向导安装
2. 桌面出现快捷方式，双击启动
3. 浏览器自动打开应用，无需安装 Python 或 Node.js

### 用户数据存储位置

| 数据类型 | 路径 |
|----------|------|
| 设置、数据库、密钥 | `%APPDATA%\AINovelVideoGenerator\` |
| 小说项目文件 | `Documents\AI小说项目\` |

---

## 项目结构

```
ai_novel_video_generator/
├── backend/                  # FastAPI 后端
│   ├── main.py               # 应用入口
│   ├── config.py             # 路径配置（支持打包模式）
│   ├── app_launcher.py       # PyInstaller 启动入口
│   ├── routers/              # API 路由
│   ├── services/             # 业务逻辑
│   ├── models/               # Pydantic 数据模型
│   ├── db/                   # SQLite 数据库
│   └── utils/                # 加密、文件工具
├── frontend/                 # React + TypeScript 前端
│   └── src/
│       ├── components/       # 页面组件
│       ├── store/            # Zustand 状态管理
│       ├── hooks/            # SSE 流式读取等
│       └── api/              # axios 接口封装
├── installer/
│   └── setup.iss             # Inno Setup 安装包脚本
├── app.spec                  # PyInstaller 打包配置
├── build.py                  # 自动化构建脚本
├── build.bat                 # Windows 一键构建
├── start.py                  # 开发模式启动（前端+后端）
└── start.bat                 # Windows 开发启动
```
