import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import './Repository.css'

function Repository({ user, logout, tab = 'code' }) {
    const { owner, repo } = useParams()
    const [activeTab, setActiveTab] = useState(tab)
    const [repoData, setRepoData] = useState(null)
    const [issues, setIssues] = useState([])
    const [pulls, setPulls] = useState([])
    const [commits, setCommits] = useState([])
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreateIssueModal, setShowCreateIssueModal] = useState(false)
    const [showCreatePRModal, setShowCreatePRModal] = useState(false)
    const [error, setError] = useState(null)

    // Form state for issue creation
    const [issueTitle, setIssueTitle] = useState('')
    const [issueBody, setIssueBody] = useState('')

    // Form state for PR creation
    const [prTitle, setPrTitle] = useState('')
    const [prBody, setPrBody] = useState('')
    const [prBaseBranch, setPrBaseBranch] = useState('branch1')
    const [prHeadBranch, setPrHeadBranch] = useState('branch2')

    useEffect(() => {
        loadRepository()
        if (activeTab === 'issues') loadIssues()
        if (activeTab === 'pulls') loadPulls()
        if (activeTab === 'commits') loadCommits()
        if (activeTab === 'code') loadFiles()
    }, [owner, repo, activeTab])

    const loadRepository = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/repositories/${owner}/${repo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setRepoData(data)
            setLoading(false)
            if (!data.repository) {
                setLoading(false)
                setError('Repository not found!')
                return
            }
        } catch (err) {
            console.error('Failed to load repository:', err)
            setLoading(false)
            setError('Failed to load repository')
        }
    }

    const loadIssues = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/issues`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setIssues(data.issues || [])
        } catch (err) {
            console.error('Failed to load issues:', err)
            setError('Failed to load issues')
        }
    }

    const loadPulls = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/pulls`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setPulls(data.pulls || [])
        } catch (err) {
            console.error('Failed to load PRs:', err)
            setError('Failed to load pull requests')
        }
    }

    const loadCommits = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/commits`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setCommits(data.commits || [])
        } catch (err) {
            console.error('Failed to load commits:', err)
            setError('Failed to load commits')
        }
    }

    const loadFiles = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/tree/main/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setFiles(data.tree || [])
        } catch (err) {
            console.error('Failed to load files:', err)
            setError('Failed to load files')
        }
    }

    const createIssue = (title, body) => {
        try {
            const token = localStorage.getItem('token')
            fetch(`/api/${owner}/${repo}/issues`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    body
                })
            }).then(response => response.json())
                .then(data => {
                    setIssues([...issues, data.issue])
                })
        } catch (err) {
            console.error('Failed to create issue:', err)
            setError('Failed to create issue')
        }
    }

    const createPR = (title, body, baseBranch, headBranch) => {
        try {
            const token = localStorage.getItem('token')
            fetch(`/api/${owner}/${repo}/pulls`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    body,
                    base_branch: baseBranch,
                    head_branch: headBranch
                })
            }).then(response => response.json())
                .then(data => {
                    setPulls([...pulls, data.pull_request])
                })
        } catch (err) {
            console.error('Failed to create pull request:', err)
            setError('Failed to create pull request')
        }
    }

    const copyCloneUrl = () => {
        const url = `${window.location.origin}/${owner}/${repo}.git`
        navigator.clipboard.writeText(url)
        alert('Clone URL copied to clipboard!')
    }

    if (loading) {
        return (
            <div>
                <Header user={user} logout={logout} />
                <div className="container">Loading...</div>
            </div>
        )
    }

    return (
        <div className="repository-page">
            <Header user={user} logout={logout} />
            {/* Display error message as a full screen overlay */}
            {error && (
                <div className="error-overlay">
                    <div className="error-content">
                        <h2>Error</h2>
                        <p>{error}</p>
                        <button onClick={() => window.location.href = '/'}>Go To Home</button>
                    </div>
                </div>
            )}

            <div className="repo-header">
                <div className="repo-header-content">
                    <div className="repo-title">
                        <Link to={`/profile/${owner}`} className="repo-owner">{owner}</Link>
                        <span>/</span>
                        <h1>{repo}</h1>
                    </div>
                    {repoData?.description && (
                        <p className="repo-description">{repoData.description}</p>
                    )}
                    <div className="repo-stats">
                        <span className="repo-stat">0 stars</span>
                        <span className="repo-stat">0 forks</span>
                        <span className="repo-stat">0 watchers</span>
                    </div>
                </div>
            </div>

            <div className="repo-tabs">
                <div className="repo-tabs-content">
                    <button
                        className={`repo-tab ${activeTab === 'code' ? 'active' : ''}`}
                        onClick={() => setActiveTab('code')}
                    >
                        Code
                    </button>
                    <button
                        className={`repo-tab ${activeTab === 'issues' ? 'active' : ''}`}
                        onClick={() => setActiveTab('issues')}
                    >
                        Issues
                    </button>
                    <button
                        className={`repo-tab ${activeTab === 'pulls' ? 'active' : ''}`}
                        onClick={() => setActiveTab('pulls')}
                    >
                        Pull Requests
                    </button>
                    <button
                        className={`repo-tab ${activeTab === 'commits' ? 'active' : ''}`}
                        onClick={() => setActiveTab('commits')}
                    >
                        Commits
                    </button>
                </div>
            </div>

            <div className="repo-content">
                {activeTab === 'code' && (
                    <div>
                        <div className="clone-section">
                            <h3>Clone this repository</h3>
                            <div className="clone-url-container">
                                <input
                                    type="text"
                                    className="clone-url"
                                    value={`${window.location.origin}/${owner}/${repo}.git`}
                                    readOnly
                                />
                                <button className="copy-btn" onClick={copyCloneUrl}>Copy</button>
                            </div>
                        </div>

                        <h3>Files</h3>
                        <div className="file-list">
                            {files.length === 0 ? (
                                <div className="empty-state">
                                    <h3>No files yet</h3>
                                    <p>Push some code to get started</p>
                                </div>
                            ) : (
                                files.map(file => (
                                    <div key={file.name} className="file-item">
                                        {file.type === 'tree' ? 'Folder' : 'File'}: {' '}
                                        <Link to={`/${owner}/${repo}/files/${file.name}`}>
                                            {file.name}
                                        </Link>
                                    </div>
                                ))
                            )}
                        </div>
                        <Link to={`/${owner}/${repo}/files`}>
                            <button className="create-btn" style={{ marginTop: '1rem' }}>
                                Browse All Files
                            </button>
                        </Link>
                    </div>
                )}

                {activeTab === 'issues' && (
                    <div>
                        <button className="create-issue-btn" onClick={() => setShowCreateIssueModal(true)}>New Issue</button>
                        <div className="issue-list">
                            {issues.length === 0 ? (
                                <div className="empty-state">
                                    <h3>No issues yet</h3>
                                    <p>Create an issue to get started</p>
                                </div>
                            ) : (
                                issues.map(issue => (
                                    <div key={issue.id} className="issue-item">
                                        <div className="issue-title">
                                            <span className="issue-number">#{issue.issue_number}</span>
                                            <span className={`issue-state ${issue.state}`}>{issue.state}</span>
                                            {issue.title}
                                        </div>
                                        <div className="issue-meta">
                                            Opened by {issue.author_name} • {new Date(issue.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {showCreateIssueModal && (
                    <div className="repo-modal" id="create-issue-modal">
                        <div className="repo-modal-content">
                            <span className="repo-modal-close" onClick={() => setShowCreateIssueModal(false)}>&times;</span>
                            <h2>Create New Issue</h2>
                            <form id="create-issue-form" onSubmit={e => {
                                e.preventDefault();
                                createIssue(issueTitle, issueBody);
                                setShowCreateIssueModal(false);
                                setIssueTitle('');
                                setIssueBody('');
                            }}>
                                <label htmlFor="issue-title">Title:</label>
                                <input
                                    type="text"
                                    id="issue-title"
                                    name="issue-title"
                                    value={issueTitle}
                                    onChange={e => setIssueTitle(e.target.value)}
                                    required
                                />
                                <label htmlFor="issue-body">Description:</label>
                                <textarea
                                    id="issue-body"
                                    name="issue-body"
                                    rows="4"
                                    value={issueBody}
                                    onChange={e => setIssueBody(e.target.value)}
                                ></textarea>
                                <button type="submit" className="submit-btn">Create Issue</button>
                            </form>
                        </div>
                    </div>
                )}

                {activeTab === 'pulls' && (
                    <div>
                        <button className="create-pr-btn" onClick={() => setShowCreatePRModal(true)}>New Pull Request</button>
                        <div className="pr-list">
                            {pulls.length === 0 ? (
                                <div className="empty-state">
                                    <h3>No pull requests yet</h3>
                                    <p>Create a pull request to get started</p>
                                </div>
                            ) : (
                                pulls.map(pr => (
                                    <div key={pr.id} className="pr-item">
                                        <div className="pr-title">
                                            <span className="pr-number">#{pr.number}</span>
                                            <span className={`pr-state ${pr.state}`}>{pr.state}</span>
                                            {pr.title}
                                        </div>
                                        <div className="pr-meta">
                                            {pr.head_branch} → {pr.base_branch} • by {pr.author} • {new Date(pr.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {showCreatePRModal && (
                    <div className="repo-modal" id="create-pr-modal">
                        <div className="repo-modal-content">
                            <span className="repo-modal-close" onClick={() => setShowCreatePRModal(false)}>&times;</span>
                            <h2>Create New Pull Request</h2>
                            <form id="create-pr-form" onSubmit={e => {
                                e.preventDefault();
                                createPR(prTitle, prBody, prBaseBranch, prHeadBranch);
                                setShowCreatePRModal(false);
                                setPrTitle('');
                                setPrBody('');
                                setPrBaseBranch('branch1');
                                setPrHeadBranch('branch2');
                            }}>
                                <label htmlFor="pr-title">Title:</label>
                                <input
                                    type="text"
                                    id="pr-title"
                                    name="pr-title"
                                    value={prTitle}
                                    onChange={e => setPrTitle(e.target.value)}
                                    required
                                />
                                <label htmlFor="pr-base-branch">Base Branch:</label>
                                <select
                                    id="pr-base-branch"
                                    name="pr-base-branch"
                                    value={prBaseBranch}
                                    onChange={e => setPrBaseBranch(e.target.value)}
                                >
                                    <option value="branch1">branch1</option>
                                </select>
                                <label htmlFor="pr-head-branch">Head Branch:</label>
                                <select
                                    id="pr-head-branch"
                                    name="pr-head-branch"
                                    value={prHeadBranch}
                                    onChange={e => setPrHeadBranch(e.target.value)}
                                >
                                    <option value="branch2">branch2</option>
                                </select>
                                <label htmlFor="pr-body">Description:</label>
                                <textarea
                                    id="pr-body"
                                    name="pr-body"
                                    rows="4"
                                    value={prBody}
                                    onChange={e => setPrBody(e.target.value)}
                                ></textarea>
                                <button type="submit" className="submit-btn">Create Pull Request</button>
                            </form>
                        </div>
                    </div>
                )}

                {activeTab === 'commits' && (
                    <div>
                        <div className="commit-list">
                            {commits.length === 0 ? (
                                <div className="empty-state">
                                    <h3>No commits yet</h3>
                                    <p>Push some code to see commits</p>
                                </div>
                            ) : (
                                commits.map(commit => (
                                    <div key={commit.sha} className="commit-item">
                                        <div className="commit-message">{commit.message}</div>
                                        <div className="commit-meta">
                                            <span className="commit-sha">{commit.sha.substring(0, 7)}</span>
                                            {commit.author} committed on {new Date(commit.date).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Repository
