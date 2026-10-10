import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlanLimits } from '@/hooks/usePlanLimits'

describe('usePlanLimits', () => {
  it('should return correct limits for free plan', () => {
    const { result } = renderHook(() => usePlanLimits('free'))
    
    expect(result.current.resumeVariants).toBe(1)
    expect(result.current.dailyJobApplications).toBe(2)
  })

  it('should return correct limits for pro plan', () => {
    const { result } = renderHook(() => usePlanLimits('pro'))
    
    expect(result.current.resumeVariants).toBe(3)
    expect(result.current.dailyJobApplications).toBe(20)
  })

  it('should return correct limits for elite plan', () => {
    const { result } = renderHook(() => usePlanLimits('elite'))
    
    expect(result.current.resumeVariants).toBe(5)
    expect(result.current.dailyJobApplications).toBe(100)
  })

  it('should default to free plan for invalid input', () => {
    const { result } = renderHook(() => usePlanLimits('invalid'))
    
    expect(result.current.resumeVariants).toBe(1)
    expect(result.current.dailyJobApplications).toBe(2)
  })

  it('should default to free plan for null/undefined', () => {
    const { result: resultNull } = renderHook(() => usePlanLimits(null))
    const { result: resultUndefined } = renderHook(() => usePlanLimits(undefined))
    
    expect(resultNull.current.resumeVariants).toBe(1)
    expect(resultNull.current.dailyJobApplications).toBe(2)
    expect(resultUndefined.current.resumeVariants).toBe(1)
    expect(resultUndefined.current.dailyJobApplications).toBe(2)
  })
})
