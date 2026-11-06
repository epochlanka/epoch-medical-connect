import { prisma } from './prisma';

/** The clinic's name as set under Settings, for anything printed for patients. */
export const clinicName = async (): Promise<string> =>
  (await prisma.clinicSettings.findUnique({ where: { id: 1 }, select: { clinic_name: true } }))?.clinic_name ?? 'MediCare Clinic & Dispensary';
