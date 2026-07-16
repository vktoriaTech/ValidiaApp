export default function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`rounded-xl border border-v-border bg-v-white p-6 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
