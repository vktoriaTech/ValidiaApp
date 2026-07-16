const VARIANTS = {
  primary:
    'bg-v-magenta text-v-white hover:bg-v-magenta-deep focus-visible:ring-v-magenta',
  secondary:
    'bg-v-white text-v-night border border-v-border hover:bg-v-gray-50 focus-visible:ring-v-night',
  ghost:
    'bg-transparent text-v-night hover:bg-v-gray-50 focus-visible:ring-v-night',
}

export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
