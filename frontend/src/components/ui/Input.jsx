import { forwardRef } from 'react'

const Input = forwardRef(function Input(
  { label, error, id, className = '', ...props },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-v-night">
          {label}
        </label>
      )}
      <input
        id={id}
        ref={ref}
        className={`w-full rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-v-magenta focus:border-transparent ${
          error ? 'border-red-400 focus:ring-red-400' : ''
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
})

export default Input
