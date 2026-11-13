import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

// Clinical summaries are for the people treating the patient.
const CLINICAL_ROLES = ['Admin', 'Doctor'];

const summarySchema = z.object({
  params: z.object({ patientId: z.string().min(1) }),
  body: z.object({ refresh: z.boolean().optional() }).optional(),
});

router.get('/status', controller.status);
router.post('/patients/:patientId/summary', requireRole(CLINICAL_ROLES), validate(summarySchema), controller.patientSummary);

export default router;
