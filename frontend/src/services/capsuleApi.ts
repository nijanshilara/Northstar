/**
 * capsuleApi.ts — API client for Memory Capsules and Travel Memories.
 * Uses axios with withCredentials: true so authentication cookies are sent.
 */
import axios from 'axios'
import type { Capsule, CapsuleCreate, Memory, MemoryCreate } from '../types/capsule'
import { API_BASE } from './api'

const api = axios.create({
  baseURL: `${API_BASE}/capsules`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000, // 30s timeout to allow photo/video uploads
})

export const capsuleApi = {
  /** List all capsules for the current user */
  list: async (search?: string): Promise<Capsule[]> => {
    const res = await api.get<Capsule[]>('/', {
      params: search ? { search } : undefined,
    })
    return res.data
  },

  /** Get a single capsule with its memories */
  get: async (id: number): Promise<Capsule> => {
    const res = await api.get<Capsule>(`/${id}`)
    return res.data
  },

  /** Create a new capsule */
  create: async (data: CapsuleCreate): Promise<Capsule> => {
    const res = await api.post<Capsule>('/', data)
    return res.data
  },

  /** Update capsule metadata */
  update: async (id: number, data: Partial<CapsuleCreate>): Promise<Capsule> => {
    const res = await api.put<Capsule>(`/${id}`, data)
    return res.data
  },

  /** Delete capsule and all its memories */
  delete: async (id: number): Promise<{ message: string; id: number }> => {
    const res = await api.delete(`/${id}`)
    return res.data
  },

  /** Upload media file to a capsule */
  uploadMedia: async (capsuleId: number, file: File): Promise<{ media_url: string; media_type: 'image' | 'video'; file_size_bytes: number }> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post(`/${capsuleId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  /** Add an individual memory to a capsule */
  addMemory: async (capsuleId: number, data: MemoryCreate): Promise<Memory> => {
    const res = await api.post<Memory>(`/${capsuleId}/memories`, data)
    return res.data
  },

  /** Update an existing memory */
  updateMemory: async (capsuleId: number, memoryId: number, data: Partial<MemoryCreate>): Promise<Memory> => {
    const res = await api.put<Memory>(`/${capsuleId}/memories/${memoryId}`, data)
    return res.data
  },

  /** Delete a single memory */
  deleteMemory: async (capsuleId: number, memoryId: number): Promise<{ message: string; id: number }> => {
    const res = await api.delete(`/${capsuleId}/memories/${memoryId}`)
    return res.data
  },

  /** Reorder memories in a capsule */
  reorderMemories: async (capsuleId: number, memoryIds: number[]): Promise<Memory[]> => {
    const res = await api.put<Memory[]>(`/${capsuleId}/reorder`, { memory_ids: memoryIds })
    return res.data
  },
}
