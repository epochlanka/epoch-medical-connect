import { useMemo, useState } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getDoctorDashboard, getFollowUps } from '../../lib/dashboard';
import {
  displayAgeLabel, displayPatientGender, displayPatientId, displayPatientName,
  getLiveQueue, tokenNumber, updateAppointmentStatus, waitingMinutes,
} from '../../lib/queue';
import type { QueueAppointment } from '../../lib/queue';
import {
  CalendarIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon,
  PhoneIcon, RefreshIcon, StethoscopeIcon,
} from '../../components/layout/Icons';
import './dashboard.css';
import './doctor-dashboard.css';
import '../../styles/shared.css';
import { PatientLink } from '../../../../shared/patients/PatientPanel';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
// "2 h 41 min" reads faster than "161 min" once waits pass an hour.
const formatWait = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);
// Red only for genuinely long waits, so it still stands out when it appears.
const waitTone = (minutes: number) => (minutes >= 60 ? ' late' : minutes >= 30 ? ' slow' : '');
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

const PatientIdentity = ({ appointment }: { appointment: QueueAppointment }) => {
  const name = displayPatientName(appointment);
  return (
    <div className="rapid-patient">
      <div className="rapid-avatar">{initials(name)}</div>
      <div className="rapid-patient-copy">
        <div className="rapid-patient-name">
          <PatientLink patientId={appointment.patient_id}>{name}</PatientLink>
          {appointment.is_temporary && <span className="badge badge-amber">Temporary</span>}
        </div>
        <div className="rapid-patient-meta">
          {displayPatientId(appointment)} · {displayAgeLabel(appointment) ?? 'Age not recorded'}
          {displayPatientGender(appointment) ? ` · ${displayPatientGender(appointment)}` : ''}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashboard = useApiData(getDoctorDashboard);
  const queue = useApiData(getLiveQueue);
  const followUps = useApiData(getFollowUps);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const active = useMemo(() => (queue.data ?? []).find((item) => item.status === 'Consulting') ?? null, [queue.data]);
  const called = useMemo(() => (queue.data ?? []).find((item) => item.status === 'Called') ?? null, [queue.data]);
  const waiting = useMemo(
    () => (queue.data ?? []).filter((item) => item.status === 'Waiting')
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [queue.data]
  );
  const primaryPatient = active ?? called ?? waiting[0] ?? null;
  // A patient can have a second visit queued while still with the doctor; label it rather than
  // leave the doctor wondering why the same name appears twice.
  const inRoomPatientIds = new Set([active, called].filter(Boolean).map((a) => displayPatientId(a as QueueAppointment)));
  const callBlocked = !!active || !!called;
  const overdueFollowUps = followUps.data?.filter((item) => item.isOverdue).length ?? 0;

  const refresh = () => { dashboard.reload(); queue.reload(); followUps.reload(); };
  const changeStatus = async (appointment: QueueAppointment, status: 'Called' | 'Consulting') => {
    setBusyId(appointment.appointment_id);
    setActionError(null);
    try {
      await updateAppointmentStatus(appointment.appointment_id, status);
      if (status === 'Consulting') navigate(`/consultations/workspace/${appointment.appointment_id}`);
      else queue.reload();
    } catch (error: any) {
      setActionError(error?.response?.data?.message || 'The queue could not be updated. Please refresh and try again.');
    } finally { setBusyId(null); }
  };
  const primaryAction = () => {
    if (!primaryPatient) return;
    if (primaryPatient.status === 'Consulting') navigate(`/consultations/workspace/${primaryPatient.appointment_id}`);
    else if (primaryPatient.status === 'Called') changeStatus(primaryPatient, 'Consulting');
    else changeStatus(primaryPatient, 'Called');
  };

  const actionLabel = active ? 'Continue consultation' : called ? 'Start consultation' : 'Call next patient';
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="rapid-dashboard">
      <div className="rapid-header">
        <div>
          <h1>Good {now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, {user?.role === 'Doctor' ? 'Dr. ' : ''}{user?.username}</h1>
          <span className="rapid-eyebrow">{dateLabel}</span>
        </div>
        <button className="rapid-refresh" onClick={refresh} aria-label="Refresh clinical day"><RefreshIcon /> Refresh</button>
      </div>

      {(dashboard.error || queue.error || actionError) && <div className="dash-error-banner">{actionError || dashboard.error || queue.error}</div>}

      <section className={`rapid-focus-card${active ? ' is-live' : ''}`} aria-label="Current clinical action">
        <div className="rapid-focus-main">
          <div className="rapid-focus-status"><span className={`rapid-live-dot${active ? ' pulse' : ''}`} />
            {active ? 'Consultation in progress' : called ? 'Patient called' : primaryPatient ? 'Next patient' : 'Queue clear'}
          </div>
          {primaryPatient ? <>
            <div className="rapid-focus-identity"><span className="rapid-token">{tokenNumber(primaryPatient.appointment_id)}</span><PatientIdentity appointment={primaryPatient} /></div>
            <div className="rapid-focus-facts">
              <span><ClockIcon /> {formatWait(waitingMinutes(primaryPatient.scheduled_at))} {active ? 'since arrival' : 'waiting'}</span>
              <span><CalendarIcon /> {formatTime(primaryPatient.scheduled_at)}</span>
              {primaryPatient.reason && <span className="rapid-reason">Reason: {primaryPatient.reason}</span>}
            </div>
          </> : <div className="rapid-empty-focus"><CheckCircleIcon /> No patients are waiting. You are caught up.</div>}
        </div>
        <div className="rapid-focus-action">
          <button className="rapid-primary-action" onClick={primaryAction} disabled={!primaryPatient || busyId !== null}>
            {active ? <StethoscopeIcon /> : <PhoneIcon />}{busyId ? 'Updating…' : actionLabel}<ChevronRightIcon />
          </button>
          {primaryPatient && !active && <button className="rapid-secondary-action" onClick={() => navigate('/queue/live')}>Open full queue</button>}
          {active && <span className="rapid-helper">Return without losing the current draft</span>}
        </div>
      </section>

      {/* The single summary of the day; it used to be repeated in a separate "Needs attention" panel. */}
      <div className="rapid-stat-strip" aria-label="Today's clinical summary">
        <button onClick={() => navigate('/queue/live')}><span className="rapid-stat-value">{waiting.length}</span><span className="rapid-stat-label">Waiting now</span></button>
        <button onClick={() => navigate('/consultations/my')}><span className="rapid-stat-value">{dashboard.data?.kpis.completedConsultationsToday ?? 0}</span><span className="rapid-stat-label">Completed today</span></button>
        <button onClick={() => navigate('/lab-reports/my')} className={(dashboard.data?.kpis.pendingLabReports ?? 0) > 0 ? 'needs-attention' : ''}><span className="rapid-stat-value">{dashboard.data?.kpis.pendingLabReports ?? 0}</span><span className="rapid-stat-label">Lab results to review</span></button>
        <button onClick={() => navigate('/consultations/follow-ups')} className={overdueFollowUps > 0 ? 'needs-attention' : ''}><span className="rapid-stat-value">{followUps.data?.length ?? 0}</span><span className="rapid-stat-label">Follow-ups due{overdueFollowUps > 0 ? ` · ${overdueFollowUps} overdue` : ''}</span></button>
        <button onClick={() => navigate('/prescriptions/my')}><span className="rapid-stat-value">{dashboard.data?.kpis.prescriptionsIssuedToday ?? 0}</span><span className="rapid-stat-label">Prescriptions today</span></button>
      </div>

      <section className="rapid-panel rapid-queue-panel">
        <div className="rapid-panel-header">
          <h2>Waiting room</h2>
          <button onClick={() => navigate('/queue/live')}>Full queue <ChevronRightIcon /></button>
        </div>
        {callBlocked && waiting.length > 0 && (
          <div className="rapid-queue-hint">Finish the current consultation to call the next patient.</div>
        )}
        {queue.loading && <div className="rapid-panel-empty">Loading today’s queue…</div>}
        {!queue.loading && waiting.length === 0 && <div className="rapid-panel-empty">No patients are waiting.</div>}
        <div className="rapid-queue-list">
          {waiting.slice(callBlocked ? 0 : 1, callBlocked ? 6 : 7).map((appointment, index) => {
            const minutes = waitingMinutes(appointment.scheduled_at);
            return (
              <div className={`rapid-queue-row${callBlocked ? ' no-action' : ''}`} key={appointment.appointment_id}>
                <div className="rapid-position">{index + (callBlocked ? 1 : 2)}</div>
                <div className="rapid-queue-who">
                  <PatientIdentity appointment={appointment} />
                  {inRoomPatientIds.has(displayPatientId(appointment)) && <span className="badge badge-amber">Also in consultation now</span>}
                  {appointment.reason && <span className="rapid-queue-reason">{appointment.reason}</span>}
                </div>
                <div className={`rapid-wait${waitTone(minutes)}`}>{formatWait(minutes)}</div>
                {!callBlocked && (
                  <button className="rapid-row-action" disabled={busyId !== null} onClick={() => changeStatus(appointment, 'Called')}>Call</button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
