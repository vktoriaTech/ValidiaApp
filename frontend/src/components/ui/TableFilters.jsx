export default function TableFilters({
  search,
  onSearchChange,
  searchPlaceholder,
  statusOptions,
  statusValue,
  onStatusChange,
}) {
  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full max-w-md rounded-lg border border-v-border bg-v-white px-3.5 py-2.5 text-sm text-v-night placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-v-magenta"
      />
      {statusOptions && (
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusChange(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusValue === option.value
                  ? 'bg-v-magenta text-v-white'
                  : 'bg-v-gray-50 text-gray-600 hover:bg-v-border/60'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
