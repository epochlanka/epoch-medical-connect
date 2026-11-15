import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useApiData } from '../../hooks/useApiData';
import {
  getLiveQueue,
  getQueueStats,
  listAppointments,
  updateAppointmentStatus,
  tokenNumber,
  waitingMinutes,
  displayPatientName,
  displayPatientId,
  displayPatientGender,
  displayAgeLabel,
} from '../../lib/queue';
import type { QueueAppointment, AppointmentStatus } from '../../lib/queue';
import { PatientsIcon, ClockIcon, StethoscopeIcon, CheckCircleIcon, RefreshIcon, PhoneIcon, MegaphoneIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import SkipModal from './SkipModal';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import './queue.css';
import { PatientLink } from '../../../../shared/patients/PatientPanel';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  Waiting: 'badge-gray',
  Called: 'badge-blue',
  Consulting: 'badge-amber',
  Completed: 'badge-green',
  Skipped: 'badge-red',
  Cancelled: 'badge-red',
  'No Show': 'badge-red',
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The doctor's one queue page (it replaced a separate "Call Next" page): call, skip and start
// consultations from the live list, and recall skipped patients from the Skipped tab.

// Re-renders periodically so waiting/consulting durations tick forward without a full refetch.
const useNow = (intervalMs: number) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
};

type Tab = 'live' | 'called' | 'skipped' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'live', label: 'Live Queue' },
  { key: 'called', label: 'Called History' },
  { key: 'skipped', label: 'Skipped / Recalled' },
  { key: 'all', label: 'All Appointments' },
];

