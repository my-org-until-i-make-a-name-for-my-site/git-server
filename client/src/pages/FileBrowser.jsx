import { useState, useEffect, useRef } from 'react'
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
  const [branches, setBranches] = useState([])
  const [currentBranch, setCurrentBranch] = useState('main')
  const [isEditing, setIsEditing] = useState(false)
  const [editorContent, setEditorContent] = useState('')
  const [editingPath, setEditingPath] = useState('')
  const [saving, setSaving] = useState(false)
  const uploadInputRef = useRef(null)

  useEffect(() => {
    // Extract path from URL
    const pathMatch = location.pathname.match(/\/[^/]+\/[^/]+\/files\/(.*)/)
    const path = pathMatch ? pathMatch[1] : ''
    setCurrentPath(path)
  }, [location])

  useEffect(() => {
    loadContent()
  }, [currentPath, currentBranch])

  useEffect(() => {
    loadBranches()
  }, [owner, repo])

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
      if (uniqueBranches.length > 0) {
        const mainBranch = uniqueBranches.find(branch => branch === 'main')
        const nextBranch = mainBranch || uniqueBranches[0]
        setCurrentBranch((current) => (current && uniqueBranches.includes(current) ? current : nextBranch))
      }
    } catch (err) {
      console.error('Failed to load branches:', err)
    }
  }

  const loadContent = async () => {
    setLoading(true)
    setFileContent(null)
    setIsEditing(false)
    
    try {
      const token = localStorage.getItem('token')
      
      // Try to load as a file first
      const fileResponse = await fetch(`/api/${owner}/${repo}/contents/${currentBranch}/${currentPath}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (fileResponse.ok) {
        const data = await fileResponse.json()
        setFileContent(data)
        setEditorContent(data.content || '')
        setEditingPath(data.path || currentPath)
        setFiles([])
      } else {
        // Load as directory
        const dirResponse = await fetch(`/api/${owner}/${repo}/tree/${currentBranch}/${currentPath}`, {
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

  const getDirectoryPath = () => (
    fileContent ? currentPath.split('/').slice(0, -1).join('/') : currentPath
  )

  const saveFileContent = async (targetPath, content, message) => {
    if (!targetPath) return
    try {
      setSaving(true)
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/${owner}/${repo}/contents/${currentBranch}/${encodeURIComponent(targetPath)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content, message })
      })
      if (!response.ok) {
        throw new Error('Failed to save file')
      }
      await loadContent()
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save file:', err)
      alert('Failed to save file')
    } finally {
      setSaving(false)
    }
  }

  const deleteFile = async (targetPath) => {
    if (!targetPath) return
    if (!confirm(`Delete ${targetPath}?`)) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/${owner}/${repo}/contents/${currentBranch}/${encodeURIComponent(targetPath)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error('Failed to delete file')
      }
      await loadContent()
      setFileContent(null)
    } catch (err) {
      console.error('Failed to delete file:', err)
      alert('Failed to delete file')
    }
  }

  const handleCreateFile = () => {
    const filename = prompt('New file name')
    if (!filename) return
    const directoryPath = getDirectoryPath()
    const targetPath = directoryPath ? `${directoryPath}/${filename}` : filename
    setFileContent({ name: filename, path: targetPath, content: '' })
    setEditorContent('')
    setEditingPath(targetPath)
    setIsEditing(true)
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const directoryPath = getDirectoryPath()
      const targetPath = directoryPath ? `${directoryPath}/${file.name}` : file.name
      await saveFileContent(targetPath, reader.result?.toString() || '', `Upload ${file.name}`)
      if (uploadInputRef.current) {
        uploadInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  const handleDownload = () => {
    if (!fileContent?.content) return
    const blob = new Blob([fileContent.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileContent.name || 'file'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
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
          
          <div className="file-toolbar">
            <div className="branch-selector">
              <label htmlFor="branch-select">Branch</label>
              <select
                id="branch-select"
                value={currentBranch}
                onChange={(event) => setCurrentBranch(event.target.value)}
              >
                {branches.length > 0 ? (
                  branches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))
                ) : (
                  <option value="main">main</option>
                )}
              </select>
            </div>
            <div className="editor-controls">
              <button className="editor-btn" onClick={handleCreateFile}>
                + New File
              </button>
              <label className="editor-btn upload-btn">
                Upload File
                <input
                  type="file"
                  ref={uploadInputRef}
                  onChange={handleUpload}
                  hidden
                />
              </label>
            </div>
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
                  <button className="file-action-btn" onClick={handleDownload}>
                    Download
                  </button>
                  <button className="file-action-btn" onClick={() => setIsEditing(true)}>
                    Edit
                  </button>
                  <button className="file-action-btn danger" onClick={() => deleteFile(fileContent.path)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="file-content">
                {isEditing ? (
                  <div className="inline-editor">
                    <textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      className="editor-textarea"
                      rows="16"
                    />
                    <div className="editor-actions">
                      <button
                        className="file-action-btn primary"
                        onClick={() => saveFileContent(editingPath, editorContent, `Update ${fileContent.name}`)}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button className="file-action-btn" onClick={() => setIsEditing(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="code-block">
                    {fileContent.content.split('\n').map((line, index) => (
                      <div key={index} className="code-line">
                        <span className="line-number">{index + 1}</span>
                        <span className="line-content">{line}</span>
                      </div>
                    ))}
                  </pre>
                )}
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
                <div className="file-item-meta">
                  {file.size ? <span className="file-size">{formatFileSize(file.size)}</span> : null}
                  {file.type === 'blob' && (
                    <button
                      className="file-action-btn small"
                      onClick={(event) => {
                        event.preventDefault()
                        deleteFile(file.path)
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Empty directory
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default FileBrowser
