import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'test-key');
const FROM = 'onboarding@resend.dev';
const APP_URL = process.env.APP_URL || 'http://localhost:3002';

/**
 * Envoie un email via Resend. Resend v6 ne lève pas d'exception en cas d'échec :
 * il renvoie { error }. On le vérifie, sinon un échec passerait pour un succès.
 */
async function send(to: string, subject: string, html: string, label: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`Failed to send ${label}:`, error);
      return false;
    }
    console.log(`✅ ${label} sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`Failed to send ${label}:`, error);
    return false;
  }
}

export function sendInvitationEmail(email: string, token: string): Promise<boolean> {
  const link = `${APP_URL}/auth/accept-invitation?token=${encodeURIComponent(token)}`;
  return send(email, 'You are invited!', `<p>Click <a href="${link}">here</a> to accept the invitation</p>`, 'Invitation');
}

export function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const link = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
  return send(email, 'Reset your password', `<p>Click <a href="${link}">here</a> to reset your password</p>`, 'Password reset');
}

export function sendWelcomeEmail(email: string): Promise<boolean> {
  return send(email, 'Welcome to Auth API!', '<p>Welcome! Your account is ready.</p>', 'Welcome email');
}
