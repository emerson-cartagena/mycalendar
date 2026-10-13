import { Calendar, LogOut, Settings, Moon, Sun } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Header() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (!user) return null

  return (
    <header className="bg-white border-b border-gray-100 shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition">
          <Calendar className="text-primary-600" size={24} />
          <span className="font-bold text-lg dark:text-gray-100">MyCalendar</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400 hidden md:inline">
            {user.role === 'admin' ? '👨‍💼 Admin' : '👤 Usuario'} • {user.email}
          </span>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            aria-label="Cambiar tema"
            title="Cambiar tema"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user.role === 'admin' && (
            <Link to="/admin" className="btn-secondary text-sm flex items-center gap-1 px-2.5 sm:px-4" title="Admin">
              <Settings size={14} /> <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          <button onClick={handleLogout} className="btn-secondary text-sm flex items-center gap-1 px-2.5 sm:px-4" title="Salir">
            <LogOut size={14} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  )
}
