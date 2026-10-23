import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCapsuleDates,
  validateMediaFile,
  formatMediaSize,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from '../utils/capsuleUtils.ts'

describe('Phase 6D — Memory Capsules Frontend Validation & Utilities', () => {
  describe('validateCapsuleDates', () => {
    it('1. Accepts valid date ranges where end_date is after start_date', () => {
      const result = validateCapsuleDates('2026-06-01', '2026-06-10')
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.error, undefined)
    })

    it('2. Accepts single-day trips where end_date equals start_date', () => {
      const result = validateCapsuleDates('2026-06-01', '2026-06-01')
      assert.strictEqual(result.valid, true)
    })

    it('3. Rejects inverted date ranges where end_date is before start_date', () => {
      const result = validateCapsuleDates('2026-06-10', '2026-06-01')
      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.error, 'End date cannot be earlier than start date.')
    })

    it('4. Handles optional dates gracefully when start_date or end_date is missing', () => {
      const onlyStart = validateCapsuleDates('2026-06-01', null)
      assert.strictEqual(onlyStart.valid, true)

      const onlyEnd = validateCapsuleDates(null, '2026-06-10')
      assert.strictEqual(onlyEnd.valid, true)

      const neither = validateCapsuleDates(undefined, undefined)
      assert.strictEqual(neither.valid, true)
    })
  })

  describe('validateMediaFile', () => {
    it('5. Validates supported image formats (JPEG, PNG, WEBP, GIF)', () => {
      const sampleJpeg = { name: 'photo.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' }
      const resJpeg = validateMediaFile(sampleJpeg)
      assert.strictEqual(resJpeg.valid, true)
      assert.strictEqual(resJpeg.mediaType, 'image')

      const samplePng = { name: 'photo.png', size: 500 * 1024, type: 'image/png' }
      const resPng = validateMediaFile(samplePng)
      assert.strictEqual(resPng.valid, true)
      assert.strictEqual(resPng.mediaType, 'image')
    })

    it('6. Validates supported video formats (MP4, WEBM)', () => {
      const sampleMp4 = { name: 'clip.mp4', size: 25 * 1024 * 1024, type: 'video/mp4' }
      const res = validateMediaFile(sampleMp4)
      assert.strictEqual(res.valid, true)
      assert.strictEqual(res.mediaType, 'video')
    })

    it('7. Rejects unsupported file formats (e.g. PDF, EXE, ZIP)', () => {
      const exeFile = { name: 'virus.exe', size: 1024, type: 'application/x-msdownload' }
      const res = validateMediaFile(exeFile)
      assert.strictEqual(res.valid, false)
      assert.match(res.error || '', /Unsupported file format/)

      const pdfFile = { name: 'doc.pdf', size: 1024, type: 'application/pdf' }
      const resPdf = validateMediaFile(pdfFile)
      assert.strictEqual(resPdf.valid, false)
    })

    it('8. Enforces 10MB limit for images', () => {
      const oversizedImage = {
        name: 'huge.jpg',
        size: MAX_IMAGE_SIZE_BYTES + 1024,
        type: 'image/jpeg',
      }
      const res = validateMediaFile(oversizedImage)
      assert.strictEqual(res.valid, false)
      assert.match(res.error || '', /10MB for photo/)
    })

    it('9. Enforces 50MB limit for videos', () => {
      const oversizedVideo = {
        name: 'long_movie.mp4',
        size: MAX_VIDEO_SIZE_BYTES + 1024,
        type: 'video/mp4',
      }
      const res = validateMediaFile(oversizedVideo)
      assert.strictEqual(res.valid, false)
      assert.match(res.error || '', /50MB for video/)
    })

    it('10. Rejects zero-byte empty files', () => {
      const emptyFile = { name: 'empty.jpg', size: 0, type: 'image/jpeg' }
      const res = validateMediaFile(emptyFile)
      assert.strictEqual(res.valid, false)
      assert.strictEqual(res.error, 'Selected file is empty.')
    })
  })

  describe('formatMediaSize', () => {
    it('11. Accurately formats bytes, kilobytes, and megabytes', () => {
      assert.strictEqual(formatMediaSize(500), '500 B')
      assert.strictEqual(formatMediaSize(2048), '2.0 KB')
      assert.strictEqual(formatMediaSize(10 * 1024 * 1024), '10.0 MB')
    })
  })
})
