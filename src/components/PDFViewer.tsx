import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min?url'
import { useToast } from '../context/ToastContext'
import '../styles/pdfViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PDFViewerProps {
  attachmentId?: string
  documentName?: string
  baseUrl?: string
  token?: string
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  attachmentId,
  documentName = 'Document',
  baseUrl,
  token
}) => {
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<'fit-width' | 'actual-size'>('actual-size')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    const loadPDF = async () => {
      if (!attachmentId || !baseUrl || !token) {
        setPdfDoc(null)
        setTotalPages(0)
        setError('')
        return
      }

      try {
        setLoading(true)
        setError('')
        setPdfDoc(null)

        const url = `${baseUrl}/api/x_gegis_uwm_dashbo/v1/auditpageapi/attachment/${attachmentId}?format=binary`
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`)
        }

        const pdfBytes = await response.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
        const firstPage = await pdf.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })

        setPdfDoc(pdf)
        setTotalPages(pdf.numPages)
        setCurrentPage(1)
        setPageSize({ width: viewport.width, height: viewport.height })
        showToast(`Loaded ${pdf.numPages} pages`, 'success', 2500)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load PDF'
        setError(message)
        showToast(`PDF Error: ${message}`, 'error', 5000)
      } finally {
        setLoading(false)
      }
    }

    void loadPDF()
  }, [attachmentId, baseUrl, token, showToast])

  useEffect(() => {
    const updateFitWidth = async () => {
      if (!pdfDoc || !contentRef.current || zoomMode !== 'fit-width') return
      const page = await pdfDoc.getPage(currentPage)
      const viewport = page.getViewport({ scale: 1 })
      const availableWidth = Math.max(contentRef.current.clientWidth - 64, 320)
      setScale(availableWidth / viewport.width)
    }

    void updateFitWidth()
  }, [pdfDoc, currentPage, zoomMode])

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return

      const page = await pdfDoc.getPage(currentPage)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      if (!context) return

      canvas.width = viewport.width
      canvas.height = viewport.height
      setPageSize({ width: Math.round(viewport.width), height: Math.round(viewport.height) })

      await page.render({
        canvasContext: context,
        viewport
      }).promise
    }

    void renderPage()
  }, [pdfDoc, currentPage, scale])

  const fitWidth = () => setZoomMode('fit-width')
  const actual100Percent = () => {
    setZoomMode('actual-size')
    setScale(1)
  }

  return (
    <div className="pdf-panel">
      <div className="pdf-header">
        <div className="pdf-title">
          <i className="fas fa-file-pdf" />
          <span>{documentName || 'No document selected'}</span>
        </div>

        <div className="pdf-controls">
          <div className="control-group">
            <button
              onClick={fitWidth}
              disabled={loading || !pdfDoc}
              className={`btn-icon ${zoomMode === 'fit-width' ? 'active' : ''}`}
              title="Fit to Width"
            >
              <i className="fa-solid fa-arrows-left-right-to-line" />
            </button>
            <button
              onClick={actual100Percent}
              disabled={loading || !pdfDoc}
              className={`btn-icon ${zoomMode === 'actual-size' ? 'active' : ''}`}
              title="Actual Size"
            >
              <i className="fa-solid fa-text-height" />
            </button>
          </div>

          <div className="control-group">
            <button
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              disabled={currentPage <= 1 || loading}
              className="btn-icon"
              title="Previous Page"
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="page-info">Page {currentPage} of {Math.max(totalPages, 0)}</div>
            <button
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              disabled={currentPage >= totalPages || loading}
              className="btn-icon"
              title="Next Page"
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      </div>

      <div className="pdf-content" ref={contentRef}>
        {loading && (
          <div className="pdf-loading-overlay">
            <div className="pdf-loader">
              <i className="fas fa-spinner fa-spin" />
              <span>Loading PDF...</span>
            </div>
          </div>
        )}

        {!loading && (!!error || !attachmentId) && (
          <div className="pdf-placeholder">
            <div className="placeholder-content">
              <i className="fas fa-file-pdf placeholder-icon" />
              <h3 className="placeholder-title">No Document Available</h3>
              <p className="placeholder-text">{error || 'Select a document to view'}</p>
            </div>
          </div>
        )}

        {!loading && !error && !!pdfDoc && (
          <div className="pdf-canvas-wrapper">
            <canvas ref={canvasRef} className="pdf-canvas" />
            <canvas className="annotation-canvas" />
            <div className="page-marker" />
          </div>
        )}
      </div>

      <div className="pdf-footer">
        <div className="footer-content">
          <span className="footer-item">
            <i className="fas fa-file" />
            {pageSize ? `A4: ${pageSize.width} x ${pageSize.height} points` : 'A4'}
          </span>
          <span className="footer-item">
            <i className="fas fa-expand" />
            Scale: {Math.round(scale * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}
