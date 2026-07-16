export default function Spinner({ className = '', size = 'h-6 w-6' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${size} animate-spin rounded-full border-2 border-v-border border-t-v-magenta`}
      />
    </div>
  )
}
