import Modal from './Modal'
import Button from './Button'

export default function ConfirmModal({
  isOpen,
  title = 'Confirmar acción',
  message,
  onConfirm,
  onCancel,
  confirming = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p className="text-sm text-gray-600">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={confirming}
          onClick={onConfirm}
        >
          {confirming ? 'Procesando...' : 'Confirmar'}
        </Button>
      </div>
    </Modal>
  )
}
