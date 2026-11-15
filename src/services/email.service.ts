import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'test-key');

export async function sendInvitationEmail(email: string, token: string): Promise<boolean> {
  try {
    const invitationLink = `http://localhost:3002/auth/accept-invitation?token=${token}`;

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'You are invited!',
      html: `<p>Click <a href="${invitationLink}">here</a> to accept the invitation</p>`
    });

    console.log(`✅ Invitation sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send invitation:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  try {
    const resetLink = `http://localhost:3002/auth/reset-password?token=${token}`;

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Reset your password',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password</p>`
    });

    console.log(`✅ Password reset sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send reset email:', error);
    return false;
  }
}

export async function sendWelcomeEmail(email: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Welcome to Auth API!',
      html: `<p>Welcome ${email}! Your account is ready.</p>`
    });

    console.log(`✅ Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return false;
  }
}
