import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import './Explore.css'

function Explore({ user, logout }) {
  const [trending, setTrending] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadExploreData()
  }, [])

  const loadExploreData = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/explore', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setTrending(data.trending || [])
      setRecent(data.recent || [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to load explore data:', err)
      setLoading(false)
    }
  }

  return (
    <div className="explore-page">
      <Header user={user} logout={logout} />
      
      <div className="explore-container">
        <div className="explore-header">
          <h1>🌟 Explore Codara</h1>
          <p>Discover trending repositories and projects</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : (
          <>
            <div className="explore-section">
              <h2>🔥 Trending Repositories</h2>
              <div className="repo-grid">
                {trending.map(repo => (
                  <Link to={`/${repo.owner}/${repo.name}`} key={repo.id} className="repo-card">
                    <div className="repo-card-header">
                      <h3>{repo.owner}/{repo.name}</h3>
                    </div>
                    {repo.description && (
                      <p className="repo-card-description">{repo.description}</p>
                    )}
                    <div className="repo-card-stats">
                      <span>⭐ {repo.stars || 0}</span>
                      <span>🔱 {repo.forks || 0}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="explore-section">
              <h2>🆕 Recently Created</h2>
              <div className="repo-grid">
                {recent.map(repo => (
                  <Link to={`/${repo.owner}/${repo.name}`} key={repo.id} className="repo-card">
                    <div className="repo-card-header">
                      <h3>{repo.owner}/{repo.name}</h3>
                    </div>
                    {repo.description && (
                      <p className="repo-card-description">{repo.description}</p>
                    )}
                    <div className="repo-card-meta">
                      Created {new Date(repo.created_at).toLocaleDateString()}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Explore
