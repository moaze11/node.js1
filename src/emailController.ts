import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateToken, TOKEN_EXPIRY, getExpiryDate } from './tokenUtils';
import { sendInvitationEmail, sendPasswordResetEmail } from './emailService';
import { hashPassword, comparePassword } from './utils';

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
        token,
        expiresAt: getExpiryDate(TOKEN_EXPIRY.INVITATION)
      }
    });

    // Envoyer l'email
    await sendInvitationEmail(email, token);

    res.status(201).json({
      message: 'Invitation sent',
      invitationToken: token,
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
    const invitation = await prisma.invitation.findUnique({ where: { token } });
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
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email || email.trim().length === 0) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Vérifier que l'user existe
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return res.json({ message: 'If email exists, password reset link has been sent' });
    }

    // Créer un token de reset
    const token = generateToken();
    await prisma.passwordReset.create({
      data: {
        token,
        userId: user.id,
        expiresAt: getExpiryDate(TOKEN_EXPIRY.PASSWORD_RESET)
      }
    });

    // Envoyer l'email
    await sendPasswordResetEmail(email, token);

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reset email' });
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
    const resetRecord = await prisma.passwordReset.findUnique({ where: { token } });
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    if (resetRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset token expired' });
    }

    if (resetRecord.usedAt) {
      return res.status(400).json({ error: 'Reset token already used' });
    }

    // Hash le nouveau password
    const hashedPassword = await hashPassword(password);

    // Mettre à jour le password
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: { password: hashedPassword }
    });

    // Marquer le token comme utilisé
    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
};
