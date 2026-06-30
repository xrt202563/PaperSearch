import { useState, useRef, useEffect, useCallback } from 'react'
import './ChatBot.css'

const DIFY_BASE_URL = 'https://api.dify.ai/v1'
const DIFY_API_KEY = import.meta.env.VITE_DIFY_API_KEY || 'app-U2j2FzY8MlcCFNQ9XbMmx3Bn'

// 应用模式对应的 API 端点
const API_ENDPOINTS = {
  chat: '/chat-messages',
  completion: '/completion-messages',
  workflow: '/workflows/run',
}

function getUserId() {
  let userId = localStorage.getItem('dify_user_id')
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substring(2, 11)
    localStorage.setItem('dify_user_id', userId)
  }
  return userId
}

function ChatBot() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [useStream, setUseStream] = useState(true)
  const [appMode, setAppMode] = useState('auto')
  const [detectedMode, setDetectedMode] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortControllerRef = useRef(null)
  const userId = useRef(getUserId()).current

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, scrollToBottom])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const getApiUrl = (mode) => {
    const effectiveMode = mode === 'auto' ? (detectedMode || 'chat') : mode
    const endpoint = API_ENDPOINTS[effectiveMode] || API_ENDPOINTS.chat
    return `${DIFY_BASE_URL}${endpoint}`
  }

  // 自动检测应用模式：依次尝试 workflow → chat → completion
  const detectAppMode = async (userInput) => {
    if (appMode !== 'auto' || detectedMode) {
      return appMode === 'auto' ? detectedMode : appMode
    }

    const testModes = ['workflow', 'chat', 'completion']

    for (const mode of testModes) {
      try {
        const apiUrl = getApiUrl(mode)
        let body

        if (mode === 'workflow') {
          body = { inputs: { keyword: userInput }, response_mode: 'blocking', user: userId }
        } else if (mode === 'completion') {
          body = { inputs: {}, query: userInput, response_mode: 'blocking', user: userId }
        } else {
          body = { inputs: {}, query: userInput, response_mode: 'blocking', user: userId }
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DIFY_API_KEY}`,
          },
          body: JSON.stringify(body),
        })

        if (response.ok) {
          setDetectedMode(mode)
          return mode
        }

        const data = await response.json().catch(() => ({}))
        // invalid_param 说明端点对了，只是参数格式需要调整
        if (data.code === 'invalid_param') {
          setDetectedMode(mode)
          return mode
        }
      } catch (e) {
        // 继续尝试下一个
      }
    }

    setDetectedMode('workflow')
    return 'workflow'
  }

  // 发送 Workflow 消息
  const sendWorkflowMessage = async (userInput, apiUrl, stream) => {
    const controller = new AbortController()
    abortControllerRef.current = controller

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DIFY_API_KEY}`,
      },
      body: JSON.stringify({
        inputs: { keyword: userInput },
        response_mode: stream ? 'streaming' : 'blocking',
        user: userId,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || `请求失败 (${response.status})`)
    }

    if (stream) {
      // 流式读取
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const event = JSON.parse(dataStr)
            // workflow 流式事件可能包含 text 或 answer
            if (event.event === 'workflow_finished' || event.event === 'message_end') {
              if (event.data?.outputs) {
                // 尝试获取输出
                const outputs = event.data.outputs
                fullContent = typeof outputs.out === 'string' ? outputs.out
                  : (outputs.text || outputs.answer || JSON.stringify(outputs))
                setStreamingContent(fullContent)
              }
            } else if (event.event === 'text_chunk' || event.event === 'message') {
              const chunk = event.data?.text || event.answer || ''
              fullContent += chunk
              setStreamingContent(fullContent)
            } else if (event.data?.outputs) {
              const outputs = event.data.outputs
              fullContent = typeof outputs.out === 'string' ? outputs.out
                : (outputs.text || outputs.answer || JSON.stringify(outputs))
              setStreamingContent(fullContent)
            }
          } catch (parseErr) {
            // 忽略解析错误
          }
        }
      }

      if (fullContent) {
        setMessages(prev => [...prev, { role: 'bot', content: fullContent }])
      }
    } else {
      // 阻塞模式
      const data = await response.json()
      let answer = ''

      if (data.data?.outputs) {
        const outputs = data.data.outputs
        answer = typeof outputs.out === 'string' ? outputs.out
          : (outputs.text || outputs.answer || JSON.stringify(outputs))
      } else if (data.answer) {
        answer = data.answer
      }

      setMessages(prev => [...prev, { role: 'bot', content: answer || '已完成，但未获取到输出内容' }])
    }
  }

  // 发送 Chat 消息
  const sendChatMessage = async (userInput, apiUrl, stream) => {
    const controller = new AbortController()
    abortControllerRef.current = controller

    const requestBody = {
      inputs: {},
      query: userInput,
      response_mode: stream ? 'streaming' : 'blocking',
      user: userId,
    }
    if (conversationId) {
      requestBody.conversation_id = conversationId
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DIFY_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || `请求失败 (${response.status})`)
    }

    if (stream) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const event = JSON.parse(dataStr)
            if (event.event === 'message' || event.event === 'agent_message') {
              fullContent += event.answer || ''
              setStreamingContent(fullContent)
            } else if (event.event === 'message_end') {
              if (event.conversation_id) setConversationId(event.conversation_id)
            } else if (event.event === 'error') {
              throw new Error(event.message || '流式响应出错')
            }
          } catch (parseErr) {
            if (parseErr.message?.includes('流式响应') || parseErr.message?.includes('请求失败')) {
              throw parseErr
            }
          }
        }
      }

      if (fullContent) {
        setMessages(prev => [...prev, { role: 'bot', content: fullContent }])
      }
    } else {
      const data = await response.json()
      if (data.conversation_id) setConversationId(data.conversation_id)
      setMessages(prev => [...prev, { role: 'bot', content: data.answer }])
    }
  }

  // 发送 Completion 消息
  const sendCompletionMessage = async (userInput, apiUrl, stream) => {
    const controller = new AbortController()
    abortControllerRef.current = controller

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DIFY_API_KEY}`,
      },
      body: JSON.stringify({
        inputs: {},
        query: userInput,
        response_mode: stream ? 'streaming' : 'blocking',
        user: userId,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || `请求失败 (${response.status})`)
    }

    if (stream) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const event = JSON.parse(dataStr)
            if (event.answer !== undefined) {
              setStreamingContent(event.answer)
            } else if (event.event === 'message') {
              setStreamingContent(prev => prev + (event.answer || ''))
            } else if (event.event === 'error') {
              throw new Error(event.message || '流式响应出错')
            }
          } catch (parseErr) {
            if (parseErr.message?.includes('流式响应') || parseErr.message?.includes('请求失败')) {
              throw parseErr
            }
          }
        }
      }
    } else {
      const data = await response.json()
      setMessages(prev => [...prev, { role: 'bot', content: data.answer }])
    }
  }

  // 发送消息主函数
  const sendMessage = async (e) => {
    e?.preventDefault()
    const userInput = input.trim()
    if (!userInput || loading) return

    const userMessage = { role: 'user', content: userInput }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const mode = await detectAppMode(userInput)
      const apiUrl = getApiUrl(mode)

      if (mode === 'workflow') {
        await sendWorkflowMessage(userInput, apiUrl, useStream)
      } else if (mode === 'completion') {
        await sendCompletionMessage(userInput, apiUrl, useStream)
      } else {
        await sendChatMessage(userInput, apiUrl, useStream)
      }
    } catch (error) {
      if (error.name === 'AbortError') return
      const errorMessage = {
        role: 'bot',
        content: `抱歉，发生了错误：${error.message}`,
        isError: true,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      if (streamingContent) {
        setMessages(prev => [...prev, { role: 'bot', content: streamingContent + ' [已停止]' }])
        setStreamingContent('')
      }
      setLoading(false)
    }
  }

  const newConversation = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    setMessages([])
    setConversationId('')
    setStreamingContent('')
    setInput('')
    setLoading(false)
    setDetectedMode(null)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }

  const renderContent = (content) => {
    if (!content) return null
    return content.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ))
  }

  const copyMessage = (content) => {
    navigator.clipboard.writeText(content).catch(() => {})
  }

  const getModeLabel = () => {
    if (appMode !== 'auto') {
      const labels = { chat: '对话模式', completion: '文本生成模式', workflow: '工作流模式' }
      return labels[appMode] || appMode
    }
    const labels = { chat: '对话模式', completion: '文本生成模式', workflow: '工作流模式' }
    return detectedMode ? labels[detectedMode] : '自动检测'
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="header-content">
          <div className="header-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--primary)" />
              <path d="M10 16a6 6 0 1 1 12 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="12" r="2" fill="white" />
              <path d="M16 14v8M12 20h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <h1>Dify AI 助手</h1>
              <span className="header-status">
                <span className="status-dot"></span>
                在线 · {getModeLabel()}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <select
              className="mode-select"
              value={appMode}
              onChange={(e) => { setAppMode(e.target.value); setDetectedMode(null) }}
              title="切换应用模式"
            >
              <option value="auto">自动检测</option>
              <option value="workflow">工作流</option>
              <option value="chat">对话模式</option>
              <option value="completion">文本生成</option>
            </select>
            <label className="stream-toggle" title="切换流式/阻塞模式">
              <input type="checkbox" checked={useStream} onChange={(e) => setUseStream(e.target.checked)} />
              <span className="toggle-label">流式</span>
            </label>
            <button className="btn-new-chat" onClick={newConversation} title="新建对话">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>新对话</span>
            </button>
          </div>
        </div>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="28" stroke="var(--primary)" strokeWidth="2" strokeDasharray="8 4" />
                <path d="M24 28h16M24 34h10" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h2>有什么我可以帮你的？</h2>
            <p>在下方输入你的问题，AI 助手将为你解答</p>
            <div className="quick-actions">
              <button onClick={() => setInput('深度学习')} className="quick-btn">深度学习</button>
              <button onClick={() => setInput('Python 编程')} className="quick-btn">Python 编程</button>
              <button onClick={() => setInput('人工智能')} className="quick-btn">人工智能</button>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`message-wrapper ${msg.role === 'user' ? 'user' : 'bot'}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? (
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="16" fill="#818cf8" />
                  <circle cx="16" cy="12" r="5" fill="white" />
                  <ellipse cx="16" cy="28" rx="10" ry="7" fill="white" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect width="32" height="32" rx="8" fill="var(--primary)" />
                  <path d="M10 16a6 6 0 1 1 12 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="16" cy="12" r="2" fill="white" />
                  <path d="M16 14v8M12 20h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="message-content">
              <div className={`message-bubble ${msg.isError ? 'error' : ''}`}>
                {renderContent(msg.content)}
              </div>
              {msg.role === 'bot' && !msg.isError && (
                <button className="btn-copy" onClick={() => copyMessage(msg.content)} title="复制">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M2 10V2.5A.5.5 0 012.5 2H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="message-wrapper bot">
            <div className="message-avatar">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="var(--primary)" />
                <path d="M10 16a6 6 0 1 1 12 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <circle cx="16" cy="12" r="2" fill="white" />
                <path d="M16 14v8M12 20h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="message-bubble streaming">
              {renderContent(streamingContent)}
              <span className="cursor-blink">|</span>
            </div>
          </div>
        )}

        {loading && !streamingContent && !useStream && (
          <div className="message-wrapper bot">
            <div className="message-avatar">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="var(--primary)" />
                <path d="M10 16a6 6 0 1 1 12 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <circle cx="16" cy="12" r="2" fill="white" />
                <path d="M16 14v8M12 20h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="message-bubble typing">
              <div className="typing-dots"><span></span><span></span><span></span></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form className="input-container" onSubmit={sendMessage}>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入关键词搜索论文... (Shift+Enter 换行)"
            rows={1}
            disabled={loading}
          />
          {loading && useStream ? (
            <button type="button" className="btn-stop" onClick={stopGeneration} title="停止生成">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button type="submit" className="btn-send" disabled={!input.trim() || loading} title="发送">
              {loading ? (
                <svg className="spinner" width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="30 70" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M2 10l16-8-8 16-2-5-6-3z" fill="currentColor" />
                </svg>
              )}
            </button>
          )}
        </form>
        <p className="input-hint">AI 生成的内容仅供参考，请核实重要信息</p>
      </div>
    </div>
  )
}

export default ChatBot
