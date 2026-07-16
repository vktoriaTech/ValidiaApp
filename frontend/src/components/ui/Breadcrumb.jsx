import { Link } from 'react-router-dom'

export default function Breadcrumb({ items }) {
  return (
    <nav className="mb-4 flex items-center gap-2 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={item.label} className="flex items-center gap-2">
            {isLast || !item.href ? (
              <span className="font-medium text-v-night">{item.label}</span>
            ) : (
              <Link
                to={item.href}
                className="text-gray-500 transition-colors hover:text-v-magenta"
              >
                {item.label}
              </Link>
            )}
            {!isLast && <span className="text-gray-300">/</span>}
          </span>
        )
      })}
    </nav>
  )
}
