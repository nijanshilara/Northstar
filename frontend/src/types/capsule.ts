export interface Memory {
  id: number
  capsule_id: number
  title?: string | null
  note?: string | null
  memory_date?: string | null
  location?: string | null
  media_type: 'image' | 'video'
  media_url: string
  thumbnail_url?: string | null
  file_size_bytes?: number | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface Capsule {
  id: number
  user_id: number
  title: string
  description?: string | null
  destination?: string | null
  start_date?: string | null
  end_date?: string | null
  cover_image_url?: string | null
  memory_count: number
  memories?: Memory[]
  created_at: string
  updated_at: string
}

export interface CapsuleCreate {
  title: string
  description?: string
  destination?: string
  start_date?: string
  end_date?: string
  cover_image_url?: string
}

export interface MemoryCreate {
  title?: string
  note?: string
  memory_date?: string
  location?: string
  media_type?: 'image' | 'video'
  media_url: string
  thumbnail_url?: string
  file_size_bytes?: number
  display_order?: number
}