const LiveQueue = () => {
  useNow(30000);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [skipTarget, setSkipTarget] = useState<QueueAppointment | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: queue, loading, error, reload: reloadQueue } = useApiData(getLiveQueue);
  const { data: stats, reload: reloadStats } = useApiData(getQueueStats);
  const { data: todaysList, reload: reloadToday } = useApiData(
    () => listAppointments({ date: todayLocal(), limit: 100 }),
    [activeTab]
  );

  const refreshAll = () => {
    reloadQueue();
    reloadStats();
    reloadToday();
  };

  const waitingSorted = useMemo(
    () => (queue ?? []).filter((a) => a.status === 'Waiting').sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [queue]
  );
  const calledList = useMemo(() => (queue ?? []).filter((a) => a.status === 'Called'), [queue]);
  const firstWaitingId = waitingSorted[0]?.appointment_id;
  const nowCalling = calledList[0];
  const skippedCount = (todaysList?.data ?? []).filter((a) => a.status === 'Skipped').length;

  const visibleRows = showAllRows ? [...calledList, ...waitingSorted] : [...calledList, ...waitingSorted].slice(0, 8);
  const totalRows = calledList.length + waitingSorted.length;

  const runAction = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
      refreshAll();
    } finally {
      setBusyId(null);
    }
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const waitClass = (mins: number) => (mins > 30 ? 'late' : mins > 15 ? 'warn' : 'ok');

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Live Queue</h1>
          <p>Real-time patient queue for your consultations.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dash-date-chip">
            {dateLabel} · {timeLabel}
          </div>
          <button className="pat-btn" onClick={refreshAll}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      <div className="q-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`q-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
            {t.key === 'skipped' && skippedCount > 0 && <span className="q-tab-count">{skippedCount}</span>}
          </button>
        ))}
      </div>

      {error && <div className="dash-error-banner">Couldn't load the queue: {error}</div>}

      <div className="q-controls-top">
        <button
          className="q-top-control-btn primary"
          disabled={!firstWaitingId || busyId !== null}
          onClick={() => firstWaitingId && runAction(firstWaitingId, () => updateAppointmentStatus(firstWaitingId, 'Called'))}
        >
          <PhoneIcon /> Call Next Patient
        </button>
        <button
          className="q-top-control-btn"
          disabled={(!calledList[0] && !waitingSorted[0]) || busyId !== null}
          onClick={() => setSkipTarget(calledList[0] ?? waitingSorted[0])}
        >
          Skip Patient
        </button>
        <button className="q-top-control-btn" disabled={skippedCount === 0} onClick={() => setActiveTab('skipped')}>
          <RefreshIcon /> Recall a skipped patient{skippedCount > 0 ? ` (${skippedCount})` : ''}
        </button>
      </div>

      <div className="dash-kpi-row">
        <KpiCard icon={<PatientsIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total in Queue" value={String(stats?.totalInQueue ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#64748b', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Waiting &gt; 30 min" value={String(stats?.waitingOver30 ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#64748b', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<StethoscopeIcon />} iconBg="#fef3c7" iconColor="#b45309" label="In Consultation" value={String(stats?.inConsultation ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#64748b', fontWeight: 500 }}>Patient</span>} />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Completed Today" value={String(stats?.completedToday ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#64748b', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Avg. Waiting Time" value={`${stats?.avgWaitingTimeMinutes ?? 0} min`} loading={!stats} />
      </div>

      {activeTab === 'live' ? (
        <div className="q-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>
          <div className="pat-table-card">
            <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Current Queue</h3>
            </div>
            <div className="pat-table-scroll">
              <table className="pat-table q-live-queue-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient</th>
                    <th>Age / Sex</th>
                    <th>Waiting</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="pat-muted">
                          Loading…
                        </td>
                      </tr>
                    ))}
                  {!loading && visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="pat-empty">No patients waiting or called right now.</div>
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    visibleRows.map((a) => {
                      const mins = waitingMinutes(a.scheduled_at);
                      const isNext = a.appointment_id === firstWaitingId;
                      return (
                        <tr key={a.appointment_id} className={isNext ? 'q-row-next' : undefined}>
                          <td>
                            <span className={`q-token${isNext ? ' next' : ''}`}>{tokenNumber(a.appointment_id)}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              <PatientLink patientId={a.patient_id}>{displayPatientName(a)}</PatientLink> {a.is_temporary && <span className="badge badge-amber">Temporary</span>}
                            </div>
                            <span className="pat-muted" style={{ fontSize: 13 }}>
                              {displayPatientId(a)}
                            </span>
                          </td>
                          <td>
                            <span className={`q-gender-dot ${displayPatientGender(a) === 'Female' ? 'female' : 'male'}`} />
                            {displayAgeLabel(a) ?? '—'} {displayPatientGender(a) ? `/ ${displayPatientGender(a)}` : ''}
                          </td>
                          <td>
                            <div className={`q-wait-time ${waitClass(mins)}`}>{mins} min</div>
                            <span className="pat-muted" style={{ fontSize: 12.5 }}>since {formatTime(a.scheduled_at)}</span>
                          </td>
                          <td>
                            {a.status === 'Waiting' && isNext ? (
                              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 14 }}>Next</span>
                            ) : (
                              <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                            )}
                          </td>
                          <td>
                            {a.status === 'Called' ? (
                              <button
                                className="pat-btn primary"
                                style={{ fontSize: 13, padding: '6px 12px' }}
                                disabled={busyId === a.appointment_id}
                                onClick={async () => {
                                  await runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Consulting'));
                                  navigate(`/consultations/workspace/${a.appointment_id}`);
                                }}
                              >
                                Start Consultation
                              </button>
                            ) : isNext ? (
                              <button
                                className="pat-btn primary"
                                style={{ fontSize: 13, padding: '6px 12px' }}
                                disabled={busyId === a.appointment_id}
                                onClick={() => runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Called'))}
                              >
                                <PhoneIcon /> Call Next
                              </button>
                            ) : (
                              <button className="pat-btn" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => setSkipTarget(a)}>
                                Skip
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {totalRows > 8 && (
              <div className="pat-pagination">
                <div className="pat-pagination-info">
                  Showing {visibleRows.length} of {totalRows} patients
                </div>
                <button className="card-link" onClick={() => setShowAllRows((v) => !v)}>
                  {showAllRows ? 'Show fewer' : 'View All'}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {nowCalling ? (
              <div className="q-now-card">
                <div className="q-now-header">NOW CALLING</div>
                <div className="q-now-top">
                  <div>
                    <div className="q-now-label">Token No.</div>
                    <div className="q-now-token-big">{tokenNumber(nowCalling.appointment_id)}</div>
                  </div>
                  <div className="q-now-avatar">{initials(displayPatientName(nowCalling))}</div>
                </div>
                <div className="q-now-row">
                  <span className="q-now-label">Patient</span>
                  <span className="q-now-value">
                    <PatientLink patientId={nowCalling.patient_id}>{displayPatientName(nowCalling)}</PatientLink> {nowCalling.is_temporary && <span className="badge badge-amber">Temporary</span>}
                  </span>
                </div>
                <div className="q-now-row">
                  <span className="q-now-label">MRN</span>
                  <span className="q-now-value">{displayPatientId(nowCalling)}</span>
                </div>
                <div className="q-now-stats">
                  <div className="q-now-stat-box">
                    <div className="q-now-stat-label">Arrival Time</div>
                    <div className="q-now-stat-value">{formatTime(nowCalling.scheduled_at)}</div>
                  </div>
                  <div className="q-now-stat-box">
                    <div className="q-now-stat-label">Waiting Time</div>
                    <div className="q-now-stat-value">{waitingMinutes(nowCalling.scheduled_at)} min</div>
                  </div>
                </div>
                <div className="q-now-message">
                  <MegaphoneIcon /> Please send the patient in for consultation.
                </div>
                <button
                  className="pat-btn primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                  disabled={busyId === nowCalling.appointment_id}
                  onClick={async () => {
                    await runAction(nowCalling.appointment_id, () => updateAppointmentStatus(nowCalling.appointment_id, 'Consulting'));
                    navigate(`/consultations/workspace/${nowCalling.appointment_id}`);
                  }}
                >
                  <StethoscopeIcon /> Start Consultation
                </button>
              </div>
            ) : (
              <div className="q-now-card empty">No patient is currently being called.</div>
            )}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Queue Summary</h3>
              </div>
              <div className="q-summary-row">
                <span className="q-summary-label">Total in Queue</span>
                <span className="q-summary-value">{stats?.totalInQueue ?? 0}</span>
              </div>
              <div className="q-summary-row">
                <span className="q-summary-label">Waiting &gt; 30 min</span>
                <span className="q-summary-value warn">{stats?.waitingOver30 ?? 0}</span>
              </div>
              <div className="q-summary-row">
                <span className="q-summary-label">Average Waiting Time</span>
                <span className="q-summary-value">{stats?.avgWaitingTimeMinutes ?? 0} min</span>
              </div>
              <div className="q-summary-row">
                <span className="q-summary-label">Longest Waiting Time</span>
                <span className="q-summary-value warn">{stats?.longestWaitingTimeMinutes ?? 0} min</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Token No.</th>
                  <th>Patient Name</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  {activeTab === 'skipped' && <th>Reason</th>}
                  {activeTab === 'skipped' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {!todaysList && (
                  <tr>
                    <td colSpan={7} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {todaysList &&
                  (() => {
                    const rows = todaysList.data.filter((a) => {
                      if (activeTab === 'called') return ['Called', 'Consulting', 'Completed'].includes(a.status);
                      if (activeTab === 'skipped') return a.status === 'Skipped';
                      return true;
                    });
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7}>
                            <div className="pat-empty">Nothing here today.</div>
                          </td>
                        </tr>
                      );
                    }
                    return rows.map((a) => (
                      <tr key={a.appointment_id}>
                        <td>
                          <span className="q-token">{tokenNumber(a.appointment_id)}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            <PatientLink patientId={a.patient_id}>{displayPatientName(a)}</PatientLink> {a.is_temporary && <span className="badge badge-amber">Temporary</span>}
                          </div>
                          <span className="pat-muted" style={{ fontSize: 13 }}>
                            {displayPatientId(a)}
                          </span>
                        </td>
                        <td>{formatDate(a.scheduled_at)}</td>
                        <td>{formatTime(a.scheduled_at)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                        </td>
                        {activeTab === 'skipped' && <td className="pat-muted">{a.skip_reason || '—'}</td>}
                        {activeTab === 'skipped' && (
                          <td>
                            <button
                              className="pat-btn"
                              style={{ fontSize: 13, padding: '6px 12px' }}
                              disabled={busyId === a.appointment_id}
                              onClick={() => runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Waiting'))}
                            >
                              <RefreshIcon /> Recall
                            </button>
                          </td>
                        )}
                      </tr>
                    ));
                  })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {skipTarget && (
        <SkipModal
          appointment={skipTarget}
          onClose={() => setSkipTarget(null)}
          onSkipped={() => {
            setSkipTarget(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default LiveQueue;
