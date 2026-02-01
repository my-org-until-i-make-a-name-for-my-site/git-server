import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import { IssueIcon, CommentIcon, XIcon, CheckIcon } from '../components/Icons'
import './IssueDetail.css'

function IssueDetail({ user, logout }) {
    const { owner, repo, number } = useParams()
    const [issue, setIssue] = useState(null)
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        loadIssue()
        loadComments()
    }, [owner, repo, number])

    const loadIssue = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/issues/${number}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setIssue(data.issue)
            setLoading(false)
        } catch (err) {
            console.error('Failed to load issue:', err)
            setError('Failed to load issue')
            setLoading(false)
        }
    }

    const loadComments = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/issues/${number}/comments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setComments(data.comments || [])
        } catch (err) {
            console.error('Failed to load comments:', err)
        }
    }

    const addComment = async (e) => {
        e.preventDefault()
        if (!newComment.trim()) return

        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/issues/${number}/comments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ body: newComment })
            })
            const data = await response.json()
            setComments([...comments, data.comment])
            setNewComment('')
        } catch (err) {
            console.error('Failed to add comment:', err)
            alert('Failed to add comment')
        }
    }

    const closeIssue = async () => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/${owner}/${repo}/issues/${number}/close`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            setIssue({ ...issue, state: 'closed' })
        } catch (err) {
            console.error('Failed to close issue:', err)
            alert('Failed to close issue')
        }
    }

    const reopenIssue = async () => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/${owner}/${repo}/issues/${number}/reopen`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            setIssue({ ...issue, state: 'open' })
        } catch (err) {
            console.error('Failed to reopen issue:', err)
            alert('Failed to reopen issue')
        }
    }

    if (loading) {
        return (
            <div>
                <Header user={user} logout={logout} />
                <div className="container">Loading...</div>
            </div>
        )
    }

    if (error || !issue) {
        return (
            <div>
                <Header user={user} logout={logout} />
                <div className="container">{error || 'Issue not found'}</div>
            </div>
        )
    }

    return (
        <div className="issue-detail-page">
            <Header user={user} logout={logout} />

            <div className="issue-detail-container">
                <div className="issue-breadcrumb">
                    <Link to={`/${owner}/${repo}`}>{owner}/{repo}</Link>
                    <span>/</span>
                    <Link to={`/${owner}/${repo}/issues`}>Issues</Link>
                    <span>/</span>
                    <span>#{number}</span>
                </div>

                <div className="issue-header">
                    <div className="issue-title-row">
                        <h1 className="issue-title-text">{issue.title}</h1>
                        <span className={`issue-state-badge ${issue.state}`}>
                            {issue.state === 'open' ? (
                                <>
                                    <IssueIcon />
                                    <span>Open</span>
                                </>
                            ) : (
                                <>
                                    <CheckIcon />
                                    <span>Closed</span>
                                </>
                            )}
                        </span>
                    </div>
                    <div className="issue-meta-row">
                        <span className="issue-number">#{issue.issue_number}</span>
                        <span className="issue-author">
                            opened by <Link to={`/profile/${issue.author_name}`}>{issue.author_name}</Link>
                        </span>
                        <span className="issue-date">
                            {new Date(issue.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>

                <div className="issue-content-layout">
                    <div className="issue-main-content">
                        <div className="issue-body-card">
                            <div className="comment-header">
                                <div className="comment-author-info">
                                    <Link to={`/profile/${issue.author_name}`} className="comment-author">
                                        {issue.author_name}
                                    </Link>
                                    <span className="comment-date">
                                        commented on {new Date(issue.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                            <div className="comment-body">
                                {issue.body || <em>No description provided.</em>}
                            </div>
                        </div>

                        {comments.length > 0 && (
                            <div className="comments-section">
                                {comments.map(comment => (
                                    <div key={comment.id} className="comment-card">
                                        <div className="comment-header">
                                            <div className="comment-author-info">
                                                <Link to={`/profile/${comment.author_name}`} className="comment-author">
                                                    {comment.author_name}
                                                </Link>
                                                <span className="comment-date">
                                                    commented on {new Date(comment.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="comment-body">
                                            {comment.body}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="new-comment-section">
                            <h3>Add a comment</h3>
                            <form onSubmit={addComment} className="comment-form">
                                <textarea
                                    className="comment-textarea"
                                    placeholder="Leave a comment"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    rows="6"
                                />
                                <div className="comment-actions">
                                    <button type="submit" className="comment-submit-btn">
                                        <CommentIcon />
                                        <span>Comment</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="issue-sidebar">
                        <div className="sidebar-section">
                            <h3>Actions</h3>
                            {issue.state === 'open' ? (
                                <button onClick={closeIssue} className="sidebar-btn close-btn">
                                    <XIcon />
                                    <span>Close issue</span>
                                </button>
                            ) : (
                                <button onClick={reopenIssue} className="sidebar-btn reopen-btn">
                                    <IssueIcon />
                                    <span>Reopen issue</span>
                                </button>
                            )}
                        </div>

                        <div className="sidebar-section">
                            <h3>Participants</h3>
                            <div className="participants-list">
                                <Link to={`/profile/${issue.author_name}`} className="participant">
                                    {issue.author_name}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default IssueDetail
