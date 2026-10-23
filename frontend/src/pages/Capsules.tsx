import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Camera, Plus, Search, CalendarDays, MapPin, Trash2, Edit2,
  ArrowLeft, Upload, Image as ImageIcon, Video as VideoIcon,
  ChevronLeft, ChevronRight, X, BookOpen, Clock,
  Maximize2, MoveUp, MoveDown, AlertCircle, Loader2
} from 'lucide-react'
import { capsuleApi } from '../services/capsuleApi'
import { getErrorMessage } from '../services/api'
import type { Capsule, CapsuleCreate, Memory, MemoryCreate } from '../types/capsule'
import DestinationInput from '../components/DestinationInput'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

export default function Capsules() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [capsules, setCapsules] = useState<Capsule[]>([])
  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set())

  const markImageFailed = (url: string) => {
    if (!url) return
    setFailedImageUrls(prev => {
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAddMemoryModalOpen, setIsAddMemoryModalOpen] = useState(false)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [deletingCapsuleId, setDeletingCapsuleId] = useState<number | null>(null)
  const [deletingMemoryId, setDeletingMemoryId] = useState<number | null>(null)

  // Lightbox / Slideshow state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Form states
  const [capsuleForm, setCapsuleForm] = useState<CapsuleCreate>({
    title: '',
    description: '',
    destination: '',
    start_date: '',
    end_date: '',
    cover_image_url: '',
  })

  const [memoryForm, setMemoryForm] = useState<MemoryCreate>({
    title: '',
    note: '',
    memory_date: '',
    location: '',
    media_type: 'image',
    media_url: '',
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadTab, setUploadTab] = useState<'file' | 'url'>('file')

  // Load capsules
  const loadCapsules = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await capsuleApi.list()
      setCapsules(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load capsules')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadCapsules()
  }, [loadCapsules])

  // Load selected capsule detail
  const loadCapsuleDetail = async (id: number) => {
    try {
      setLoading(true)
      const data = await capsuleApi.get(id)
      setSelectedCapsule(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load capsule details')
    } finally {
      setLoading(false)
    }
  }

  // Filtered capsules
  const filteredCapsules = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return capsules
    return capsules.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.destination && c.destination.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q))
    )
  }, [capsules, search])

  // Create Capsule handler
  const handleCreateCapsule = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!capsuleForm.title.trim()) {
      setFormError('Capsule title is required.')
      return
    }
    if (capsuleForm.start_date && capsuleForm.end_date && capsuleForm.end_date < capsuleForm.start_date) {
      setFormError('End date cannot be earlier than start date.')
      return
    }

    try {
      setLoading(true)
      const created = await capsuleApi.create(capsuleForm)
      setIsCreateModalOpen(false)
      setCapsuleForm({
        title: '',
        description: '',
        destination: '',
        start_date: '',
        end_date: '',
        cover_image_url: '',
      })
      await loadCapsules()
      setSelectedCapsule(created)
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Edit Capsule handler
  const handleUpdateCapsule = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!selectedCapsule || !capsuleForm.title.trim()) {
      setFormError('Capsule title is required.')
      return
    }
    if (capsuleForm.start_date && capsuleForm.end_date && capsuleForm.end_date < capsuleForm.start_date) {
      setFormError('End date cannot be earlier than start date.')
      return
    }

    try {
      setLoading(true)
      const updated = await capsuleApi.update(selectedCapsule.id, capsuleForm)
      setSelectedCapsule(updated)
      setIsEditModalOpen(false)
      await loadCapsules()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Delete Capsule handler
  const handleDeleteCapsule = async () => {
    if (!deletingCapsuleId) return
    try {
      setLoading(true)
      await capsuleApi.delete(deletingCapsuleId)
      setDeletingCapsuleId(null)
      if (selectedCapsule?.id === deletingCapsuleId) {
        setSelectedCapsule(null)
      }
      await loadCapsules()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Add Memory handler
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!selectedCapsule) return

    try {
      setUploading(true)
      let mediaUrl = memoryForm.media_url
      let mediaType = memoryForm.media_type || 'image'

      if (uploadTab === 'file') {
        if (!uploadFile) {
          setFormError('Please select a photo or video file to upload.')
          setUploading(false)
          return
        }
        const uploadRes = await capsuleApi.uploadMedia(selectedCapsule.id, uploadFile)
        mediaUrl = uploadRes.media_url
        mediaType = uploadRes.media_type
      }

      if (!mediaUrl.trim()) {
        setFormError('Please provide a photo or video file or URL.')
        setUploading(false)
        return
      }

      await capsuleApi.addMemory(selectedCapsule.id, {
        ...memoryForm,
        media_url: mediaUrl,
        media_type: mediaType,
      })

      setIsAddMemoryModalOpen(false)
      setMemoryForm({
        title: '',
        note: '',
        memory_date: '',
        location: '',
        media_type: 'image',
        media_url: '',
      })
      setUploadFile(null)
      setUploadPreview(null)
      await loadCapsuleDetail(selectedCapsule.id)
      await loadCapsules()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  // Edit Memory handler
  const handleUpdateMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!selectedCapsule || !editingMemory) return

    try {
      await capsuleApi.updateMemory(selectedCapsule.id, editingMemory.id, {
        title: editingMemory.title ?? undefined,
        note: editingMemory.note ?? undefined,
        memory_date: editingMemory.memory_date ?? undefined,
        location: editingMemory.location ?? undefined,
      })
      setEditingMemory(null)
      await loadCapsuleDetail(selectedCapsule.id)
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    }
  }

  // Delete Memory handler
  const handleDeleteMemory = async () => {
    if (!selectedCapsule || !deletingMemoryId) return
    try {
      await capsuleApi.deleteMemory(selectedCapsule.id, deletingMemoryId)
      setDeletingMemoryId(null)
      await loadCapsuleDetail(selectedCapsule.id)
      await loadCapsules()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  // Reorder memories
  const handleMoveMemory = async (memoryId: number, direction: 'up' | 'down') => {
    if (!selectedCapsule?.memories) return
    const list = [...selectedCapsule.memories]
    const idx = list.findIndex(m => m.id === memoryId)
    if (idx < 0) return

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= list.length) return

    // Swap
    const temp = list[idx]
    list[idx] = list[targetIdx]
    list[targetIdx] = temp

    const ids = list.map(m => m.id)
    try {
      const reordered = await capsuleApi.reorderMemories(selectedCapsule.id, ids)
      setSelectedCapsule({ ...selectedCapsule, memories: reordered })
    } catch (err: unknown) {
      console.error('Failed to reorder memories', err)
    }
  }

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (lightboxIndex === null || !selectedCapsule?.memories) return
      if (e.key === 'ArrowRight') {
        setLightboxIndex((lightboxIndex + 1) % selectedCapsule.memories.length)
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex(
          (lightboxIndex - 1 + selectedCapsule.memories.length) % selectedCapsule.memories.length
        )
      } else if (e.key === 'Escape') {
        setLightboxIndex(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex, selectedCapsule])

  // Guest view for visitors who are not logged in
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-16">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Camera size={24} className="text-accent-600 dark:text-teal-400" />
              Memory Capsules
            </h1>
            <p className="page-subtitle">Preserve travel moments, photos, videos, and personal memories</p>
          </div>
        </div>

        <div className="card text-center py-12 px-6 max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
            <Camera size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-surface-900 dark:text-slate-100">
              Your Personal Travel Time Capsule
            </h2>
            <p className="text-sm text-surface-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
              Create digital capsules for every journey. Upload trip photos and videos, organize moments into a timeline, add captions, and revisit your adventures anytime.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-left pt-2">
            <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/50">
              <span className="text-xl">📸</span>
              <h3 className="font-semibold text-xs text-surface-900 dark:text-slate-100 mt-2">Media Uploads</h3>
              <p className="text-[11px] text-surface-500 dark:text-slate-400 mt-1">Store high-resolution photos and video clips with secure persistence.</p>
            </div>
            <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/50">
              <span className="text-xl">🗺️</span>
              <h3 className="font-semibold text-xs text-surface-900 dark:text-slate-100 mt-2">Trip Timelines</h3>
              <p className="text-[11px] text-surface-500 dark:text-slate-400 mt-1">Organize memories chronologically with dates and destination tags.</p>
            </div>
            <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/50">
              <span className="text-xl">🔒</span>
              <h3 className="font-semibold text-xs text-surface-900 dark:text-slate-100 mt-2">Private & Safe</h3>
              <p className="text-[11px] text-surface-500 dark:text-slate-400 mt-1">Each capsule is strictly tied to your account and shielded from others.</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4">
            <Link to="/login" state={{ from: '/capsules' }} className="btn-primary text-sm px-5 py-2.5">
              Sign In to Open Capsules
            </Link>
            <Link to="/register" state={{ from: '/capsules' }} className="btn-secondary text-sm px-5 py-2.5">
              Create Free Account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ──────────────────────────────────────────────────────────────────────────
          VIEW 1: CAPSULE DETAIL / SCRAPBOOK VIEW
         ────────────────────────────────────────────────────────────────────────── */}
      {selectedCapsule ? (
        <div className="space-y-6 animate-in fade-in">
          {/* Top Bar Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedCapsule(null)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all hover:opacity-80 cursor-pointer"
              style={{
                background: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <ArrowLeft size={16} />
              All Memory Capsules
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCapsuleForm({
                    title: selectedCapsule.title,
                    description: selectedCapsule.description || '',
                    destination: selectedCapsule.destination || '',
                    start_date: selectedCapsule.start_date || '',
                    end_date: selectedCapsule.end_date || '',
                    cover_image_url: selectedCapsule.cover_image_url || '',
                  })
                  setIsEditModalOpen(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                style={{
                  background: 'var(--color-card-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <Edit2 size={14} />
                Edit Capsule
              </button>
              <button
                onClick={() => setDeletingCapsuleId(selectedCapsule.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>

          {/* Capsule Hero Banner */}
          <div
            className="rounded-3xl border overflow-hidden relative shadow-lg"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            {selectedCapsule.cover_image_url && !failedImageUrls.has(selectedCapsule.cover_image_url) ? (
              <div className="relative h-64 sm:h-80 w-full overflow-hidden">
                <img
                  src={selectedCapsule.cover_image_url}
                  alt={selectedCapsule.title}
                  className="w-full h-full object-cover"
                  onError={() => markImageFailed(selectedCapsule.cover_image_url!)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <div className="flex flex-wrap items-center gap-2.5 mb-2">
                    {selectedCapsule.destination && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md font-medium text-white">
                        <MapPin size={12} /> {selectedCapsule.destination}
                      </span>
                    )}
                    {(selectedCapsule.start_date || selectedCapsule.end_date) && (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md font-medium text-white">
                        <CalendarDays size={12} />
                        {selectedCapsule.start_date} {selectedCapsule.end_date ? `→ ${selectedCapsule.end_date}` : ''}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight drop-shadow-md">
                    {selectedCapsule.title}
                  </h1>
                  {selectedCapsule.description && (
                    <p className="mt-2 text-sm sm:text-base text-white/90 max-w-2xl line-clamp-2">
                      {selectedCapsule.description}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 sm:p-10 bg-gradient-to-br from-teal-500/10 via-transparent to-amber-500/10">
                <div className="flex flex-wrap items-center gap-2.5 mb-3">
                  {selectedCapsule.destination && (
                    <span
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium"
                      style={{
                        background: 'var(--color-card-bg)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <MapPin size={12} /> {selectedCapsule.destination}
                    </span>
                  )}
                  {(selectedCapsule.start_date || selectedCapsule.end_date) && (
                    <span
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium"
                      style={{
                        background: 'var(--color-card-bg)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <CalendarDays size={12} />
                      {selectedCapsule.start_date} {selectedCapsule.end_date ? `→ ${selectedCapsule.end_date}` : ''}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
                  {selectedCapsule.title}
                </h1>
                {selectedCapsule.description && (
                  <p className="mt-2 text-sm sm:text-base max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
                    {selectedCapsule.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Memories Section Header */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                <Camera size={20} style={{ color: 'var(--color-accent)' }} />
                Preserved Memories ({selectedCapsule.memories?.length ?? 0})
              </h2>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                Photos, videos and personal reflections saved in this capsule.
              </p>
            </div>

            <button
              onClick={() => {
                setFormError(null)
                setMemoryForm({
                  title: '',
                  note: '',
                  memory_date: selectedCapsule.start_date || '',
                  location: selectedCapsule.destination || '',
                  media_type: 'image',
                  media_url: '',
                })
                setUploadFile(null)
                setUploadPreview(null)
                setIsAddMemoryModalOpen(true)
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white shadow-md hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              style={{ background: 'var(--color-accent, #0d9488)' }}
            >
              <Plus size={16} />
              Add Memory
            </button>
          </div>

          {/* Memories Scrapbook Timeline Grid */}
          {!selectedCapsule.memories || selectedCapsule.memories.length === 0 ? (
            <div
              className="rounded-3xl border p-12 text-center space-y-4 shadow-sm"
              style={{
                background: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'var(--color-surface-100)', color: 'var(--color-accent)' }}
              >
                <Camera size={32} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                This capsule is waiting for memories
              </h3>
              <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--color-text-muted)' }}>
                Add your favorite vacation photos, tickets, sunset snaps, and personal reflections to build your digital scrapbook.
              </p>
              <button
                onClick={() => setIsAddMemoryModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
                style={{ background: 'var(--color-accent)' }}
              >
                <Plus size={16} /> Add First Memory
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {selectedCapsule.memories.map((memory, idx) => (
                <div
                  key={memory.id}
                  className="rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
                  style={{
                    background: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {/* Media container */}
                  <div className="relative aspect-4/3 w-full bg-black/5 overflow-hidden">
                    {failedImageUrls.has(memory.media_url) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-surface-100 dark:bg-slate-800 text-surface-400">
                        <ImageIcon size={32} className="opacity-40 mb-1" />
                        <span className="text-xs font-medium opacity-70">Media unavailable</span>
                      </div>
                    ) : memory.media_type === 'video' ? (
                      <video
                        src={memory.media_url}
                        controls
                        className="w-full h-full object-cover"
                        onError={() => markImageFailed(memory.media_url)}
                      />
                    ) : (
                      <img
                        src={memory.media_url}
                        alt={memory.title || 'Memory photo'}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                        loading="lazy"
                        onError={() => markImageFailed(memory.media_url)}
                      />
                    )}

                    {/* Lightbox Trigger overlay */}
                    {memory.media_type === 'image' && (
                      <button
                        onClick={() => setLightboxIndex(idx)}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-black/50 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 cursor-pointer"
                        title="View full-screen"
                      >
                        <Maximize2 size={14} />
                      </button>
                    )}

                    {/* Media Type pill */}
                    <div className="absolute top-3 left-3 flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
                      {memory.media_type === 'video' ? <VideoIcon size={11} /> : <ImageIcon size={11} />}
                      <span>{memory.media_type === 'video' ? 'Video' : 'Photo'}</span>
                    </div>
                  </div>

                  {/* Memory details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        <span className="flex items-center gap-1">
                          {memory.memory_date && (
                            <>
                              <CalendarDays size={12} /> {memory.memory_date}
                            </>
                          )}
                        </span>
                        {memory.location && (
                          <span className="flex items-center gap-1 truncate max-w-[150px]">
                            <MapPin size={12} /> {memory.location}
                          </span>
                        )}
                      </div>

                      {memory.title && (
                        <h4 className="font-bold text-sm sm:text-base mt-1" style={{ color: 'var(--color-text-primary)' }}>
                          {memory.title}
                        </h4>
                      )}

                      {memory.note && (
                        <p className="text-xs sm:text-sm mt-1.5 leading-relaxed line-clamp-3" style={{ color: 'var(--color-text-secondary)' }}>
                          {memory.note}
                        </p>
                      )}
                    </div>

                    {/* Action controls */}
                    <div className="flex items-center justify-between pt-3 border-t text-xs" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveMemory(memory.id, 'up')}
                          disabled={idx === 0}
                          title="Move memory earlier"
                          className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-opacity cursor-pointer"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <MoveUp size={13} />
                        </button>
                        <button
                          onClick={() => handleMoveMemory(memory.id, 'down')}
                          disabled={idx === selectedCapsule.memories.length - 1}
                          title="Move memory later"
                          className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 transition-opacity cursor-pointer"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <MoveDown size={13} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setFormError(null)
                            setEditingMemory(memory)
                          }}
                          className="hover:underline flex items-center gap-1 cursor-pointer"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => setDeletingMemoryId(memory.id)}
                          className="text-red-500 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ──────────────────────────────────────────────────────────────────────────
           VIEW 2: ALL CAPSULES GALLERY VIEW
           ────────────────────────────────────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--color-text-primary)' }}>
                <BookOpen size={26} style={{ color: 'var(--color-accent)' }} />
                Memory Capsules
              </h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Your personal travel journal and digital scrapbook. Preserve memories, photos, and reflections from every adventure.
              </p>
            </div>

            <button
              onClick={() => {
                setCapsuleForm({
                  title: '',
                  description: '',
                  destination: '',
                  start_date: '',
                  end_date: '',
                  cover_image_url: '',
                })
                setIsCreateModalOpen(true)
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md hover:brightness-105 active:scale-95 transition-all cursor-pointer self-start sm:self-auto"
              style={{ background: 'var(--color-accent, #0d9488)' }}
            >
              <Plus size={16} />
              New Memory Capsule
            </button>
          </div>

          {/* Search bar */}
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="Search capsules by title, destination, or note…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-colors"
              style={{
                background: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl border flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Loading state */}
          {loading && capsules.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 size={32} className="animate-spin mx-auto text-teal-600" />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading your capsules…</p>
            </div>
          ) : filteredCapsules.length === 0 ? (
            /* Empty state */
            <div
              className="rounded-3xl border p-12 sm:p-16 text-center space-y-4 shadow-sm"
              style={{
                background: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'var(--color-surface-100)', color: 'var(--color-accent)' }}
              >
                <BookOpen size={32} />
              </div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {search ? 'No matching capsules found' : 'No memory capsules yet'}
              </h2>
              <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--color-text-muted)' }}>
                {search
                  ? 'Try searching with a different keyword or destination.'
                  : 'Capture the magic of your journeys. Create a capsule for your Goa beach trip, a friend’s wedding, or a weekend trek.'}
              </p>
              {!search && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md cursor-pointer"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <Plus size={16} /> Create Your First Capsule
                </button>
              )}
            </div>
          ) : (
            /* Capsules Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCapsules.map(capsule => (
                <div
                  key={capsule.id}
                  onClick={() => loadCapsuleDetail(capsule.id)}
                  className="rounded-3xl border overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col cursor-pointer group"
                  style={{
                    background: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {/* Card Cover */}
                  <div className="relative aspect-16/10 w-full overflow-hidden bg-gradient-to-br from-teal-500/20 via-sky-500/10 to-amber-500/20">
                    {capsule.cover_image_url && !failedImageUrls.has(capsule.cover_image_url) ? (
                      <img
                        src={capsule.cover_image_url}
                        alt={capsule.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        onError={() => markImageFailed(capsule.cover_image_url!)}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-surface-400 p-6 text-center">
                        <Camera size={36} className="opacity-40 mb-1" style={{ color: 'var(--color-accent)' }} />
                        <span className="text-xs font-medium opacity-60">Ready for memories</span>
                      </div>
                    )}

                    {/* Memory count badge */}
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-md">
                      <Camera size={12} />
                      <span>{capsule.memory_count} {capsule.memory_count === 1 ? 'memory' : 'memories'}</span>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        {capsule.destination && (
                          <span className="flex items-center gap-1 font-medium text-teal-600 dark:text-teal-400">
                            <MapPin size={12} /> {capsule.destination}
                          </span>
                        )}
                        {(capsule.start_date || capsule.end_date) && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {capsule.start_date}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-lg leading-snug group-hover:text-teal-600 transition-colors" style={{ color: 'var(--color-text-primary)' }}>
                        {capsule.title}
                      </h3>

                      {capsule.description && (
                        <p className="mt-1.5 text-xs sm:text-sm line-clamp-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {capsule.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)' }}>
                      <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                        Open Capsule →
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setDeletingCapsuleId(capsule.id)
                        }}
                        className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                        title="Delete capsule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 1: CREATE CAPSULE MODAL
         ────────────────────────────────────────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="rounded-3xl border w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <BookOpen size={18} style={{ color: 'var(--color-accent)' }} />
                <h3 className="font-bold text-base sm:text-lg" style={{ color: 'var(--color-text-primary)' }}>
                  Create Memory Capsule
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCapsule} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Capsule Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goa Trip 2026, Rahul's 25th Birthday, Euro Summer"
                  value={capsuleForm.title}
                  onChange={e => {
                    setFormError(null)
                    setCapsuleForm({ ...capsuleForm, title: e.target.value })
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="relative z-20">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Destination or Occasion
                </label>
                <DestinationInput
                  value={capsuleForm.destination || ''}
                  onChange={val => {
                    setFormError(null)
                    setCapsuleForm({ ...capsuleForm, destination: val })
                  }}
                  placeholder="e.g. Goa, India or College Reunion"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="space-y-1 relative z-10">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={capsuleForm.start_date || ''}
                      onChange={e => {
                        setFormError(null)
                        setCapsuleForm({ ...capsuleForm, start_date: e.target.value })
                      }}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{
                        background: 'var(--color-surface-50)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={capsuleForm.end_date || ''}
                      onChange={e => {
                        setFormError(null)
                        setCapsuleForm({ ...capsuleForm, end_date: e.target.value })
                      }}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{
                        background: 'var(--color-surface-50)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                </div>
                {capsuleForm.start_date && capsuleForm.end_date && capsuleForm.end_date < capsuleForm.start_date && (
                  <p className="text-xs text-red-500 font-medium pt-1">
                    ⚠️ End date cannot be earlier than start date.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Cover Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={capsuleForm.cover_image_url || ''}
                  onChange={e => setCapsuleForm({ ...capsuleForm, cover_image_url: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Personal Note or Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Write a few thoughts about what this trip or occasion means to you…"
                  value={capsuleForm.description || ''}
                  onChange={e => setCapsuleForm({ ...capsuleForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none resize-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || Boolean(capsuleForm.start_date && capsuleForm.end_date && capsuleForm.end_date < capsuleForm.start_date)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {loading ? 'Creating…' : 'Create Capsule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 2: EDIT CAPSULE MODAL
         ────────────────────────────────────────────────────────────────────────── */}
      {isEditModalOpen && selectedCapsule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="rounded-3xl border w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-bold text-base sm:text-lg" style={{ color: 'var(--color-text-primary)' }}>
                Edit Capsule Details
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateCapsule} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Capsule Title *
                </label>
                <input
                  type="text"
                  required
                  value={capsuleForm.title}
                  onChange={e => {
                    setFormError(null)
                    setCapsuleForm({ ...capsuleForm, title: e.target.value })
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="relative z-20">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Destination or Occasion
                </label>
                <DestinationInput
                  value={capsuleForm.destination || ''}
                  onChange={val => {
                    setFormError(null)
                    setCapsuleForm({ ...capsuleForm, destination: val })
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="space-y-1 relative z-10">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={capsuleForm.start_date || ''}
                      onChange={e => {
                        setFormError(null)
                        setCapsuleForm({ ...capsuleForm, start_date: e.target.value })
                      }}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{
                        background: 'var(--color-surface-50)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={capsuleForm.end_date || ''}
                      onChange={e => {
                        setFormError(null)
                        setCapsuleForm({ ...capsuleForm, end_date: e.target.value })
                      }}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                      style={{
                        background: 'var(--color-surface-50)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                </div>
                {capsuleForm.start_date && capsuleForm.end_date && capsuleForm.end_date < capsuleForm.start_date && (
                  <p className="text-xs text-red-500 font-medium pt-1">
                    ⚠️ End date cannot be earlier than start date.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Cover Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={capsuleForm.cover_image_url || ''}
                  onChange={e => setCapsuleForm({ ...capsuleForm, cover_image_url: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Description
                </label>
                <textarea
                  rows={3}
                  value={capsuleForm.description || ''}
                  onChange={e => setCapsuleForm({ ...capsuleForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none resize-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || Boolean(capsuleForm.start_date && capsuleForm.end_date && capsuleForm.end_date < capsuleForm.start_date)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--color-accent)' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 3: ADD MEMORY MODAL (PHOTO / VIDEO UPLOAD OR URL)
         ────────────────────────────────────────────────────────────────────────── */}
      {isAddMemoryModalOpen && selectedCapsule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="rounded-3xl border w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Camera size={18} style={{ color: 'var(--color-accent)' }} />
                <h3 className="font-bold text-base sm:text-lg" style={{ color: 'var(--color-text-primary)' }}>
                  Add a Memory
                </h3>
              </div>
              <button
                onClick={() => setIsAddMemoryModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMemory} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Upload tabs */}
              <div className="flex gap-2 p-1 rounded-xl border text-xs font-semibold" style={{ background: 'var(--color-surface-50)', borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null)
                    setUploadTab('file')
                  }}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    uploadTab === 'file' ? 'bg-white dark:bg-slate-700 shadow-sm text-teal-600 font-bold' : 'opacity-70'
                  }`}
                >
                  Upload File (Photo / Video)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null)
                    setUploadTab('url')
                  }}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    uploadTab === 'url' ? 'bg-white dark:bg-slate-700 shadow-sm text-teal-600 font-bold' : 'opacity-70'
                  }`}
                >
                  Web Image URL
                </button>
              </div>

              {/* File upload zone */}
              {uploadTab === 'file' ? (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Choose Media * (Photos up to 10MB, Videos up to 50MB)
                  </label>
                  <div
                    className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer hover:border-teal-500 transition-colors relative"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-50)' }}
                  >
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setFormError(null)
                          const isImage = file.type.startsWith('image/')
                          const isVideo = file.type.startsWith('video/')
                          if (!isImage && !isVideo) {
                            setFormError('Unsupported file format. Please upload JPG, PNG, WEBP, GIF, MP4, or WEBM.')
                            setUploadFile(null)
                            setUploadPreview(null)
                            return
                          }
                          const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
                          if (file.size > maxBytes) {
                            setFormError(`File exceeds maximum size limit (${isVideo ? '50MB for video' : '10MB for photo'}).`)
                            setUploadFile(null)
                            setUploadPreview(null)
                            return
                          }
                          setUploadFile(file)
                          if (isImage) {
                            setUploadPreview(URL.createObjectURL(file))
                            setMemoryForm(prev => ({ ...prev, media_type: 'image' }))
                          } else {
                            setUploadPreview(null)
                            setMemoryForm(prev => ({ ...prev, media_type: 'video' }))
                          }
                        }
                      }}
                    />
                    {uploadFile ? (
                      <div className="space-y-2">
                        {uploadPreview && (
                          <img
                            src={uploadPreview}
                            alt="Preview"
                            className="w-32 h-24 object-cover mx-auto rounded-lg shadow-sm"
                          />
                        )}
                        <p className="text-sm font-semibold truncate text-teal-600 dark:text-teal-400">
                          ✓ {uploadFile.name} ({(uploadFile.size / (1024 * 1024)).toFixed(1)} MB)
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Click or drag another file to replace
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pointer-events-none">
                        <Upload size={28} className="mx-auto opacity-40 text-teal-600" />
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          Drop photo or video here, or <span className="text-teal-600 underline">browse</span>
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          Supported: JPG, PNG, WEBP, GIF, MP4, WEBM
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Image URL *
                  </label>
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/photo-..."
                    value={memoryForm.media_url}
                    onChange={e => setMemoryForm({ ...memoryForm, media_url: e.target.value, media_type: 'image' })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                    style={{
                      background: 'var(--color-surface-50)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
              )}

              {/* Caption */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Caption or Memory Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sunset at Anjuna Beach"
                  value={memoryForm.title || ''}
                  onChange={e => setMemoryForm({ ...memoryForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              {/* Date & Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Date of Memory
                  </label>
                  <input
                    type="date"
                    value={memoryForm.memory_date || ''}
                    onChange={e => setMemoryForm({ ...memoryForm, memory_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                    style={{
                      background: 'var(--color-surface-50)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>

                <div className="relative z-20">
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Location
                  </label>
                  <DestinationInput
                    value={memoryForm.location || ''}
                    onChange={val => setMemoryForm({ ...memoryForm, location: val })}
                    placeholder="e.g. Anjuna Beach, Goa"
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                    style={{
                      background: 'var(--color-surface-50)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
              </div>

              {/* Reflection note */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Personal Reflection / Story
                </label>
                <textarea
                  rows={3}
                  placeholder="What made this moment special? Who were you with? What did you feel?"
                  value={memoryForm.note || ''}
                  onChange={e => setMemoryForm({ ...memoryForm, note: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none resize-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsAddMemoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || (uploadTab === 'file' && !uploadFile) || (uploadTab === 'url' && !memoryForm.media_url)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Uploading…
                    </>
                  ) : (
                    'Save Memory'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 4: EDIT MEMORY MODAL
         ────────────────────────────────────────────────────────────────────────── */}
      {editingMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="rounded-3xl border w-full max-w-md shadow-2xl overflow-hidden"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                Edit Memory Details
              </h3>
              <button
                onClick={() => setEditingMemory(null)}
                className="p-1.5 rounded-lg hover:bg-surface-100 transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateMemory} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Caption
                </label>
                <input
                  type="text"
                  value={editingMemory.title || ''}
                  onChange={e => setEditingMemory({ ...editingMemory, title: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border text-sm outline-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={editingMemory.memory_date || ''}
                    onChange={e => setEditingMemory({ ...editingMemory, memory_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                    style={{
                      background: 'var(--color-surface-50)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Location
                  </label>
                  <input
                    type="text"
                    value={editingMemory.location || ''}
                    onChange={e => setEditingMemory({ ...editingMemory, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                    style={{
                      background: 'var(--color-surface-50)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Personal Story or Note
                </label>
                <textarea
                  rows={3}
                  value={editingMemory.note || ''}
                  onChange={e => setEditingMemory({ ...editingMemory, note: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border text-sm outline-none resize-none"
                  style={{
                    background: 'var(--color-surface-50)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setEditingMemory(null)}
                  className="px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
                  style={{ background: 'var(--color-accent)' }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL 5: DELETE CONFIRMATION MODAL
         ────────────────────────────────────────────────────────────────────────── */}
      {(deletingCapsuleId || deletingMemoryId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div
            className="rounded-3xl border w-full max-w-sm p-6 shadow-2xl space-y-4"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                {deletingCapsuleId ? 'Delete Memory Capsule?' : 'Delete Memory?'}
              </h3>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {deletingCapsuleId
                  ? 'This will permanently remove this capsule, all its stored photos, videos, and journal reflections. This action cannot be undone.'
                  : 'This memory item and its media file will be permanently deleted.'}
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingCapsuleId(null)
                  setDeletingMemoryId(null)
                }}
                className="flex-1 py-2 rounded-xl border text-sm font-medium cursor-pointer"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deletingCapsuleId ? handleDeleteCapsule : handleDeleteMemory}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          LIGHTBOX / SLIDESHOW FULL-SCREEN VIEWER
         ────────────────────────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && selectedCapsule?.memories && selectedCapsule.memories[lightboxIndex] && (
        <div
          role="dialog"
          aria-label="Full-screen photo slideshow"
          className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md animate-in fade-in select-none"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between p-4 sm:p-6 text-white z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold px-2.5 py-1 rounded-full bg-white/10">
                {lightboxIndex + 1} of {selectedCapsule.memories.length}
              </span>
              <span className="text-xs sm:text-sm text-white/70 truncate max-w-xs sm:max-w-md">
                {selectedCapsule.title}
              </span>
            </div>

            <button
              onClick={() => setLightboxIndex(null)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
          </div>

          {/* Central media viewing area */}
          <div className="flex-1 relative flex items-center justify-center p-4 min-h-0">
            {/* Prev button */}
            <button
              onClick={() =>
                setLightboxIndex(
                  (lightboxIndex - 1 + selectedCapsule.memories.length) % selectedCapsule.memories.length
                )
              }
              className="absolute left-4 sm:left-8 p-3 rounded-full bg-black/50 text-white hover:bg-black/75 transition-colors z-10 cursor-pointer"
              title="Previous (Arrow Left)"
            >
              <ChevronLeft size={24} />
            </button>

            {/* Current Media */}
            <div className="max-w-5xl max-h-full flex items-center justify-center">
              {failedImageUrls.has(selectedCapsule.memories[lightboxIndex].media_url) ? (
                <div className="p-12 text-center text-white/70 space-y-2">
                  <ImageIcon size={48} className="mx-auto opacity-50" />
                  <p className="text-sm font-medium">Media preview could not be loaded</p>
                </div>
              ) : selectedCapsule.memories[lightboxIndex].media_type === 'video' ? (
                <video
                  src={selectedCapsule.memories[lightboxIndex].media_url}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-2xl shadow-2xl"
                  onError={() => markImageFailed(selectedCapsule.memories[lightboxIndex].media_url)}
                />
              ) : (
                <img
                  src={selectedCapsule.memories[lightboxIndex].media_url}
                  alt={selectedCapsule.memories[lightboxIndex].title || 'Slideshow photo'}
                  className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-2xl"
                  onError={() => markImageFailed(selectedCapsule.memories[lightboxIndex].media_url)}
                />
              )}
            </div>

            {/* Next button */}
            <button
              onClick={() =>
                setLightboxIndex((lightboxIndex + 1) % selectedCapsule.memories.length)
              }
              className="absolute right-4 sm:right-8 p-3 rounded-full bg-black/50 text-white hover:bg-black/75 transition-colors z-10 cursor-pointer"
              title="Next (Arrow Right)"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Bottom caption & reflection note */}
          <div className="p-6 text-center text-white max-w-2xl mx-auto space-y-1.5 z-10">
            {selectedCapsule.memories[lightboxIndex].title && (
              <h3 className="text-lg sm:text-xl font-bold">
                {selectedCapsule.memories[lightboxIndex].title}
              </h3>
            )}
            <div className="flex items-center justify-center gap-3 text-xs text-white/70">
              {selectedCapsule.memories[lightboxIndex].memory_date && (
                <span>{selectedCapsule.memories[lightboxIndex].memory_date}</span>
              )}
              {selectedCapsule.memories[lightboxIndex].location && (
                <span>📍 {selectedCapsule.memories[lightboxIndex].location}</span>
              )}
            </div>
            {selectedCapsule.memories[lightboxIndex].note && (
              <p className="text-xs sm:text-sm text-white/80 max-w-xl mx-auto italic pt-1">
                "{selectedCapsule.memories[lightboxIndex].note}"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
