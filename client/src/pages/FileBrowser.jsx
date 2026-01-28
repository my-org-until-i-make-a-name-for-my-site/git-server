import { useState, useEffect } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import Header from '../components/Header'
import './FileBrowser.css'

function FileBrowser({ user, logout }) {
  const { owner, repo } = useParams()
  const location = useLocation()
  const [files, setFiles] = useState([])
  const [fileContent, setFileContent] = useState(null)
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [editorActive, setEditorActive] = useState(false)
  const [editorUrl, setEditorUrl] = useState('')

  useEffect(() => {
    // Extract path from URL
    const pathMatch = location.pathname.match(/\/[^/]+\/[^/]+\/files\/(.*)/)
    const path = pathMatch ? pathMatch[1] : ''
    setCurrentPath(path)
  }, [location])

  useEffect(() => {
    loadContent()
  }, [currentPath])

  const loadContent = async () => {
    setLoading(true)
    setFileContent(null)
    
    try {
      const token = localStorage.getItem('token')
      
      // Try to load as a file first
      const fileResponse = await fetch(`/api/${owner}/${repo}/contents/main/${currentPath}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (fileResponse.ok) {
        const data = await fileResponse.json()
        setFileContent(data)
        setFiles([])
      } else {
        // Load as directory
        const dirResponse = await fetch(`/api/${owner}/${repo}/tree/main/${currentPath}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await dirResponse.json()
        setFiles(data.tree || [])
      }
      setLoading(false)
    } catch (err) {
      console.error('Failed to load content:', err)
      setLoading(false)
    }
  }

  const startEditor = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/${owner}/${repo}/editor/start`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.url) {
        setEditorUrl(data.url)
        setEditorActive(true)
      }
    } catch (err) {
      console.error('Failed to start editor:', err)
      alert('Failed to start editor. Please check the server configuration.')
    }
  }

  const stopEditor = async () => {
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/${owner}/${repo}/editor/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setEditorActive(false)
      setEditorUrl('')
    } catch (err) {
      console.error('Failed to stop editor:', err)
    }
  }

  const getBreadcrumbs = () => {
    if (!currentPath) return []
    const parts = currentPath.split('/').filter(p => p)
    return parts.map((part, index) => ({
      name: part,
      path: parts.slice(0, index + 1).join('/')
    }))
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="file-browser">
      <Header user={user} logout={logout} />
      
      <div className="browser-header">
        <div className="browser-header-content">
          <div className="breadcrumb">
            <Link to={`/${owner}/${repo}`}>{owner} / {repo}</Link>
            <span>/</span>
            <Link to={`/${owner}/${repo}/files`}>files</Link>
            {getBreadcrumbs().map((crumb, index) => (
              <span key={index}>
                <span>/</span>
                <Link to={`/${owner}/${repo}/files/${crumb.path}`}>{crumb.name}</Link>
              </span>
            ))}
          </div>
          
          <div className="editor-controls">
            {!editorActive ? (
              <button className="editor-btn" onClick={startEditor}>
                🚀 Open in VSCode
              </button>
            ) : (
              <button className="editor-btn active" onClick={stopEditor}>
                ✓ Editor Active - Click to Stop
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="browser-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        ) : fileContent ? (
          <div>
            <div className="file-viewer">
              <div className="file-viewer-header">
                <h3>{fileContent.name}</h3>
                <div className="file-actions">
                  <button className="file-action-btn" onClick={() => window.open(fileContent.download_url)}>
                    Download
                  </button>
                  <button className="file-action-btn" onClick={startEditor}>
                    Edit in VSCode
                  </button>
                </div>
              </div>
              <div className="file-content">
                <pre className="code-block">
                  {fileContent.content.split('\n').map((line, index) => (
                    <div key={index} className="code-line">
                      <span className="line-number">{index + 1}</span>
                      <span className="line-content">{line}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
            
            <button 
              className="editor-btn" 
              onClick={() => {
                setFileContent(null)
                setCurrentPath(currentPath.split('/').slice(0, -1).join('/'))
              }}
            >
              ← Back to folder
            </button>
          </div>
        ) : (
          <div className="file-list">
            {currentPath && (
              <div 
                className="file-item" 
                onClick={() => {
                  const parentPath = currentPath.split('/').slice(0, -1).join('/')
                  setCurrentPath(parentPath)
                }}
              >
                <a href="#">📁 ..</a>
              </div>
            )}
            {files.map(file => (
              <div key={file.name} className="file-item">
                <Link 
                  to={`/${owner}/${repo}/files/${currentPath ? currentPath + '/' : ''}${file.name}`}
                >
                  {file.type === 'tree' ? '📁' : '📄'} {file.name}
                </Link>
                {file.size && <span className="file-size">{formatFileSize(file.size)}</span>}
              </div>
            ))}
            {files.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Empty directory
              </div>
            )}
          </div>
        )}

        {editorActive && (
          <div className="vscode-editor-container">
            <div className="vscode-editor-header">
              <h3>VSCode Web Editor</h3>
              <span className="editor-status active">● Active</span>
            </div>
            {editorUrl ? (
              <iframe 
                src={editorUrl} 
                className="vscode-iframe"
                title="VSCode Editor"
              />
            ) : (
              <div className="loading-editor">
                Starting VSCode editor...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FileBrowser
