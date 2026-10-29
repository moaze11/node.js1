import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'test-key');

export async function sendInvitationEmail(email: string, token: string): Promise<boolean> {
  try {
    const invitationLink = `http://localhost:3002/auth/accept-invitation?token=${token}`;

    // En dev, on log juste
    console.log(`📧 Invitation email to ${email}:`);
    console.log(`   Link: ${invitationLink}`);

    // En prod, utiliser Resend :
    // await resend.emails.send({
    //   from: 'noreply@example.com',
    //   to: email,
    //   subject: 'You are invited!',
    //   html: `<p>Click <a href="${invitationLink}">here</a> to accept the invitation</p>`
    // });

    return true;
  } catch (error) {
    console.error('Failed to send invitation:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  try {
    const resetLink = `http://localhost:3002/auth/reset-password?token=${token}`;

    console.log(`📧 Password reset email to ${email}:`);
    console.log(`   Link: ${resetLink}`);

    return true;
  } catch (error) {
    console.error('Failed to send reset email:', error);
    return false;
  }
}

export async function sendWelcomeEmail(email: string): Promise<boolean> {
  try {
    console.log(`📧 Welcome email to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return false;
  }
}
