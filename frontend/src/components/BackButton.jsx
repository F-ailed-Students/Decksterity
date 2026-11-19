import { ArrowLeft } from 'lucide-react'

export default function BackButton({ label, onClick }) {
  return (
    <button type="button" className="btn-back" onClick={onClick}>
      <ArrowLeft size={16} />
      {label}
    </button>
  )
}
