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
      const response = await fetch(`/api/repositories/my`, {
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

  const createOrganization = async (e) => {
    e.preventDefault()
    await fetch('/api/organizations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newOrgName })
    })
    setShowCreateOrgModal(false)
    setNewOrgName('')
    loadRepositories()
  }

  const loadOrganizations = async () => {
    try {
        const token = localStorage.getItem('token')
        const response = await fetch('/api/organizations', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await response.json()
        setOrganizations(data.organizations || [])
    } catch (err) {
        console.error('Failed to load organizations:', err)
    }
    }

    useEffect(() => {
        loadOrganizations()
    }, [])

    const [organizations, setOrganizations] = useState([])
    const [showCreateOrgModal, setShowCreateOrgModal] = useState(false)
    const [newOrgName, setNewOrgName] = useState('')

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

      <div class="organizations-section">
        <div className="dashboard-header">
            <h2>      Your Organizations</h2>
            <button className="btn-primary" onClick={() => setShowCreateOrgModal(true)}>
                + New Organization
            </button>
        </div>
          {organizations.map(org => (
                <div key={org.id} className="org-card">
                    <div className="org-header">
                        <Link to={`/org/${org.name}`} className="org-name">
                            {org.display_name || org.name}
                        </Link>
                    </div>
                    <p className="org-description">{org.description || 'No description'}</p>
                    <div className="org-meta">
                        <span>Members: {org.member_count || 0}</span>
                        <span>Created {new Date(org.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="org-actions">
                        <Link to={`/org/${org.name}`} className="btn-small">
                            View Organization
                        </Link>
                    </div>
                </div>
            ))}
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
        {showCreateOrgModal && (
        <div className="modal-overlay" onClick={() => setShowCreateOrgModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Create New Organization</h3>
                <form onSubmit={createOrganization}>
                    <div className="form-group">
                        <label>Organization Name</label>
                        <input
                            type="text"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            required
                            pattern="[a-zA-Z0-9-_]+"
                            placeholder="my-organization"
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={() => setShowCreateOrgModal(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary">
                            Create Organization
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
