import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      tenant: null,

      setAuth: ({ token, user, tenant }) => set({ token, user, tenant }),

      clearAuth: () => set({ token: null, user: null, tenant: null }),
    }),
    {
      name: 'validia-auth',
    },
  ),
)
