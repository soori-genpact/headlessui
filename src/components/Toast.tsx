import React from 'react'
import { useToast } from '../context/ToastContext'
import '../styles/toast.css'

export const ToastContainer: React.FC = () => {
  const { toasts } = useToast()

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role="alert"
          aria-live="polite"
        >
          <div className="toast-content">
            {toast.type === 'success' && <i className="fas fa-check-circle toast-icon" />}
            {toast.type === 'error' && <i className="fas fa-exclamation-circle toast-icon" />}
            {toast.type === 'info' && <i className="fas fa-info-circle toast-icon" />}
            {toast.type === 'warning' && <i className="fas fa-warning toast-icon" />}
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
