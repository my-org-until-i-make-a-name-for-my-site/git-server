import { useState, useEffect } from 'react'
import { SparkleIcon, XIcon } from './Icons'
import './AIAssistant.css'

function AIAssistant({ user }) {
    const [isOpen, setIsOpen] = useState(false)
    const [prompt, setPrompt] = useState('')
    const [response, setResponse] = useState('')
    const [loading, setLoading] = useState(false)
    const [usage, setUsage] = useState(0)
    const [usageLimit, setUsageLimit] = useState(100)
    const [chats, setChats] = useState([])
    const [activeChatId, setActiveChatId] = useState(null)
    const [messages, setMessages] = useState([])
    const [attachments, setAttachments] = useState([])
    const [taskSessionActive, setTaskSessionActive] = useState(false)
    const [taskSessionId, setTaskSessionId] = useState(null)
    const [taskUsage, setTaskUsage] = useState(null)
    const [activeTab, setActiveTab] = useState('chat') // 'chat' or 'task'

    useEffect(() => {
        if (isOpen) {
            loadUsage()
            loadChats()
            loadTaskUsage()
        }
    }, [isOpen])

    useEffect(() => {
        if (activeChatId) {
            loadChat(activeChatId)
        }
    }, [activeChatId])

    const loadUsage = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings/usage', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setUsage(data.ai_usage || 0)
            setUsageLimit(data.ai_usage_limit || 100)
        } catch (err) {
            console.error('Failed to load usage:', err)
        }
    }

    const loadTaskUsage = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/ai/task-sessions/usage', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setTaskUsage(data)
        } catch (err) {
            console.error('Failed to load task usage:', err)
        }
    }

    const loadChats = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/ai/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setChats(data.chats || [])
            if (!activeChatId && data.chats?.length > 0) {
                setActiveChatId(data.chats[0].id)
            }
        } catch (err) {
            console.error('Failed to load chats:', err)
        }
    }

    const loadChat = async (chatId) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/ai/chats/${chatId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setMessages(data.messages || [])
        } catch (err) {
            console.error('Failed to load chat:', err)
        }
    }

    const createChat = async (autoTitle = null) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/ai/chats', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: autoTitle || 'New Chat' })
            })
            const data = await res.json()
            if (data.chat) {
                setChats(prev => [data.chat, ...prev])
                setActiveChatId(data.chat.id)
                setMessages([])
                return data.chat.id
            }
        } catch (err) {
            console.error('Failed to create chat:', err)
        }
        return null
    }

    const generateChatTitle = async (firstMessage) => {
        try {
            // Generate a short title from the first message using AI
            const titlePrompt = `Generate a very short 3-5 word title for a chat that starts with: "${firstMessage.substring(0, 100)}"`
            const aiUrl = `https://text.pollinations.ai/${encodeURIComponent(titlePrompt)}`
            const aiRes = await fetch(aiUrl)
            const title = await aiRes.text()
            // Clean up the title - remove quotes and limit length
            return title.replace(/['"]/g, '').substring(0, 50).trim()
        } catch (err) {
            console.error('Failed to generate title:', err)
            return 'New Chat'
        }
    }

    const updateChatTitle = async (chatId, title) => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/ai/chats/${chatId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title })
            })
            setChats(prev => prev.map(chat => 
                chat.id === chatId ? { ...chat, title } : chat
            ))
        } catch (err) {
            console.error('Failed to update chat title:', err)
        }
    }

    const startTaskSession = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/ai/task-sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ chatId: activeChatId })
            })
            const data = await res.json()
            
            if (res.ok) {
                setTaskSessionActive(true)
                setTaskSessionId(data.sessionId)
                alert(`Task session started! You have ${data.remainingHours} hours remaining this month.`)
            } else {
                alert(data.error || 'Failed to start task session')
            }
        } catch (err) {
            console.error('Failed to start task session:', err)
            alert('Failed to start task session')
        }
    }

    const endTaskSession = async () => {
        if (!taskSessionId) return
        
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/ai/task-sessions/${taskSessionId}/end`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            
            if (res.ok) {
                setTaskSessionActive(false)
                setTaskSessionId(null)
                loadTaskUsage()
                alert(`Task session ended. Duration: ${data.durationMinutes} minutes`)
            } else {
                alert(data.error || 'Failed to end task session')
            }
        } catch (err) {
            console.error('Failed to end task session:', err)
            alert('Failed to end task session')
        }
    }

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result || ''
            const base64 = typeof result === 'string' ? result.split(',')[1] || '' : ''
            resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!prompt.trim() || loading) return

        // Calculate usage (1 character = 0.002%)
        const promptUsage = prompt.length * 0.002

        if (usage + promptUsage > usageLimit) {
            alert(`Usage limit exceeded! You have reached ${usageLimit}% of your AI usage quota.`)
            return
        }

        setLoading(true)
        try {
            const token = localStorage.getItem('token')
            const attachmentPayload = await Promise.all(
                attachments.map(async (file) => ({
                    name: file.name,
                    mime_type: file.type || 'application/octet-stream',
                    data: await fileToBase64(file)
                }))
            )

            let chatId = activeChatId
            if (!chatId) {
                chatId = await createChat()
            }
            if (!chatId) {
                setResponse('Error: Unable to create chat')
                return
            }

            const isFirstMessage = messages.length === 0

            const res = await fetch(`/api/ai/chats/${chatId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: prompt,
                    attachments: attachmentPayload
                })
            })
            const data = await res.json()

            if (res.ok) {
                setMessages(prev => ([
                    ...prev,
                    {
                        id: `local-${Date.now()}`,
                        role: 'user',
                        content: prompt,
                        attachments: attachmentPayload
                    },
                    data.message
                ]))
                setResponse(data.message?.content || '')
                setUsage(prev => prev + promptUsage)
                
                const currentPrompt = prompt
                setPrompt('')
                setAttachments([])
                
                // Auto-generate chat title from first message
                if (isFirstMessage) {
                    const title = await generateChatTitle(currentPrompt)
                    await updateChatTitle(chatId, title)
                }
                
                loadChats()
                loadUsage()
            } else {
                setResponse(data.error || 'Error: Failed to generate response')
            }
        } catch (err) {
            console.error('AI request failed:', err)
            setResponse('Error: Failed to generate response')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <button className="ai-assistant-trigger" onClick={() => setIsOpen(!isOpen)} title="AI Assistant">
                <SparkleIcon />
            </button>

            {isOpen && (
                <div className="ai-assistant-modal">
                    <div className="ai-assistant-content">
                        <div className="ai-assistant-header">
                            <div className="ai-assistant-title">
                                <SparkleIcon />
                                <h3>AI Code Assistant</h3>
                            </div>
                            <button className="ai-assistant-close" onClick={() => setIsOpen(false)} title="Close">
                                <XIcon />
                            </button>
                        </div>

                        <div className="ai-usage-bar">
                            <div className="ai-usage-label">
                                <span>Chat Usage</span>
                                <span>{usage.toFixed(2)}% / {usageLimit}%</span>
                            </div>
                            <div className="ai-usage-progress">
                                <div
                                    className="ai-usage-fill"
                                    style={{ width: `${Math.min((usage / usageLimit) * 100, 100)}%` }}
                                />
                            </div>
                            {taskUsage && (
                                <>
                                    <div className="ai-usage-label" style={{ marginTop: '0.5rem' }}>
                                        <span>Task Sessions (Monthly)</span>
                                        <span>{taskUsage.usedHours}h / {taskUsage.maxHours}h</span>
                                    </div>
                                    <div className="ai-usage-progress">
                                        <div
                                            className="ai-usage-fill"
                                            style={{ 
                                                width: `${Math.min((taskUsage.usedHours / taskUsage.maxHours) * 100, 100)}%`,
                                                background: 'linear-gradient(90deg, #28a745, #20c997)'
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="ai-tabs">
                            <button 
                                className={`ai-tab ${activeTab === 'chat' ? 'active' : ''}`}
                                onClick={() => setActiveTab('chat')}
                            >
                                Chat
                            </button>
                            <button 
                                className={`ai-tab ${activeTab === 'task' ? 'active' : ''}`}
                                onClick={() => setActiveTab('task')}
                            >
                                Task Sessions
                            </button>
                        </div>

                        <div className="ai-assistant-body">
                            {activeTab === 'chat' && (
                                <>
                                    <div className="ai-chat-list">
                                        <div className="ai-chat-list-header">
                                            <h4>Chats</h4>
                                            <button className="ai-new-chat-btn" onClick={() => createChat()}>New</button>
                                        </div>
                                        <div className="ai-chat-items">
                                            {chats.length === 0 ? (
                                                <div className="ai-chat-empty">No chats yet</div>
                                            ) : (
                                                chats.map(chat => (
                                                    <button
                                                        key={chat.id}
                                                        className={`ai-chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                                                        onClick={() => setActiveChatId(chat.id)}
                                                        title={chat.title}
                                                    >
                                                        {chat.title}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <div className="ai-main-content">
                                        <div className="ai-chat-messages">
                                            {messages.length === 0 ? (
                                                <div className="ai-chat-empty">Start a conversation to see messages here.</div>
                                            ) : (
                                                messages.map(msg => (
                                                    <div key={msg.id} className={`ai-chat-message ${msg.role}`}>
                                                        <div className="ai-chat-role">{msg.role === 'assistant' ? 'Assistant' : 'You'}</div>
                                                        <div className="ai-chat-content">{msg.content}</div>
                                                        {msg.attachments && msg.attachments.length > 0 && (
                                                            <div className="ai-chat-attachments">
                                                                {msg.attachments.map(att => (
                                                                    <div key={att.id || att.name} className="ai-chat-attachment">
                                                                        {att.name}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <form onSubmit={handleSubmit} className="ai-assistant-form">
                                            <textarea
                                                className="ai-prompt-input"
                                                placeholder="Ask AI to help with code generation, explanations, debugging, or improvements..."
                                                value={prompt}
                                                onChange={(e) => setPrompt(e.target.value)}
                                                rows="4"
                                            />
                                            <div className="ai-attachments">
                                                <input
                                                    type="file"
                                                    multiple
                                                    onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                                                />
                                                {attachments.length > 0 && (
                                                    <div className="ai-attachment-list">
                                                        {attachments.map(file => (
                                                            <span key={file.name} className="ai-attachment-chip">{file.name}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="submit"
                                                className="ai-submit-btn"
                                                disabled={loading || !prompt.trim()}
                                            >
                                                {loading ? 'Generating...' : 'Generate'}
                                            </button>
                                        </form>
                                    </div>
                                </>
                            )}

                            {activeTab === 'task' && (
                                <div className="ai-task-session-container">
                                    <div className="ai-task-info">
                                        <h3>AI Task Sessions</h3>
                                        <p>
                                            Task sessions grant the AI access to a terminal and repository operations.
                                            The AI can read all repositories and push to repositories you own.
                                        </p>
                                        {taskUsage && (
                                            <div className="ai-task-usage-info">
                                                <p><strong>Monthly Limit:</strong> {taskUsage.maxHours} hours</p>
                                                <p><strong>Used This Month:</strong> {taskUsage.usedHours} hours</p>
                                                <p><strong>Remaining:</strong> {taskUsage.remainingHours} hours</p>
                                            </div>
                                        )}
                                    </div>

                                    {!taskSessionActive ? (
                                        <div className="ai-task-controls">
                                            <button 
                                                className="ai-task-btn start"
                                                onClick={startTaskSession}
                                                disabled={taskUsage && taskUsage.remainingHours <= 0}
                                            >
                                                Start Task Session
                                            </button>
                                            {taskUsage && taskUsage.remainingHours <= 0 && (
                                                <p className="ai-task-warning">You have reached your monthly task session limit.</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="ai-task-controls">
                                            <div className="ai-task-active">
                                                <p><strong>Task Session Active</strong></p>
                                                <p>The AI now has access to terminal and repository operations.</p>
                                            </div>
                                            <button 
                                                className="ai-task-btn end"
                                                onClick={endTaskSession}
                                            >
                                                End Task Session
                                            </button>
                                        </div>
                                    )}

                                    <div className="ai-task-permissions">
                                        <h4>Permissions</h4>
                                        <ul>
                                            <li>✓ Terminal access (bash commands)</li>
                                            <li>✓ Read access to all repositories in the database</li>
                                            <li>✓ Push access to repositories you own</li>
                                            <li>✗ No access to repositories owned by others</li>
                                            <li>✗ No system-level access</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default AIAssistant
