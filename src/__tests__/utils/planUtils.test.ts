import { describe, it, expect } from 'vitest'
import { normalizePlan, getPlanDisplayName } from '@/utils/planUtils'

describe('planUtils', () => {
  describe('normalizePlan', () => {
    it('should normalize plan names correctly', () => {
      expect(normalizePlan('FREE')).toBe('free')
      expect(normalizePlan('Pro')).toBe('pro')
      expect(normalizePlan('ELITE')).toBe('elite')
      expect(normalizePlan('premium')).toBe('pro')
      expect(normalizePlan(null)).toBe('free')
      expect(normalizePlan(undefined)).toBe('free')
      expect(normalizePlan('')).toBe('free')
    })

    it('should handle edge cases', () => {
      expect(normalizePlan('invalid')).toBe('free')
      expect(normalizePlan('FREE ')).toBe('free')
      expect(normalizePlan(' Pro ')).toBe('pro')
    })
  })

  describe('getPlanDisplayName', () => {
    it('should return correct display names', () => {
      expect(getPlanDisplayName('free')).toBe('Free Plan')
      expect(getPlanDisplayName('pro')).toBe('Pro Plan')
      expect(getPlanDisplayName('elite')).toBe('Elite Plan')
    })

    it('should handle null and undefined', () => {
      expect(getPlanDisplayName(null)).toBe('Free Plan')
      expect(getPlanDisplayName(undefined)).toBe('Free Plan')
    })

    it('should handle invalid plans', () => {
      expect(getPlanDisplayName('invalid')).toBe('Free Plan')
      expect(getPlanDisplayName('')).toBe('Free Plan')
    })
  })
})
