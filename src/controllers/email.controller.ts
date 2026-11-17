import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateToken, TOKEN_EXPIRY, getExpiryDate, hashPassword, hashToken } from '../utils';
import { sendInvitationEmail, sendPasswordResetEmail } from '../services/email.service';
import { revokeAllSessions } from '../services/session.service';
import { logPasswordReset } from '../services/audit.service';

const prisma = new PrismaClient();

// INVITER UN USER (Super Admin seulement)
export const inviteUser = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const superAdminId = (req as any).userId; // Récupéré du middleware auth (future)

    // Validation
    if (!email || email.trim().length === 0) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Vérifier si une invitation existe déjà
    const existingInvitation = await prisma.invitation.findUnique({ where: { email } });
    if (existingInvitation && !existingInvitation.acceptedAt) {
      return res.status(400).json({ error: 'Invitation already sent' });
    }

    // Créer l'invitation
    const token = generateToken();
    const invitation = await prisma.invitation.create({
      data: {
        email,
        token: hashToken(token), // VULN-004 : seule l'empreinte est stockée
        expiresAt: getExpiryDate(TOKEN_EXPIRY.INVITATION)
      }
    });

    // Envoyer l'email
    await sendInvitationEmail(email, token);

    // Le token n'est PAS renvoyé : seul l'invité (via l'email) doit pouvoir accepter.
    // Sinon un Admin pourrait créer le compte à la place de l'invité, avec son propre mot de passe.
    res.status(201).json({
      message: 'Invitation sent',
      email,
      expiresAt: invitation.expiresAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

// ACCEPTER L'INVITATION (créer user avec password)
export const acceptInvitation = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    // Validation
    if (!token) {
      return res.status(400).json({ error: 'Invitation token required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Vérifier l'invitation
    const invitation = await prisma.invitation.findUnique({ where: { token: hashToken(token) } });
    if (!invitation) {
      return res.status(400).json({ error: 'Invalid invitation token' });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invitation expired' });
    }

    if (invitation.acceptedAt) {
      return res.status(400).json({ error: 'Invitation already accepted' });
    }

    // Récupérer le rôle User (par défaut)
    const userRole = await prisma.role.findUnique({ where: { name: 'User' } });
    if (!userRole) {
      return res.status(500).json({ error: 'User role not found' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Créer l'user
    const user = await prisma.user.create({
      data: {
        email: invitation.email,
        password: hashedPassword,
        roleId: userRole.id,
        emailVerified: true
      },
      include: { role: true }
    });

    // Marquer l'invitation comme acceptée
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), userId: user.id }
    });

    res.json({
      message: 'Invitation accepted',
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
};

// FORGOT PASSWORD
/**
 * Crée le lien de reset et envoie l'email, si le compte existe et est actif.
 * Appelée APRÈS l'envoi de la réponse (VULN-006).
 */
export async function issuePasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  // VULN-008 : un seul lien valide à la fois. Les anciens sont neutralisés.
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }
  });

  const token = generateToken();
  await prisma.passwordReset.create({
    data: {
      token: hashToken(token), // VULN-004 : seule l'empreinte est stockée
      userId: user.id,
      expiresAt: getExpiryDate(TOKEN_EXPIRY.PASSWORD_RESET)
    }
  });

  await sendPasswordResetEmail(email, token);
}

// FORGOT PASSWORD
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || email.trim().length === 0) {
    return res.status(400).json({ error: 'Email required' });
  }

  // VULN-006 : réponse immédiate et identique, AVANT toute recherche en base ou envoi d'email.
  // Avant, le travail fait seulement pour un compte existant (écritures, appel à Resend)
  // rallongeait la réponse et révélait les emails inscrits.
  res.json({ message: 'If this email exists, a password reset link has been sent' });

  try {
    await issuePasswordReset(email);
  } catch (error) {
    console.error('[forgot-password] échec du traitement :', error);
  }
};

// RESET PASSWORD
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    // Validation
    if (!token) {
      return res.status(400).json({ error: 'Reset token required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Vérifier le token
    const resetRecord = await prisma.passwordReset.findUnique({ where: { token: hashToken(token) } });
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    if (resetRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset token expired' });
    }

    if (resetRecord.usedAt) {
      return res.status(400).json({ error: 'Reset token already used' });
    }

    // Usage unique atomique : on "consomme" le token seulement s'il n'est pas déjà utilisé.
    // Deux requêtes simultanées avec le même token → une seule passe.
    const consumed = await prisma.passwordReset.updateMany({
      where: { id: resetRecord.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (consumed.count === 0) {
      return res.status(400).json({ error: 'Reset token already used' });
    }

    const hashedPassword = await hashPassword(password);
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: { password: hashedPassword }
    });

    // Nouveau mot de passe : on coupe les sessions existantes (et leurs access tokens, VULN-002)
    await revokeAllSessions(resetRecord.userId);
    await logPasswordReset(resetRecord.userId, req.ip); // VULN-005

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
};
