import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'

function FileBrowser({ user, logout }) {
  const { owner, repo } = useParams()
  const [files, setFiles] = useState([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFiles()
  }, [currentPath])

  const loadFiles = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/${owner}/${repo}/tree/main/${currentPath}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setFiles(data.tree || [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to load files:', err)
      setLoading(false)
    }
  }

  return (
    <div>
      <Header user={user} logout={logout} />
      <div className="container">
        <h2>{owner}/{repo} - Files</h2>
        {loading ? <div>Loading...</div> : (
          <div>
            {files.map(file => (
              <div key={file.name}>
                {file.type === 'tree' ? '📁' : '📄'} {file.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FileBrowser
