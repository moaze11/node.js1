// Teste l'intégration Resend sans envoyer de vrai email : le SDK est mocké.
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } }))
}));

import { sendInvitationEmail, sendPasswordResetEmail } from '../src/services/email.service';

beforeEach(() => {
  mockSend.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Email service (Resend)', () => {
  it('sends the invitation email with the accept link', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    expect(await sendInvitationEmail('new@test.com', 'abc123')).toBe(true);

    const payload = mockSend.mock.calls[0][0];
    expect(payload.to).toBe('new@test.com');
    expect(payload.html).toContain('/auth/accept-invitation?token=abc123');
  });

  it('sends the password reset email with the reset link', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email_2' }, error: null });

    expect(await sendPasswordResetEmail('user@test.com', 'xyz789')).toBe(true);
    expect(mockSend.mock.calls[0][0].html).toContain('/auth/reset-password?token=xyz789');
  });

  it('reports failure when Resend returns an error (it does not throw)', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });
    expect(await sendInvitationEmail('new@test.com', 'abc')).toBe(false);
  });

  it('reports failure on network error', async () => {
    mockSend.mockRejectedValue(new Error('network down'));
    expect(await sendPasswordResetEmail('user@test.com', 'abc')).toBe(false);
  });
});
