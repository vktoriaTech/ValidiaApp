const STORAGE_KEY = 'validia-cities'

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

export function createCity(payload) {
  const cities = getCities()
  const newCity = { id: crypto.randomUUID(), ...payload }
  persist([...cities, newCity])
  return newCity
}

export function updateCity(id, payload) {
  const cities = getCities().map((city) =>
    city.id === id ? { ...city, ...payload } : city,
  )
  persist(cities)
  return cities.find((city) => city.id === id)
}
