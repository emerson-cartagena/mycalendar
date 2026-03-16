import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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
  
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
  if (!user) return <Navigate to="/login" replace />
  
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/book/:eventSlug" element={<BookingPage />} />
          <Route path="/embed/:eventSlug" element={<EmbedPage />} />
          <Route path="/booking-action" element={<BookingActionPage />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute><CreateEventPage /></ProtectedRoute>} />
          <Route path="/edit/:eventId" element={<ProtectedRoute><EditEventPage /></ProtectedRoute>} />
          <Route path="/manage/:eventId" element={<ProtectedRoute><ManageEventPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPanelPage /></ProtectedRoute>} />

          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
