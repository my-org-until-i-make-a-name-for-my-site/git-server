import { useState, useEffect } from 'react'
import { SparkleIcon, XIcon } from './Icons'
import './AIAssistant.css'

function AIAssistant({ user }) {
    const [isOpen, setIsOpen] = useState(false)
    const [prompt, setPrompt] = useState('')
    const [response, setResponse] = useState('')
    const [loading, setLoading] = useState(false)
    const [usage, setUsage] = useState(0)

    useEffect(() => {
        if (isOpen) {
            loadUsage()
        }
    }, [isOpen])

    const loadUsage = async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/settings/usage', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setUsage(data.ai_usage || 0)
        } catch (err) {
            console.error('Failed to load usage:', err)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!prompt.trim() || loading) return

        // Calculate usage (1 character = 0.002%)
        const promptUsage = prompt.length * 0.002

        if (usage + promptUsage > 100) {
            alert('Usage limit exceeded! You have reached 100% of your AI usage quota.')
            return
        }

        setLoading(true)
        try {
            // Call pollinations API
            const imageUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`

            // Update usage in backend
            const token = localStorage.getItem('token')
            await fetch('/api/settings/usage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usage: promptUsage })
            })

            setResponse(imageUrl)
            setUsage(prev => prev + promptUsage)
            setPrompt('')
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
                            <button className="ai-assistant-close" onClick={() => setIsOpen(false)}>
                                <XIcon />
                            </button>
                        </div>

                        <div className="ai-usage-bar">
                            <div className="ai-usage-label">
                                <span>AI Usage</span>
                                <span>{usage.toFixed(2)}% / 100%</span>
                            </div>
                            <div className="ai-usage-progress">
                                <div
                                    className="ai-usage-fill"
                                    style={{ width: `${Math.min(usage, 100)}%` }}
                                />
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="ai-assistant-form">
                            <textarea
                                className="ai-prompt-input"
                                placeholder="Ask AI to help with code generation, explanations, debugging, or improvements..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                rows="4"
                            />
                            <button
                                type="submit"
                                className="ai-submit-btn"
                                disabled={loading || !prompt.trim()}
                            >
                                {loading ? 'Generating...' : 'Generate'}
                            </button>
                        </form>

                        {response && (
                            <div className="ai-response">
                                <h4>Response:</h4>
                                <div className="ai-response-content">
                                    {response.startsWith('http') ? (
                                        <img src={response} alt="AI Generated" style={{ maxWidth: '100%' }} />
                                    ) : (
                                        <p>{response}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}

export default AIAssistant
