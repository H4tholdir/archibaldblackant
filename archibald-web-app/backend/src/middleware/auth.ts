import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../auth-utils';
import { logger } from '../logger';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

export async function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token non fornito' });
  }

  const token = authHeader.split(' ')[1];
  const payload = await verifyJWT(token);

  if (!payload) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }

  req.user = payload;
  next();
}
