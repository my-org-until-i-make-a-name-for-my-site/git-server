import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import './WorkflowRunDetail.css'

function WorkflowRunDetail({ user, logout }) {
    const { owner, repo, runId } = useParams()
    const [run, setRun] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        loadRun()
    }, [owner, repo, runId])

    const loadRun = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch(`/api/${owner}/${repo}/actions/runs/${runId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setRun(data.run)
            setLoading(false)
        } catch (err) {
            console.error('Failed to load workflow run:', err)
            setError('Failed to load workflow run')
            setLoading(false)
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

    if (error || !run) {
        return (
            <div>
                <Header user={user} logout={logout} />
                <div className="container">{error || 'Workflow run not found'}</div>
            </div>
        )
    }

    return (
        <div className="workflow-run-page">
            <Header user={user} logout={logout} />

            <div className="container">
                <div className="breadcrumb">
                    <Link to={`/${owner}/${repo}`}>{owner}/{repo}</Link>
                    <span> / </span>
                    <Link to={`/${owner}/${repo}/actions`}>Actions</Link>
                    <span> / </span>
                    <span>Run #{run.id}</span>
                </div>

                <div className="run-header">
                    <h1>{run.workflow_name}</h1>
                    <div className="run-meta">
                        <span className={`status-badge ${run.status}`}>{run.status}</span>
                        <span>{run.event}</span>
                        <span>{new Date(run.started_at).toLocaleString()}</span>
                    </div>
                </div>

                <div className="jobs-list">
                    <h2>Jobs</h2>
                    {run.jobs && run.jobs.length > 0 ? (
                        run.jobs.map((job, idx) => (
                            <div key={idx} className="job-card">
                                <div className="job-header">
                                    <strong>{job.job_name}</strong>
                                    <span className={`status-badge ${job.status}`}>{job.status}</span>
                                </div>
                                {job.logs && (
                                    <pre className="job-logs">{job.logs}</pre>
                                )}
                            </div>
                        ))
                    ) : (
                        <p>No jobs found</p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default WorkflowRunDetail
