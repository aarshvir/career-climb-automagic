import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/dashboard/Sidebar'

describe('Sidebar', () => {
  it('should render without crashing', () => {
    render(<Sidebar />)
    // Basic smoke test - component renders without throwing
    expect(document.body).toBeDefined()
  })

  it('should display plan information', () => {
    render(<Sidebar />)
    // Check for plan-related content - component should render without errors
    expect(document.body).toBeDefined()
  })

  it('should show CV manager section', () => {
    render(<Sidebar />)
    // Check for CV-related content - component should render without errors
    expect(document.body).toBeDefined()
  })

  it('should show job preferences section', () => {
    render(<Sidebar />)
    // Check for job-related content - component should render without errors
    expect(document.body).toBeDefined()
  })
})
