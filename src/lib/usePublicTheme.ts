import { useEffect, useState } from 'react'

const STORAGE_KEY = 'mycalendar-public-theme'

/**
 * Tema para páginas públicas (reserva, embed, acciones por email).
 * Claro por defecto siempre, independiente del tema del panel de administración.
 */
export function usePublicTheme() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem(STORAGE_KEY) === 'dark')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
    // El panel puede haber dejado la clase 'dark' en <html>; estas páginas manejan
    // su propio tema en un wrapper local, así que no debe heredarse.
    document.documentElement.classList.remove('dark')
  }, [isDark])

  return { isDark, toggle: () => setIsDark(d => !d) }
}
