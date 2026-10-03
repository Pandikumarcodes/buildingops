// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppLayout } from './AppLayout'

describe('AppLayout navigation', () => {
  it('links to Alerts and the AI Assistant', () => {
    render(<MemoryRouter><Routes><Route element={<AppLayout />}><Route index element={<p>Overview</p>} /></Route></Routes></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Energy' })).toHaveAttribute('href', '/energy')
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('href', '/alerts')
    expect(screen.getByRole('link', { name: 'AI Assistant' })).toHaveAttribute('href', '/ai')
  })
})
