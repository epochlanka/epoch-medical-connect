import { Request, Response } from 'express';
import { respondWithServerError } from '../../errors';
import { AI_MODEL, AiDisabledError, AiRefusedError, AiUnavailableError, PatientNotFoundError, isAiEnabled, summarisePatient } from './service';

const actor = (req: Request) => req.user as any as { user_id: number };

export const status = (_req: Request, res: Response) => {
  res.status(200).json({ enabled: isAiEnabled(), model: AI_MODEL });
};

export const patientSummary = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await summarisePatient(String(req.params.patientId), actor(req), { refresh: req.body?.refresh === true }));
  } catch (error) {
    if (error instanceof AiDisabledError) return res.status(403).json({ message: error.message, code: 'AI_DISABLED' });
    if (error instanceof PatientNotFoundError) return res.status(404).json({ message: error.message });
    if (error instanceof AiRefusedError) return res.status(422).json({ message: error.message, code: 'AI_REFUSED' });
    if (error instanceof AiUnavailableError) return res.status(503).json({ message: error.message, code: 'AI_UNAVAILABLE' });
    return respondWithServerError(req, res, error, 'ai');
  }
};
