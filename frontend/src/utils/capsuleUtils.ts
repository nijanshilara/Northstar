/**
 * Capsule & Media Validation Utilities
 * Phase 6D — Memory Capsules Stabilisation
 */

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

export const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
])

export interface MediaValidationResult {
  valid: boolean
  error?: string
  mediaType?: 'image' | 'video'
}

export interface DateValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates start and end dates for a travel capsule.
 */
export function validateCapsuleDates(
  startDate?: string | null,
  endDate?: string | null
): DateValidationResult {
  if (!startDate || !endDate) {
    return { valid: true }
  }

  // Parse YYYY-MM-DD
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()

  if (isNaN(start) || isNaN(end)) {
    return { valid: false, error: 'Invalid date format provided.' }
  }

  if (end < start) {
    return {
      valid: false,
      error: 'End date cannot be earlier than start date.',
    }
  }

  return { valid: true }
}

/**
 * Validates media file type and file size.
 */
export function validateMediaFile(file: {
  name: string
  size: number
  type: string
}): MediaValidationResult {
  if (!file) {
    return { valid: false, error: 'No file selected.' }
  }

  const isImage = ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()) || file.type.startsWith('image/')
  const isVideo = ALLOWED_VIDEO_TYPES.has(file.type.toLowerCase()) || file.type.startsWith('video/')

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload JPG, PNG, WEBP, GIF, MP4, or WEBM.',
    }
  }

  const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image'
  const maxBytes = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES

  if (file.size > maxBytes) {
    const limitLabel = isVideo ? '50MB for video' : '10MB for photo'
    return {
      valid: false,
      error: `File exceeds maximum size limit (${limitLabel}).`,
      mediaType,
    }
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'Selected file is empty.',
      mediaType,
    }
  }

  return { valid: true, mediaType }
}

/**
 * Format bytes to readable string (e.g. 2.4 MB)
 */
export function formatMediaSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
