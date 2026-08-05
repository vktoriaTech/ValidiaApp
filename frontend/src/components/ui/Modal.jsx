import { useEffect } from 'react'

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  stickyHeader,
  fixedLayout = false,
  maxWidth = 'max-w-lg',
}) {
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  if (fixedLayout) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={onClose}
      >
        <div
          className={`flex w-full ${maxWidth} flex-col overflow-hidden rounded-xl bg-v-white shadow-xl`}
          style={{ maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header fijo: título + cerrar */}
          <div className="flex shrink-0 items-center justify-between border-b border-v-border px-6 py-4">
            <h2 className="text-lg font-semibold text-v-night">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-full p-1 text-gray-400 hover:bg-v-gray-50 hover:text-v-night"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Steps bar u otro header pegajoso */}
          {stickyHeader && (
            <div className="shrink-0 border-b border-v-border px-6 py-4">
              {stickyHeader}
            </div>
          )}

          {/* Contenido scrolleable */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>

          {/* Footer fijo: botones */}
          {footer && (
            <div className="shrink-0 border-t border-v-border px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Layout original (para modales que no necesitan scroll interno)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl bg-v-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-v-night">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1 text-gray-400 hover:bg-v-gray-50 hover:text-v-night"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}
