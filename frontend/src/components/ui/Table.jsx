import Spinner from './Spinner'

function SortIcon({ direction }) {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      {direction === 'asc' ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      )}
    </svg>
  )
}

export default function Table({
  columns,
  rows,
  keyField = 'id',
  loading = false,
  emptyMessage = 'Sin resultados',
  page = 1,
  pages = 1,
  onPageChange,
  sortKey,
  sortDir = 'asc',
  onSort,
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-v-border bg-v-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-v-border">
          <thead className="bg-v-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => onSort?.(col.key) : undefined}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-v-night' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <SortIcon direction={sortDir} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-v-border">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-10">
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row[keyField]} className="hover:bg-v-gray-50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-v-night">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-v-border px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-v-night hover:bg-v-gray-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-500">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-v-night hover:bg-v-gray-50 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
