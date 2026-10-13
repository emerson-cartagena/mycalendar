import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CreateEventPage from './pages/CreateEventPage'
import EditEventPage from './pages/EditEventPage'
import ManageEventPage from './pages/ManageEventPage'
import AdminPanelPage from './pages/AdminPanelPage'
import BookingPage from './pages/BookingPage'
import EmbedPage from './pages/EmbedPage'
import BookingActionPage from './pages/BookingActionPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  
  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
  if (!user) return <Navigate to="/login" replace />
  
  return <>{children}</>
}

// Rutas del panel (login + área protegida): tema oscuro por defecto, con toggle en el Header.
function AdminApp() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreateEventPage /></ProtectedRoute>} />
        <Route path="/edit/:eventId" element={<ProtectedRoute><EditEventPage /></ProtectedRoute>} />
        <Route path="/manage/:eventId" element={<ProtectedRoute><ManageEventPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPanelPage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ThemeProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: '!bg-white !text-gray-900 dark:!bg-gray-800 dark:!text-gray-100',
          }}
        />
        <Routes>
          {/* Enlaces públicos: siempre claros por defecto, con su propio toggle (no heredan el tema del panel) */}
          <Route path="/book/:eventSlug" element={<BookingPage />} />
          <Route path="/embed/:eventSlug" element={<EmbedPage />} />
          <Route path="/booking-action" element={<BookingActionPage />} />

          {/* Panel: login + rutas protegidas */}
          <Route path="/*" element={<AdminApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
