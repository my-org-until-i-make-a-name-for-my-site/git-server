import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import { PullRequestIcon, CommentIcon, MergeIcon, XIcon, CheckIcon, BranchIcon } from '../components/Icons'
import './PullRequestDetail.css'

function PullRequestDetail({ user, logout }) {
    const { owner, repo, number } = useParams()
    const [pr, setPr] = useState(null)
    const [comments, setComments] = useState([])
    const [newComment, setNewComment] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('conversation')
    const [mergeStatus, setMergeStatus] = useState({ mergeable: null, checking: true })
    const [merging, setMerging] = useState(false)

    useEffect(() => {
        loadPR()
        loadComments()
    }, [owner, repo, number])

    const loadPR = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setPr(data.pull_request)
            setLoading(false)

            // Check if can merge (check for conflicts)
            if (data.pull_request.state === 'open') {
                checkMergeability()
            }
        } catch (err) {
            console.error('Failed to load PR:', err)
            setError('Failed to load pull request')
            setLoading(false)
        }
    }

    const checkMergeability = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}/mergeable`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            
            if (!response.ok) {
                console.error('Failed to check mergeability:', response.statusText)
                setMergeStatus({ 
                    mergeable: null, 
                    has_conflicts: false, 
                    checking: false,
                    error: 'Failed to check merge status'
                })
                return
            }
            
            const data = await response.json()
            setMergeStatus({
                mergeable: data.mergeable,
                has_conflicts: data.has_conflicts,
                checking: false
            })
        } catch (err) {
            console.error('Failed to check mergeability:', err)
            setMergeStatus({ 
                mergeable: null, 
                has_conflicts: false, 
                checking: false,
                error: 'Failed to check merge status'
            })
        }
    }

    const loadComments = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}/comments`, {
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
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}/comments`, {
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

    const deleteComment = async (commentId) => {
        const confirmDelete = confirm('Delete this comment?')
        if (!confirmDelete) return

        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}/comments/${commentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (response.ok) {
                setComments(comments.filter(c => c.id !== commentId))
            } else {
                const data = await response.json()
                alert(data.error || 'Failed to delete comment')
            }
        } catch (err) {
            console.error('Failed to delete comment:', err)
            alert('Failed to delete comment')
        }
    }

    const mergePR = async () => {
        if (!mergeStatus.mergeable || merging) return

        const confirmMerge = confirm(`Are you sure you want to merge pull request #${number}?`)
        if (!confirmMerge) return

        setMerging(true)
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}/merge`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    commit_message: `Merge pull request #${number}`
                })
            })

            if (response.ok) {
                setPr({ ...pr, state: 'merged' })
                alert('Pull request merged successfully!')
            } else {
                const data = await response.json()
                alert(data.error || 'Failed to merge pull request')
            }
        } catch (err) {
            console.error('Failed to merge PR:', err)
            alert('Failed to merge pull request')
        } finally {
            setMerging(false)
        }
    }

    const closePR = async () => {
        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/${owner}/${repo}/pulls/${number}/close`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            setPr({ ...pr, state: 'closed' })
        } catch (err) {
            console.error('Failed to close PR:', err)
            alert('Failed to close pull request')
        }
    }

    const approvePR = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls/${number}/review`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event: 'APPROVE',
                    body: 'Looks good to me!'
                })
            })
            const data = await response.json()
            alert('Pull request approved!')
        } catch (err) {
            console.error('Failed to approve PR:', err)
            alert('Failed to approve pull request')
        }
    }

    const requestChanges = async () => {
        const feedback = prompt('Please provide feedback for requested changes:')
        if (!feedback) return

        try {
            const token = localStorage.getItem('token')
            await fetch(`/api/${owner}/${repo}/pulls/${number}/review`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event: 'REQUEST_CHANGES',
                    body: feedback
                })
            })
            alert('Changes requested!')
        } catch (err) {
            console.error('Failed to request changes:', err)
            alert('Failed to request changes')
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

    if (error || !pr) {
        return (
            <div>
                <Header user={user} logout={logout} />
                <div className="container">{error || 'Pull request not found'}</div>
            </div>
        )
    }

    return (
        <div className="pr-detail-page">
            <Header user={user} logout={logout} />

            <div className="pr-detail-container">
                <div className="pr-breadcrumb">
                    <Link to={`/${owner}/${repo}`}>{owner}/{repo}</Link>
                    <span>/</span>
                    <Link to={`/${owner}/${repo}/pulls`}>Pull requests</Link>
                    <span>/</span>
                    <span>#{number}</span>
                </div>

                <div className="pr-header">
                    <div className="pr-title-row">
                        <h1 className="pr-title-text">{pr.title}</h1>
                        <span className={`pr-state-badge ${pr.state}`}>
                            {pr.state === 'open' ? (
                                <>
                                    <PullRequestIcon />
                                    <span>Open</span>
                                </>
                            ) : pr.state === 'merged' ? (
                                <>
                                    <MergeIcon />
                                    <span>Merged</span>
                                </>
                            ) : (
                                <>
                                    <XIcon />
                                    <span>Closed</span>
                                </>
                            )}
                        </span>
                    </div>
                    <div className="pr-meta-row">
                        <span className="pr-number">#{pr.number}</span>
                        <span className="pr-author">
                            opened by <Link to={`/profile/${pr.author}`}>{pr.author}</Link>
                        </span>
                        <span className="pr-date">
                            {new Date(pr.created_at).toLocaleDateString()}
                        </span>
                    </div>
                    <div className="pr-branches">
                        <BranchIcon />
                        <span>
                            <span className="branch-name">{pr.head_branch}</span>
                            <span className="branch-arrow">→</span>
                            <span className="branch-name">{pr.base_branch}</span>
                        </span>
                    </div>
                </div>

                <div className="pr-tabs">
                    <button
                        className={`pr-tab ${activeTab === 'conversation' ? 'active' : ''}`}
                        onClick={() => setActiveTab('conversation')}
                    >
                        <CommentIcon />
                        <span>Conversation</span>
                    </button>
                    <button
                        className={`pr-tab ${activeTab === 'files' ? 'active' : ''}`}
                        onClick={() => setActiveTab('files')}
                    >
                        <span>Files changed</span>
                    </button>
                </div>

                <div className="pr-content-layout">
                    <div className="pr-main-content">
                        {activeTab === 'conversation' && (
                            <>
                                <div className="pr-body-card">
                                    <div className="comment-header">
                                        <div className="comment-author-info">
                                            <Link to={`/profile/${pr.author}`} className="comment-author">
                                                {pr.author}
                                            </Link>
                                            <span className="comment-date">
                                                commented on {new Date(pr.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="comment-body">
                                        {pr.body || <em>No description provided.</em>}
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
                                                    {(comment.author_id === user.id || user.is_admin) && (
                                                        <button
                                                            className="comment-delete-btn"
                                                            onClick={() => deleteComment(comment.id)}
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
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
                            </>
                        )}

                        {activeTab === 'files' && (
                            <div className="files-changed-section">
                                <p className="files-placeholder">
                                    File diff view coming soon. In a full implementation, this would show
                                    the line-by-line changes between the base and head branches.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="pr-sidebar">
                        <div className="sidebar-section">
                            <h3>Merge Status</h3>
                            {pr.state === 'open' && (
                                <>
                                    {mergeStatus.checking ? (
                                        <p>Checking for conflicts...</p>
                                    ) : mergeStatus.has_conflicts ? (
                                        <div className="merge-status-error">
                                            <p style={{ color: '#dc3545' }}>⚠️ This PR has conflicts</p>
                                            <p style={{ fontSize: '0.9em' }}>Resolve conflicts before merging</p>
                                        </div>
                                    ) : mergeStatus.mergeable ? (
                                        <div className="merge-status-ok">
                                            <p style={{ color: '#28a745' }}>✓ Ready to merge</p>
                                            <button
                                                onClick={mergePR}
                                                disabled={merging}
                                                className="sidebar-btn merge-btn"
                                                style={{
                                                    background: '#28a745',
                                                    color: 'white',
                                                    width: '100%',
                                                    marginTop: '0.5rem'
                                                }}
                                            >
                                                <MergeIcon />
                                                <span>{merging ? 'Merging...' : 'Merge pull request'}</span>
                                            </button>
                                        </div>
                                    ) : mergeStatus.error ? (
                                        <div className="merge-status-error">
                                            <p style={{ color: '#dc3545' }}>⚠️ {mergeStatus.error}</p>
                                            <button
                                                onClick={checkMergeability}
                                                className="sidebar-btn"
                                                style={{ width: '100%', marginTop: '0.5rem' }}
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    ) : (
                                        <p style={{ color: '#ffc107' }}>Unable to determine merge status</p>
                                    )}
                                </>
                            )}
                            {pr.state === 'closed' && pr.merged && (
                                <div className="merge-status-merged">
                                    <p style={{ color: '#6f42c1' }}>✓ Merged</p>
                                </div>
                            )}
                        </div>

                        <div className="sidebar-section">
                            <h3>Actions</h3>
                            <div className="sidebar-actions">
                                {pr.state === 'open' && (
                                    <>
                                        <button onClick={approvePR} className="sidebar-btn approve-btn">
                                            <CheckIcon />
                                            <span>Approve</span>
                                        </button>
                                        <button onClick={requestChanges} className="sidebar-btn changes-btn">
                                            <CommentIcon />
                                            <span>Request changes</span>
                                        </button>
                                        <button onClick={closePR} className="sidebar-btn close-btn">
                                            <XIcon />
                                            <span>Close pull request</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="sidebar-section">
                            <h3>Reviewers</h3>
                            <p className="sidebar-placeholder">No reviewers yet</p>
                        </div>

                        <div className="sidebar-section">
                            <h3>Assignees</h3>
                            <p className="sidebar-placeholder">No assignees yet</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default PullRequestDetail
