import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';
import { medicineKey } from './currentMedications';

// "Stop" on the ongoing-medicines panel: the doctor records that the patient no longer takes a
// medicine, so it leaves the list (getOngoingMedications skips courses issued before the stop).
// Prescribing it again later brings it back. Undo is for a mis-click and is limited to the person
// who stopped it (or an admin).

interface Actor {
  user_id: number;
  role: string;
}

export const stopMedication = async (
  input: { patient_id: string; medicine_name: string; reason?: string; consultation_id?: number },
  actor: Actor,
) => {
  const patient = await prisma.patient.findUnique({ where: { patient_id: input.patient_id }, select: { patient_id: true } });
  if (!patient) throw new NotFoundError('Patient not found');
  const name = input.medicine_name.trim();
  if (!name) throw new ValidationError('Name the medicine to stop');

  return prisma.$transaction(async (tx) => {
    const stop = await tx.medicationStop.create({
      data: {
        patient_id: input.patient_id,
        medicine_key: medicineKey(name),
        medicine_name: name,
        reason: input.reason?.trim() || null,
        consultation_id: input.consultation_id ?? null,
        stopped_by: actor.user_id,
      },
    });
    await tx.auditLog.create({ data: { user_id: actor.user_id, action: 'STOP_MEDICATION', entity: 'Patient', entity_id: input.patient_id } });
    return { stopId: stop.stop_id, medicineName: stop.medicine_name, stoppedAt: stop.stopped_at };
  });
};

export const undoStopMedication = async (stopId: number, actor: Actor) => {
  const stop = await prisma.medicationStop.findUnique({ where: { stop_id: stopId } });
  if (!stop) throw new NotFoundError('That stop was not found');
  if (actor.role !== 'Admin' && stop.stopped_by !== actor.user_id) {
    throw new ForbiddenError('Only the doctor who stopped this medicine can undo it');
  }
  await prisma.$transaction(async (tx) => {
    await tx.medicationStop.delete({ where: { stop_id: stopId } });
    await tx.auditLog.create({ data: { user_id: actor.user_id, action: 'UNDO_STOP_MEDICATION', entity: 'Patient', entity_id: stop.patient_id } });
  });
};
