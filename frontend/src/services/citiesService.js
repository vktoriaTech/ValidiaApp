const STORAGE_KEY = 'validia-cities'

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
}

const DEFAULT_CITIES = [
  { id: 'bogota', name: 'Bogotá', country: 'Colombia', active: true },
  { id: 'medellin', name: 'Medellín', country: 'Colombia', active: true },
  { id: 'cali', name: 'Cali', country: 'Colombia', active: true },
  { id: 'barranquilla', name: 'Barranquilla', country: 'Colombia', active: true },
  { id: 'cartagena', name: 'Cartagena', country: 'Colombia', active: true },
  { id: 'bucaramanga', name: 'Bucaramanga', country: 'Colombia', active: true },
  { id: 'pereira', name: 'Pereira', country: 'Colombia', active: true },
  { id: 'manizales', name: 'Manizales', country: 'Colombia', active: true },
  { id: 'cucuta', name: 'Cúcuta', country: 'Colombia', active: true },
  { id: 'ibague', name: 'Ibagué', country: 'Colombia', active: true },
]

function persist(cities) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cities))
}

export function getCities() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      persist(DEFAULT_CITIES)
      return DEFAULT_CITIES
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : DEFAULT_CITIES
  } catch {
    return DEFAULT_CITIES
  }
}

export function getActiveCityNames() {
  return getCities()
    .filter((city) => city.active)
    .map((city) => city.name)
}

function isDuplicateName(cities, { name, country, excludeId }) {
  return cities.some(
    (city) =>
      city.id !== excludeId &&
      city.name.trim().toLowerCase() === name.trim().toLowerCase() &&
      city.country === country,
  )
}

export function createCity(payload) {
  const cities = getCities()
  if (isDuplicateName(cities, { name: payload.name, country: payload.country })) {
    throw new Error('Ya existe una ciudad con ese nombre en ese país')
  }
  const newCity = { id: generateId(), ...payload }
  persist([...cities, newCity])
  return newCity
}

export function updateCity(id, payload) {
  const cities = getCities()
  const current = cities.find((city) => city.id === id)
  const name = payload.name ?? current?.name ?? ''
  const country = payload.country ?? current?.country ?? ''
  if (isDuplicateName(cities, { name, country, excludeId: id })) {
    throw new Error('Ya existe una ciudad con ese nombre en ese país')
  }
  const updated = cities.map((city) =>
    city.id === id ? { ...city, ...payload } : city,
  )
  persist(updated)
  return updated.find((city) => city.id === id)
}
