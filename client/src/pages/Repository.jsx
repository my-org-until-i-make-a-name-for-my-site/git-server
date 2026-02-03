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
    const [branches, setBranches] = useState([])
    const [currentBranch, setCurrentBranch] = useState('main')
    const [commitsBranch, setCommitsBranch] = useState('main')
    const [loading, setLoading] = useState(true)
    const [showCreateIssueModal, setShowCreateIssueModal] = useState(false)
    const [showCreatePRModal, setShowCreatePRModal] = useState(false)
    const [error, setError] = useState(null)
    const [workflowRuns, setWorkflowRuns] = useState([])
    const [workflows, setWorkflows] = useState([])

    // Form state for issue creation
    const [issueTitle, setIssueTitle] = useState('')
    const [issueBody, setIssueBody] = useState('')

    // Form state for PR creation
    const [prTitle, setPrTitle] = useState('')
    const [prBody, setPrBody] = useState('')
    const [prBaseBranch, setPrBaseBranch] = useState('main')
    const [prHeadBranch, setPrHeadBranch] = useState('')

    useEffect(() => {
        if (branches.length > 0) {
            const mainBranch = branches.find(branch => branch === 'main')
            const defaultBranch = mainBranch || branches[0]
            setPrBaseBranch(defaultBranch || 'main')
            const headBranch = branches.find(branch => branch !== defaultBranch)
            setPrHeadBranch(headBranch || defaultBranch || '')
            setCommitsBranch(defaultBranch || 'main')
        }
    }, [branches])

    useEffect(() => {
        loadRepository()
        loadBranches()
        if (activeTab === 'issues') loadIssues()
        if (activeTab === 'pulls') loadPulls()
        if (activeTab === 'commits') loadCommits()
        if (activeTab === 'code') loadFiles()
        if (activeTab === 'actions') loadActions()
    }, [owner, repo, activeTab])

    useEffect(() => {
        if (activeTab === 'code') {
            loadFiles()
        }
    }, [currentBranch])

    useEffect(() => {
        if (activeTab === 'commits') {
            loadCommits()
        }
    }, [commitsBranch])

    const loadRepository = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/repositories/${owner}/${repo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setRepoData(data.repository || data)
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

    const loadBranches = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/branches`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            const branchNames = (data.branches || []).map((branch) =>
                branch.replace(/^remotes\/origin\//, '')
            )
            const uniqueBranches = [...new Set(branchNames)].filter(Boolean)
            setBranches(uniqueBranches)
            if (data.current) {
                setCurrentBranch(data.current.replace(/^remotes\/origin\//, ''))
            }
        } catch (err) {
            console.error('Failed to load branches:', err)
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
            setPulls(data.pull_requests || [])
        } catch (err) {
            console.error('Failed to load PRs:', err)
            setError('Failed to load pull requests')
        }
    }

    const loadCommits = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/commits?branch=${encodeURIComponent(commitsBranch)}`, {
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
            const response = await fetch(`/api/${owner}/${repo}/tree/${currentBranch}/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setFiles(data.tree || [])
        } catch (err) {
            console.error('Failed to load files:', err)
            setError('Failed to load files')
        }
    }

    const loadActions = async () => {
        try {
            const token = localStorage.getItem('token')

            // Load workflows
            const workflowsRes = await fetch(`/api/${owner}/${repo}/workflows`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const workflowsData = await workflowsRes.json()
            setWorkflows(workflowsData.workflows || [])

            // Load workflow runs
            const runsRes = await fetch(`/api/${owner}/${repo}/actions/runs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const runsData = await runsRes.json()
            setWorkflowRuns(runsData.runs || [])
        } catch (err) {
            console.error('Failed to load actions:', err)
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
                    if (data?.pull_request) {
                        setPulls([...pulls, data.pull_request])
                    }
                })
        } catch (err) {
            console.error('Failed to create pull request:', err)
            setError('Failed to create pull request')
        }
    }

    const deleteFile = async (filepath) => {
        if (!confirm(`Are you sure you want to delete ${filepath}?`)) {
            return
        }
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/contents/${currentBranch}/${filepath}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (response.ok) {
                loadFiles()
                alert('File deleted successfully')
            } else {
                alert('Failed to delete file')
            }
        } catch (err) {
            console.error('Failed to delete file:', err)
            alert('Failed to delete file')
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
                    <button
                        className={`repo-tab ${activeTab === 'actions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('actions')}
                    >
                        Actions
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

                        <div className="code-section">
                            <div className="code-header">
                                <h3>Files</h3>
                                <div className="branch-selector">
                                    <label htmlFor="branch-select">Branch:</label>
                                    <select
                                        id="branch-select"
                                        value={currentBranch}
                                        onChange={(e) => setCurrentBranch(e.target.value)}
                                        className="branch-select"
                                    >
                                        {branches.length > 0 ? (
                                            branches.map(branch => (
                                                <option key={branch} value={branch}>{branch}</option>
                                            ))
                                        ) : (
                                            <option value="main">main</option>
                                        )}
                                    </select>
                                </div>
                                <div className="codespace-actions">
                                    <button
                                        className="create-issue-btn"
                                        onClick={() => window.location.href = `/codespaces/${encodeURIComponent(`${owner}-${repo}`)}`}
                                    >
                                        Run Codespace
                                    </button>
                                </div>
                            </div>

                            {files.length === 0 ? (
                                <div className="empty-state">
                                    <h3>No files yet</h3>
                                    <p>Push some code to get started</p>
                                </div>
                            ) : (
                                <div className="file-browser">
                                    <div className="file-browser-header">
                                        <div className="file-col-name">Name</div>
                                        <div className="file-col-message">Latest commit message</div>
                                        <div className="file-col-time">Committed</div>
                                        <div className="file-col-actions">Actions</div>
                                    </div>
                                    <div className="file-list">
                                        {files.map((file, index) => (
                                            <div key={`${file.name}-${index}`} className="file-row">
                                                <div className="file-col-name">
                                                    <span className="file-icon">
                                                        {file.type === 'tree' ? 'Folder' : 'File'}
                                                    </span>
                                                    <Link to={`/${owner}/${repo}/files/${file.path}`} className="file-name">
                                                        {file.name}
                                                    </Link>
                                                </div>
                                                <div className="file-col-message">
                                                    <span className="commit-info">Initial commit</span>
                                                </div>
                                                <div className="file-col-time">
                                                    <span className="time-ago">just now</span>
                                                </div>
                                                <div className="file-col-actions">
                                                    {file.type === 'blob' && (
                                                        <button
                                                            className="delete-file-btn"
                                                            onClick={() => deleteFile(file.path)}
                                                            title="Delete file"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
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
                                    <div key={pr?.id ?? pr?.pr_number ?? pr?.number} className="pr-item">
                                        <div className="pr-title">
                                            <span className="pr-number">#{pr?.number ?? pr?.pr_number ?? '—'}</span>
                                            <span className={`pr-state ${pr?.state || 'open'}`}>{pr?.state || 'open'}</span>
                                            {pr?.title}
                                        </div>
                                        <div className="pr-meta">
                                            {pr?.head_branch} → {pr?.base_branch} • by {pr?.author ?? pr?.author_name ?? 'unknown'} • {pr?.created_at ? new Date(pr.created_at).toLocaleDateString() : 'unknown date'}
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
                                setPrBaseBranch(branches[0] || 'main');
                                setPrHeadBranch(branches[1] || '');
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
                                <label htmlFor="pr-base-branch">Base Branch (merge into):</label>
                                <select
                                    id="pr-base-branch"
                                    name="pr-base-branch"
                                    value={prBaseBranch}
                                    onChange={e => setPrBaseBranch(e.target.value)}
                                >
                                    {branches.length > 0 ? (
                                        branches.map(branch => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))
                                    ) : (
                                        <option value="main">main</option>
                                    )}
                                </select>
                                <label htmlFor="pr-head-branch">Head Branch (merge from):</label>
                                <select
                                    id="pr-head-branch"
                                    name="pr-head-branch"
                                    value={prHeadBranch}
                                    onChange={e => setPrHeadBranch(e.target.value)}
                                >
                                    {branches.length > 0 ? (
                                        branches.map(branch => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))
                                    ) : (
                                        <option value="main">main</option>
                                    )}
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
                        <div className="code-header">
                            <h3>Commits</h3>
                            <div className="branch-selector">
                                <label htmlFor="commits-branch-select">Branch:</label>
                                <select
                                    id="commits-branch-select"
                                    value={commitsBranch}
                                    onChange={(e) => setCommitsBranch(e.target.value)}
                                    className="branch-select"
                                >
                                    {branches.length > 0 ? (
                                        branches.map(branch => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))
                                    ) : (
                                        <option value="main">main</option>
                                    )}
                                </select>
                            </div>
                        </div>
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

                {activeTab === 'actions' && (
                    <div className="actions-tab">
                        <div className="actions-header">
                            <h3>Workflows</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                                Workflows are defined in .codara/workflows/*.yml
                            </p>
                        </div>

                        {workflows.length === 0 ? (
                            <div className="empty-state">
                                <h3>No workflows</h3>
                                <p>Create a workflow file in .codara/workflows/</p>
                                <pre style={{
                                    background: 'var(--input-bg)',
                                    padding: '1rem',
                                    borderRadius: '4px',
                                    fontSize: '0.85em',
                                    textAlign: 'left',
                                    marginTop: '1rem'
                                }}>
                                    {`# .codara/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    steps:
      - name: Checkout code
        uses: github/actions/checkout@v3
      - name: Run tests
        run: npm test`}
                                </pre>
                            </div>
                        ) : (
                            <>
                                <div className="workflows-list" style={{ marginBottom: '2rem' }}>
                                    {workflows.map((workflow, idx) => (
                                        <div key={idx} className="workflow-item" style={{
                                            background: 'var(--card-bg)',
                                            padding: '1rem',
                                            borderRadius: '4px',
                                            marginBottom: '0.5rem',
                                            border: '1px solid var(--border-color)'
                                        }}>
                                            <strong>{workflow.name}</strong>
                                            <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)' }}>
                                                {workflow.filename}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <h3>Recent runs</h3>
                                {workflowRuns.length === 0 ? (
                                    <div className="empty-state">
                                        <p>No workflow runs yet</p>
                                    </div>
                                ) : (
                                    <div className="runs-list">
                                        {workflowRuns.map(run => (
                                            <Link
                                                key={run.id}
                                                to={`/${owner}/${repo}/actions/runs/${run.id}`}
                                                className="run-item"
                                                style={{
                                                    display: 'block',
                                                    background: 'var(--card-bg)',
                                                    padding: '1rem',
                                                    borderRadius: '4px',
                                                    marginBottom: '0.5rem',
                                                    border: '1px solid var(--border-color)',
                                                    textDecoration: 'none',
                                                    color: 'var(--text-primary)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85em',
                                                        background: run.status === 'completed' ? '#28a745' :
                                                            run.status === 'failed' ? '#dc3545' : '#ffc107',
                                                        color: 'white'
                                                    }}>
                                                        {run.status}
                                                    </span>
                                                    <div style={{ flex: 1 }}>
                                                        <strong>{run.workflow_name}</strong>
                                                        <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                                                            {run.event} • {new Date(run.started_at).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Repository
