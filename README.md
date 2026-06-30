# Dify AI 聊天助手

基于 React + Vite 构建的 AI 聊天机器人，接入 [Dify](https://dify.ai) API，支持多种应用模式。

## 功能特性

- 🎨 美观的聊天气泡界面，支持用户/AI 头像区分
- 🔌 接入 Dify Chat API，支持多种应用模式：
  - **工作流 (Workflow)** — `/v1/workflows/run`
  - **对话 (Chatbot/Chatflow)** — `/v1/chat-messages`
  - **文本生成 (Completion)** — `/v1/completion-messages`
- 🔍 **自动检测应用模式** — 首次发送消息时自动探测正确的 API 端点
- ⚡ **流式响应 (SSE)** — 实时显示 AI 回复，带闪烁光标效果
- 🛑 流式模式下可随时停止生成
- 💬 多轮对话支持（自动保存 `conversation_id`）
- 📋 一键复制 AI 回复内容
- 🔄 一键开启新对话
- 📱 响应式设计，适配桌面端和移动端
- 🔑 API Key 通过环境变量管理，安全可靠

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/xrt202563/PaperSearch.git
cd PaperSearch
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 API Key

复制 `.env.example` 为 `.env`，并填入你的 Dify API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```
VITE_DIFY_API_KEY=你的Dify_API_Key
```

### 4. 启动开发服务器

```bash
npm run dev
```

浏览器访问 `http://localhost:5173` 即可使用。

### 5. 构建生产版本

```bash
npm run build
npm run preview
```

## 项目结构

```
dify-chatbot/
├── index.html            # 入口 HTML
├── vite.config.js        # Vite 配置
├── package.json          # 项目依赖
├── .env.example          # 环境变量示例
└── src/
    ├── main.jsx          # React 入口
    ├── App.jsx           # 根组件
    ├── ChatBot.jsx       # 聊天机器人核心组件
    ├── ChatBot.css       # 聊天界面样式
    └── index.css         # 全局样式
```

## 技术栈

- **React 19** — UI 框架
- **Vite 8** — 构建工具
- **Dify API** — AI 对话服务

## Dify API 模式说明

本应用自动支持以下三种 Dify 应用模式：

| 模式 | API 端点 | 适用场景 |
|------|----------|----------|
| 工作流 | `/v1/workflows/run` | 工作流编排应用 |
| 对话 | `/v1/chat-messages` | Chatbot / Chatflow |
| 文本生成 | `/v1/completion-messages` | 文本生成应用 |

默认使用「自动检测」模式，首次发送消息时会依次尝试以上端点，找到匹配的模式后自动锁定。

你也可以通过界面顶部的下拉菜单手动切换模式。

## 使用说明

1. 在底部输入框输入问题（如"深度学习"）
2. 按 `Enter` 发送，`Shift + Enter` 换行
3. AI 会实时流式返回答案
4. 悬停 AI 回复可复制内容
5. 点击「新对话」可清空历史

## License

MIT
