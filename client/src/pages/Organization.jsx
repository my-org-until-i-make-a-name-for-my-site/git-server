import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import './Organization.css'

function Organization({ user, logout }) {
  const { orgname } = useParams()
  const [org, setOrg] = useState(null)
  const [repos, setRepos] = useState([])
  const [members, setMembers] = useState([])
  const [followers, setFollowers] = useState([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [activeTab, setActiveTab] = useState('repos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrganization()
    checkIfFollowing()
  }, [orgname])

  const loadOrganization = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/organizations/${orgname}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      if (data.organization) {
        setOrg(data.organization)
        setRepos(data.repositories || [])
      }
      setLoading(false)
    } catch (err) {
      console.error('Failed to load organization:', err)
      setLoading(false)
    }
  }

  const checkIfFollowing = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/organizations/${orgname}/is-following`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setIsFollowing(data.isFollowing)
    } catch (err) {
      console.error('Failed to check follow status:', err)
    }
  }

  const toggleFollow = async () => {
    try {
      const token = localStorage.getItem('token')
      const method = isFollowing ? 'DELETE' : 'POST'
      const response = await fetch(`/api/organizations/${orgname}/follow`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        setIsFollowing(!isFollowing)
        loadOrganization()
      }
    } catch (err) {
      console.error('Failed to toggle follow:', err)
    }
  }

  const loadFollowers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/organizations/${orgname}/followers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setFollowers(data.followers || [])
    } catch (err) {
      console.error('Failed to load followers:', err)
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'followers' && followers.length === 0) {
      loadFollowers()
    }
  }

  if (loading) {
    return (
      <div>
        <Header user={user} logout={logout} />
        <div className="container">
          <div className="loading">Loading organization...</div>
        </div>
      </div>
    )
  }

  if (!org) {
    return (
      <div>
        <Header user={user} logout={logout} />
        <div className="container">
          <div className="error-state">Organization not found</div>
        </div>
      </div>
    )
  }

  return (
    <div className="org-page">
      <Header user={user} logout={logout} />
      
      <div className="container">
        <div className="org-layout">
          {/* Sidebar */}
          <div className="org-sidebar">
            <div className="org-card">
              <div className="org-avatar">
                {orgname.charAt(0).toUpperCase()}
              </div>
              <h2 className="org-name">{org.display_name || orgname}</h2>
              <div className="org-username">@{orgname}</div>
              
              {org.description && (
                <p className="org-description">{org.description}</p>
              )}

              <button 
                className={`follow-btn ${isFollowing ? 'following' : ''}`}
                onClick={toggleFollow}
              >
                {isFollowing ? '✓ Following' : '+ Follow'}
              </button>

              <div className="org-stats">
                <div className="stat">
                  <div className="stat-number">{org.followerCount || 0}</div>
                  <div className="stat-label">Followers</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{repos.length}</div>
                  <div className="stat-label">Repositories</div>
                </div>
              </div>

              {org.created_at && (
                <div className="org-created">
                  📅 Created {new Date(org.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="org-main">
            <div className="org-tabs">
              <button 
                className={`tab ${activeTab === 'repos' ? 'active' : ''}`}
                onClick={() => handleTabChange('repos')}
              >
                📦 Repositories ({repos.length})
              </button>
              <button 
                className={`tab ${activeTab === 'followers' ? 'active' : ''}`}
                onClick={() => handleTabChange('followers')}
              >
                👥 Followers ({org.followerCount || 0})
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'repos' && (
                <div className="repos-list">
                  {repos.length === 0 ? (
                    <div className="empty-state">
                      <p>No repositories yet</p>
                    </div>
                  ) : (
                    repos.map(repo => (
                      <div key={repo.id} className="repo-item">
                        <div className="repo-header">
                          <Link to={`/${orgname}/${repo.name}`} className="repo-title">
                            {repo.name}
                          </Link>
                          <span className="repo-visibility">
                            {repo.is_private ? '🔒 Private' : '🌐 Public'}
                          </span>
                        </div>
                        <p className="repo-description">{repo.description || 'No description'}</p>
                        <div className="repo-meta">
                          <span>📅 Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'followers' && (
                <div className="users-list">
                  {followers.length === 0 ? (
                    <div className="empty-state">
                      <p>No followers yet</p>
                    </div>
                  ) : (
                    followers.map(follower => (
                      <div key={follower.id} className="user-item">
                        <div className="user-avatar">{follower.username.charAt(0).toUpperCase()}</div>
                        <div className="user-info">
                          <Link to={`/profile/${follower.username}`} className="user-name">
                            {follower.username}
                          </Link>
                          <div className="user-email">{follower.email}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Organization
