import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test Explosion');
  }
  return <div>Everything is fine</div>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Suppress React boundary console.error logs during expected errors
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });

  it('catches render errors and displays fallback UI', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Algo correu mal')).toBeInTheDocument();
    expect(screen.getByText('Test Explosion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByText('Recarregar página')).toBeInTheDocument();
  });

  it('renders custom fallback if provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error View</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error View')).toBeInTheDocument();
    expect(screen.queryByText('Algo correu mal')).not.toBeInTheDocument();
  });

  it('resets error state when "Tentar novamente" is clicked', () => {
    let shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Algo correu mal')).toBeInTheDocument();

    // Fix the condition before recovery attempt
    shouldThrow = false;
    rerender(
      <ErrorBoundary>
        <ProblemChild shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });
});
