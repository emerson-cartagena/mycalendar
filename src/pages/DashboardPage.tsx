import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, MoreVertical, Trash2, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header'
import type { Event, EventStatus } from '../types'
import { getEventStatus } from '../lib/date'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [owners, setOwners] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    loadEvents()
  }, [user, navigate])

  async function loadEvents() {
    setLoading(true)
    const query = user?.role === 'admin'
      ? supabase.from('events').select('*').order('date_start', { ascending: false })
      : supabase.from('events').select('*').eq('user_id', user!.id).order('date_start', { ascending: false })

    const { data, error } = await query
    if (error) {
      toast.error('Error cargando eventos')
      console.error(error)
    } else {
      const eventsData = (data as Event[]) ?? []
      setEvents(eventsData)

      // Si eres admin, carga el email del owner de cada evento
      if (user?.role === 'admin' && eventsData.length > 0) {
        const userIds = [...new Set(eventsData.map(e => e.user_id))]
        const { data: usersData } = await supabase
          .from('users')
          .select('id, email')
          .in('id', userIds)

        if (usersData) {
          const ownerMap = new Map<string, string>()
          usersData.forEach((u: any) => {
            ownerMap.set(u.id, u.email)
          })
          setOwners(ownerMap)
        }
      }
    }
    setLoading(false)
  }

  function openDeleteConfirm(eventId: string, title: string) {
    setDeleteConfirm({ id: eventId, title })
  }

  async function confirmDelete() {
    if (!deleteConfirm) return

    setDeleting(deleteConfirm.id)
    try {
      const { error } = await supabase.from('events').delete().eq('id', deleteConfirm.id)
      if (error) throw error
      toast.success('Evento eliminado')
      setDeleteConfirm(null)
      await loadEvents()
    } catch (err) {
      toast.error('Error al eliminar evento')
      console.error(err)
    } finally {
      setDeleting(null)
    }
  }

  if (!user) return null

  // Agrupar por estado
  const byStatus: Record<EventStatus, Event[]> = { past: [], active: [], future: [] }
  events.forEach(e => {
    const status = getEventStatus(e)
    byStatus[status].push(e)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Botón crear */}
        <div className="mb-8">
          <Link to="/create" className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Crear evento
          </Link>
        </div>

        {loading ? (
          <PageLoader />
        ) : events.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">No tienes eventos aún.</p>
            <Link to="/create" className="text-primary-600 hover:underline text-sm mt-2 inline-block">
              Crear uno ahora →
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Futuros */}
            {byStatus.future.length > 0 && (
              <EventGroup title="Próximos" icon="🚀" events={byStatus.future} onDelete={openDeleteConfirm} owners={owners} isAdmin={user.role === 'admin'} />
            )}

            {/* Activos */}
            {byStatus.active.length > 0 && (
              <EventGroup title="Activos" icon="🔴" events={byStatus.active} onDelete={openDeleteConfirm} owners={owners} isAdmin={user.role === 'admin'} />
            )}

            {/* Pasados */}
            {byStatus.past.length > 0 && (
              <EventGroup title="Pasados" icon="✓" events={byStatus.past} onDelete={openDeleteConfirm} isPast owners={owners} isAdmin={user.role === 'admin'} />
            )}
          </div>
        )}

        {/* Modal de confirmación de eliminación */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-sm w-full">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar evento?</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Se eliminarán el evento "{deleteConfirm.title}" y todas sus reservas. Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deleting !== null}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleting !== null}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deleting ? '...' : <>
                      <Trash2 size={16} />
                      Eliminar
                    </>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function EventGroup({ title, icon, events, isPast, onDelete, owners, isAdmin }: {
  title: string
  icon: string
  events: Event[]
  isPast?: boolean
  onDelete: (id: string, title: string) => void
  owners?: Map<string, string>
  isAdmin?: boolean
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <span>{icon}</span> {title} ({events.length})
      </h2>
      <div className="grid gap-4">
        {events.map(e => (
          <div key={e.id} className="card p-4 flex items-start justify-between hover:shadow-md transition-shadow group">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">{e.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {e.date_start} a {e.date_end} • {e.time_start}-{e.time_end}
              </p>
              {isAdmin && owners?.has(e.user_id) && (
                <p className="text-xs text-gray-400 mt-1">Organizado por: {owners.get(e.user_id)}</p>
              )}
              {e.description && (
                <p className="text-sm text-gray-600 mt-1 line-clamp-1">{e.description}</p>
              )}
            </div>
            <div className="flex gap-2 ml-4 flex-shrink-0">
              <Link to={`/manage/${e.id}`} className="btn-primary text-xs py-1.5">
                Ver
              </Link>
              
              {/* Menú desplegable */}
              <div className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === e.id ? null : e.id)}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded transition-colors"
                  title="Más opciones"
                >
                  <MoreVertical size={16} />
                </button>

                {/* Dropdown */}
                {openMenu === e.id && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-10">
                    {!isPast && (
                      <Link
                        to={`/edit/${e.id}`}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg flex items-center gap-2"
                        onClick={() => setOpenMenu(null)}
                      >
                        <Edit2 size={14} /> Editar
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setOpenMenu(null)
                        onDelete(e.id, e.title)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 last:rounded-b-lg flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  )
}
