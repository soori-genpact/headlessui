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
  navigateSource?: string
  navigateKey?: number
}

interface Coordinate {
  page: number
  x1: number
  y1: number
  x2: number
  y2: number
  x3: number
  y3: number
  x4: number
  y4: number
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  attachmentId,
  documentName = 'Document',
  baseUrl,
  token,
  navigateSource,
  navigateKey
}) => {
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<'fit-width' | 'actual-size'>('actual-size')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [highlightCoords, setHighlightCoords] = useState<Coordinate[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const parseCoordinateString = (source: string): Coordinate | null => {
    const match = source.match(/D\((\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/)
    if (!match) return null
    return {
      page: Number.parseInt(match[1], 10),
      x1: Number.parseFloat(match[2]),
      y1: Number.parseFloat(match[3]),
      x2: Number.parseFloat(match[4]),
      y2: Number.parseFloat(match[5]),
      x3: Number.parseFloat(match[6]),
      y3: Number.parseFloat(match[7]),
      x4: Number.parseFloat(match[8]),
      y4: Number.parseFloat(match[9])
    }
  }

  const parseMultipleCoordinateStrings = (source?: string): Coordinate[] => {
    if (!source || typeof source !== 'string') return []
    return source
      .split(';')
      .map((item) => parseCoordinateString(item.trim()))
      .filter((item): item is Coordinate => Boolean(item))
  }

  useEffect(() => {
    const loadPDF = async () => {
      if (!attachmentId || !baseUrl || !token) {
        setPdfDoc(null)
        setTotalPages(0)
        setError('')
        setHighlightCoords([])
        return
      }

      try {
        setLoading(true)
        setError('')
        setPdfDoc(null)
        setHighlightCoords([])

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
    if (!navigateKey) return
    const parsed = parseMultipleCoordinateStrings(navigateSource)
    if (!parsed.length) return
    setHighlightCoords(parsed)
    const firstPage = parsed[0].page
    if (firstPage > 0) {
      setCurrentPage(firstPage)
    }
  }, [navigateKey, navigateSource])

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !annotationCanvasRef.current) return

      const page = await pdfDoc.getPage(currentPage)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const annotationCanvas = annotationCanvasRef.current
      const context = canvas.getContext('2d')
      const annotationContext = annotationCanvas.getContext('2d')

      if (!context || !annotationContext) return

      canvas.width = viewport.width
      canvas.height = viewport.height
      annotationCanvas.width = viewport.width
      annotationCanvas.height = viewport.height
      setPageSize({ width: Math.round(viewport.width), height: Math.round(viewport.height) })

      await page.render({
        canvasContext: context,
        viewport
      }).promise

      annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height)
      const coordsOnPage = highlightCoords.filter((coord) => coord.page === currentPage)
      const toPixels = (value: number) => value * 72 * scale

      coordsOnPage.forEach((coord) => {
        const x1 = toPixels(coord.x1)
        const y1 = toPixels(coord.y1)
        const x2 = toPixels(coord.x2)
        const y2 = toPixels(coord.y2)
        const x3 = toPixels(coord.x3) || x2
        const y3 = toPixels(coord.y3) || y2
        const x4 = toPixels(coord.x4) || x1
        const y4 = toPixels(coord.y4) || y1

        annotationContext.fillStyle = 'rgba(249, 115, 22, 0.25)'
        annotationContext.strokeStyle = 'rgba(249, 115, 22, 0.85)'
        annotationContext.lineWidth = 2

        annotationContext.beginPath()
        annotationContext.moveTo(x1, y1)
        annotationContext.lineTo(x2, y2)
        annotationContext.lineTo(x3, y3)
        annotationContext.lineTo(x4, y4)
        annotationContext.closePath()
        annotationContext.fill()
        annotationContext.stroke()
      })
    }

    void renderPage()
  }, [pdfDoc, currentPage, scale, highlightCoords])

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
            <canvas ref={annotationCanvasRef} className="annotation-canvas" />
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
