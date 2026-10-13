import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Trash2, Shield, Edit2, ArrowLeft } from 'lucide-react'
import * as bcrypt from 'bcryptjs'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import type { User } from '../types'

export default function AdminPanelPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({ email: '', role: 'user' as 'admin' | 'user', password: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/dashboard')
      return
    }
    loadUsers()
  }, [user, navigate])

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase.from('users').select('*').order('created_at')
    if (!error && data) {
      setUsers(data as User[])
    } else {
      toast.error('Error cargando usuarios')
    }
    setLoading(false)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.email || !formData.password) {
      toast.error('Todos los campos son obligatorios')
      return
    }

    setCreating(true)
    try {
      // Encriptar contraseña con bcryptjs
      const hashedPassword = await bcrypt.hash(formData.password, 10)

      const { error } = await supabase.from('users').insert({
        email: formData.email.toLowerCase(),
        password: hashedPassword,
        role: formData.role,
      })

      if (error) throw error

      toast.success(`Usuario ${formData.email} creado como ${formData.role}`)
      setFormData({ email: '', role: 'user', password: '' })
      setShowForm(false)
      await loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario')
    } finally {
      setCreating(false)
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return

    if (!formData.password.trim()) {
      toast.error('La contraseña es obligatoria')
      return
    }

    setCreating(true)
    try {
      const hashedPassword = await bcrypt.hash(formData.password, 10)

      const { error } = await supabase
        .from('users')
        .update({
          password: hashedPassword,
          role: formData.role,
        })
        .eq('id', editingUser.id)

      if (error) throw error

      toast.success(`Usuario actualizado`)
      setEditingUser(null)
      setFormData({ email: '', role: 'user', password: '' })
      await loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar usuario')
    } finally {
      setCreating(false)
    }
  }

  function openEditModal(u: User) {
    setEditingUser(u)
    setFormData({ email: u.email, role: u.role, password: '' })
  }

  function closeEditModal() {
    setEditingUser(null)
    setFormData({ email: '', role: 'user', password: '' })
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`¿Eliminar usuario ${email}?`)) return

    try {
      const { error } = await supabase.from('users').delete().eq('id', userId)
      if (error) throw error
      toast.success('Usuario eliminado')
      await loadUsers()
    } catch (err) {
      toast.error('Error al eliminar')
    }
  }

  if (!user || user.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <ArrowLeft size={18} /> Volver al dashboard
        </button>

        {/* Botón crear usuario */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gestionar usuarios</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <UserPlus size={16} /> Crear usuario
          </button>
        </div>

        {/* Formulario crear/editar usuario */}
        {(showForm || editingUser) && (
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4 dark:text-gray-200">
              {editingUser ? `Editar ${editingUser.email}` : 'Nuevo usuario'}
            </h2>
            <form onSubmit={editingUser ? handleEditUser : handleCreateUser} className="space-y-4">
              {!editingUser && (
                <div>
                  <label className="label">Correo</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="usuario@ejemplo.com"
                    value={formData.email}
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                    required
                  />
                </div>
              )}

              <div>
                <label className="label">Contraseña</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="label">Rol</label>
                <select
                  className="input"
                  value={formData.role}
                  onChange={e => setFormData(p => ({ ...p, role: e.target.value as 'admin' | 'user' }))}
                >
                  <option value="user">Usuario</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={creating} className="btn-primary flex-1">
                  {creating ? '...' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
                </button>
                <button
                  type="button"
                  onClick={editingUser ? closeEditModal : () => setShowForm(false)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de usuarios */}
        <div className="card">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-gray-500 text-center py-6 dark:text-gray-400">No hay usuarios aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Correo</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Rol</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Creado</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 dark:text-gray-200">{u.email}</td>
                      <td className="py-3 px-4">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-medium dark:bg-purple-950/50 dark:text-purple-300">
                            <Shield size={12} /> Administrador
                          </span>
                        ) : (
                          <span className="text-gray-600 dark:text-gray-400">Usuario</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          {u.id !== user.id && (
                            <>
                              <button
                                onClick={() => openEditModal(u)}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors dark:text-blue-400 dark:hover:bg-blue-950/40"
                                title="Editar usuario"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors dark:text-red-400 dark:hover:bg-red-950/40"
                                title="Eliminar usuario"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
