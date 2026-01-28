import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import './Dashboard.css'

function Dashboard({ user, logout }) {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRepo, setNewRepo] = useState({ name: '', description: '' })

  useEffect(() => {
    loadRepositories()
  }, [])

  const loadRepositories = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/repositories/my', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setRepos(data.repositories || [])
    } catch (err) {
      console.error('Failed to load repositories:', err)
    } finally {
      setLoading(false)
    }
  }

  const createRepository = async (e) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newRepo,
          owner_type: 'user',
          is_private: false
        })
      })

      if (response.ok) {
        setShowCreateModal(false)
        setNewRepo({ name: '', description: '' })
        loadRepositories()
      }
    } catch (err) {
      console.error('Failed to create repository:', err)
    }
  }

  return (
    <div className="dashboard">
      <Header user={user} logout={logout} />

      <div className="container">
        <div className="dashboard-header">
          <h2>Your Repositories</h2>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            + New Repository
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : repos.length === 0 ? (
          <div className="empty-state">
            <p>You don't have any repositories yet.</p>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              Create your first repository
            </button>
          </div>
        ) : (
          <div className="repo-grid">
            {repos.map(repo => (
              <div key={repo.id} className="repo-card">
                <div className="repo-header">
                  <Link to={`/${user.username}/${repo.name}`} className="repo-name">
                    {repo.name}
                  </Link>
                  <span className="repo-visibility">Public</span>
                </div>
                <p className="repo-description">{repo.description || 'No description'}</p>
                <div className="repo-meta">
                  <span>📁 {repo.size || 0} KB</span>
                  <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                </div>
                <div className="repo-actions">
                  <Link to={`/${user.username}/${repo.name}/files`} className="btn-small">
                    📂 Browse Files
                  </Link>
                  <a href={repo.clone_url} className="btn-small">
                    📥 Clone
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Repository</h3>
            <form onSubmit={createRepository}>
              <div className="form-group">
                <label>Repository Name</label>
                <input
                  type="text"
                  value={newRepo.name}
                  onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })}
                  required
                  pattern="[a-zA-Z0-9-_]+"
                  placeholder="my-awesome-project"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newRepo.description}
                  onChange={(e) => setNewRepo({ ...newRepo, description: e.target.value })}
                  placeholder="What's this repository about?"
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Repository
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
