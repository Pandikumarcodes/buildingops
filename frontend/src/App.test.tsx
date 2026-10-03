// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./realtime/TelemetryProvider', () => ({
  TelemetryProvider: ({ children }: { children: ReactNode }) => children,
}))

describe('application routes', () => {
  it('renders the enabled AI Assistant at /ai without a coming-soon state', async () => {
    render(
      <MemoryRouter initialEntries={['/ai']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'AI Building Assistant' })).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'AI Assistant' })).toHaveAttribute('href', '/ai')
  })
})
