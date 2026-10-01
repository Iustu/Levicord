import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInput } from './ChatInput';

// ── Helpers ───────────────────────────────────────────────────────────────────
const TOKEN = 'test-token';

function renderChatInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const onSend = vi.fn();
  const utils = render(
    <ChatInput
      placeholder="Mensagem..."
      token={TOKEN}
      onSend={onSend}
      {...overrides}
    />,
  );
  const input = screen.getByRole('textbox', { name: /campo de mensagem/i });
  const sendBtn = screen.getByRole('button', { name: /enviar mensagem/i });
  return { ...utils, input, sendBtn, onSend };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────
  it('renders the text input with the given placeholder', () => {
    renderChatInput({ placeholder: 'Falar em #geral' });
    expect(screen.getByPlaceholderText('Falar em #geral')).toBeInTheDocument();
  });

  it('renders the send button initially disabled (empty input)', () => {
    const { sendBtn } = renderChatInput();
    expect(sendBtn).toBeDisabled();
  });

  it('renders the attach button', () => {
    renderChatInput();
    expect(screen.getByRole('button', { name: /anexar arquivo/i })).toBeInTheDocument();
  });

  // ── Submit — text message ─────────────────────────────────────────────────
  it('enables send button when text is typed', () => {
    const { input, sendBtn } = renderChatInput();
    fireEvent.change(input, { target: { value: 'Olá!' } });
    expect(sendBtn).toBeEnabled();
  });

  it('calls onSend with trimmed text and null attachment on submit', () => {
    const { input, sendBtn, onSend } = renderChatInput();
    fireEvent.change(input, { target: { value: '  Olá!  ' } });
    fireEvent.click(sendBtn);
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('Olá!', null);
  });

  it('clears the input after sending', () => {
    const { input, sendBtn } = renderChatInput();
    fireEvent.change(input, { target: { value: 'Mensagem' } });
    fireEvent.click(sendBtn);
    expect(input).toHaveValue('');
  });

  it('submits when form submit event is triggered', () => {
    const { input, onSend } = renderChatInput();
    fireEvent.change(input, { target: { value: 'Enter test' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('Enter test', null);
  });

  it('does NOT call onSend when input is only whitespace', () => {
    const { input, onSend } = renderChatInput();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });

  // ── Typing events ─────────────────────────────────────────────────────────
  it('calls onTypingStart when the user types', () => {
    const onTypingStart = vi.fn();
    const { input } = renderChatInput({ onTypingStart });
    fireEvent.change(input, { target: { value: 'a' } });
    expect(onTypingStart).toHaveBeenCalledOnce();
  });

  it('calls onTypingStart only once for continuous keystrokes', () => {
    const onTypingStart = vi.fn();
    const { input } = renderChatInput({ onTypingStart });
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onTypingStart).toHaveBeenCalledOnce();
  });

  it('calls onTypingStop on submit', () => {
    const onTypingStop = vi.fn();
    const { input, sendBtn } = renderChatInput({ onTypingStop });
    fireEvent.change(input, { target: { value: 'stop test' } });
    fireEvent.click(sendBtn);
    expect(onTypingStop).toHaveBeenCalled();
  });

  // ── File upload / Attachment preview ──────────────────────────────────────
  it('shows the uploading state when a file is selected', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves to keep in uploading state

    try {
      const { container } = renderChatInput();
      const fileInput = container.querySelector('#file-upload-input') as HTMLInputElement;
      const file = new File(['hello'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const attachBtn = screen.getByRole('button', { name: /anexar arquivo/i });
        expect(attachBtn).toBeDisabled();
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('shows error and allows dismissing when upload fails', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    try {
      const { container } = renderChatInput();
      const fileInput = container.querySelector('#file-upload-input') as HTMLInputElement;
      const file = new File(['x'], 'img.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/erro de rede/i);

      const closeBtn = alert.querySelector('button')!;
      fireEvent.click(closeBtn);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // ── Accessibility ─────────────────────────────────────────────────────────
  it('has aria-label on the text input', () => {
    const { input } = renderChatInput();
    expect(input).toHaveAttribute('aria-label', 'Campo de mensagem');
  });

  it('has aria-label on the send button', () => {
    renderChatInput();
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeInTheDocument();
  });

  it('has aria-label on the attach button', () => {
    renderChatInput();
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeInTheDocument();
  });

  it('enforces maxLength of 2000 on the input', () => {
    const { input } = renderChatInput();
    expect(input).toHaveAttribute('maxLength', '2000');
  });
});
