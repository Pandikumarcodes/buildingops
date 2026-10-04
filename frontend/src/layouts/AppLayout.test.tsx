// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppLayout } from './AppLayout'

describe('AppLayout navigation', () => {
  it('links to Alerts and the AI Assistant', () => {
    render(<MemoryRouter><Routes><Route element={<AppLayout />}><Route index element={<p>Overview</p>} /></Route></Routes></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/energy')
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('href', '/alerts')
    expect(screen.getByRole('link', { name: 'AI Assistant' })).toHaveAttribute('href', '/ai')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Buildings' })).toHaveAttribute('href', '/buildings')
    for (const label of ['Predictive Maintenance', 'Reports', 'Users & Access', 'Settings']) {
      expect(screen.getByText(label)).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
    }
  })
})
