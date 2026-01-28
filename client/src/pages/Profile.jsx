import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import './Profile.css'

function Profile({ user, logout }) {
  const { username } = useParams()
  const [profile, setProfile] = useState(null)
  const [repos, setRepos] = useState([])
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [activeTab, setActiveTab] = useState('repos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
    checkIfFollowing()
  }, [username])

  const loadProfile = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/profile/${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      if (data.user) {
        setProfile(data.user)
        setRepos(data.repositories || [])
      }
      setLoading(false)
    } catch (err) {
      console.error('Failed to load profile:', err)
      setLoading(false)
    }
  }

  const checkIfFollowing = async () => {
    if (username === user.username) return
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/profile/${username}/is-following`, {
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
      const response = await fetch(`/api/profile/${username}/follow`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        setIsFollowing(!isFollowing)
        loadProfile() // Reload to update follower count
      }
    } catch (err) {
      console.error('Failed to toggle follow:', err)
    }
  }

  const loadFollowers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/profile/${username}/followers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setFollowers(data.followers || [])
    } catch (err) {
      console.error('Failed to load followers:', err)
    }
  }

  const loadFollowing = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/profile/${username}/following`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setFollowing(data.following || [])
    } catch (err) {
      console.error('Failed to load following:', err)
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'followers' && followers.length === 0) {
      loadFollowers()
    } else if (tab === 'following' && following.length === 0) {
      loadFollowing()
    }
  }

  if (loading) {
    return (
      <div>
        <Header user={user} logout={logout} />
        <div className="container">
          <div className="loading">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div>
        <Header user={user} logout={logout} />
        <div className="container">
          <div className="error-state">User not found</div>
        </div>
      </div>
    )
  }

  const isOwnProfile = user.username === username

  return (
    <div className="profile-page">
      <Header user={user} logout={logout} />
      
      <div className="container">
        <div className="profile-layout">
          {/* Sidebar */}
          <div className="profile-sidebar">
            <div className="profile-card">
              <div className="profile-avatar">
                {username.charAt(0).toUpperCase()}
              </div>
              <h2 className="profile-username">{username}</h2>
              {profile.email && <div className="profile-email">{profile.email}</div>}
              
              {profile.role && profile.role !== 'user' && (
                <div className="profile-badges">
                  {profile.role === 'admin' && <span className="badge-admin">Admin</span>}
                  {profile.role === 'moderator' && <span className="badge-mod">Moderator</span>}
                </div>
              )}

              {!isOwnProfile && (
                <button 
                  className={`follow-btn ${isFollowing ? 'following' : ''}`}
                  onClick={toggleFollow}
                >
                  {isFollowing ? '✓ Following' : '+ Follow'}
                </button>
              )}

              <div className="profile-stats">
                <div className="stat" onClick={() => handleTabChange('followers')}>
                  <div className="stat-number">{profile.followerCount || 0}</div>
                  <div className="stat-label">Followers</div>
                </div>
                <div className="stat" onClick={() => handleTabChange('following')}>
                  <div className="stat-number">{profile.followingCount || 0}</div>
                  <div className="stat-label">Following</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{repos.length}</div>
                  <div className="stat-label">Repositories</div>
                </div>
              </div>

              {profile.created_at && (
                <div className="profile-joined">
                  📅 Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="profile-main">
            <div className="profile-tabs">
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
                👥 Followers ({profile.followerCount || 0})
              </button>
              <button 
                className={`tab ${activeTab === 'following' ? 'active' : ''}`}
                onClick={() => handleTabChange('following')}
              >
                👤 Following ({profile.followingCount || 0})
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
                          <Link to={`/${username}/${repo.name}`} className="repo-title">
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

              {activeTab === 'following' && (
                <div className="users-list">
                  {following.length === 0 ? (
                    <div className="empty-state">
                      <p>Not following anyone yet</p>
                    </div>
                  ) : (
                    following.map(followedUser => (
                      <div key={followedUser.id} className="user-item">
                        <div className="user-avatar">{followedUser.username.charAt(0).toUpperCase()}</div>
                        <div className="user-info">
                          <Link to={`/profile/${followedUser.username}`} className="user-name">
                            {followedUser.username}
                          </Link>
                          <div className="user-email">{followedUser.email}</div>
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

export default Profile
