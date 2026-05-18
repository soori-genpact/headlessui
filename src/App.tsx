import { useState, useEffect } from 'react'
import authService from './services/authService'
import { ConfigPage } from './pages/ConfigPage'
import { AuditPage } from './pages/AuditPage'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/Toast'

type AppPage = 'config' | 'audit'

function parseAuditLocation() {
  const { pathname, search } = window.location
  const params = new URLSearchParams(search)
  const pathMatch = pathname.match(/^\/audit\/([^/]+)\/?$/)

  const submissionSysId = pathMatch?.[1] || params.get('submissionSysId') || ''
  const versionId = params.get('version') || params.get('versionId') || ''

  return {
    submissionSysId,
    versionId,
    isLegacyQueryFormat: !pathMatch && !!params.get('submissionSysId')
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('config')
  const [isInitialized, setIsInitialized] = useState(false)
  const [submissionSysId, setSubmissionSysId] = useState<string>('')
  const [versionId, setVersionId] = useState<string>('')

  useEffect(() => {
    const { submissionSysId: submissionId, versionId: versionIdParam, isLegacyQueryFormat } = parseAuditLocation()

    setSubmissionSysId(submissionId)
    setVersionId(versionIdParam)

    if (submissionId && isLegacyQueryFormat) {
      const nextUrl = versionIdParam
        ? `/audit/${submissionId}?version=${encodeURIComponent(versionIdParam)}`
        : `/audit/${submissionId}`
      window.history.replaceState({}, '', nextUrl)
    }

    // Check if user is already authenticated
    const config = authService.getConfig()
    authService.initializeApiClient()

    if (config) {
      if (submissionId) {
        setCurrentPage('audit')
      } else {
        setCurrentPage('config')
      }
    } else {
      setCurrentPage('config')
    }

    setIsInitialized(true)
  }, [])

  const handleConfigSaved = () => {
    setCurrentPage('audit')
  }

  const handleLogout = () => {
    authService.logout()
    setCurrentPage('config')
  }

  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }} />
          <p>Initializing application...</p>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="app-container">
        {currentPage === 'config' ? (
          <ConfigPage onConfigSaved={handleConfigSaved} />
        ) : (
          <AuditPage
            onLogout={handleLogout}
            submissionSysId={submissionSysId}
            versionId={versionId}
          />
        )}
      </div>
      <ToastContainer />
    </ToastProvider>
  )
}

export default App
