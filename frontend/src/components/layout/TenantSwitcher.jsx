export default function TenantSwitcher({ tenants, tenantId, onChange }) {
  if (!tenants.length) return null

  return (
    <select
      value={tenantId ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-v-border bg-v-white px-3 py-2 text-sm text-v-night focus:outline-none focus:ring-2 focus:ring-v-magenta"
    >
      {tenants.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name}
        </option>
      ))}
    </select>
  )
}
