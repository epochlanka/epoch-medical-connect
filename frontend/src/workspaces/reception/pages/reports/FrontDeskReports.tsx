import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { downloadFrontDeskReport, getFrontDeskReport } from '../../lib/reports';
import type { DateRange, FrontDeskDay } from '../../lib/reports';
import { ReportsIcon, UsersIcon, CheckCircleIcon, ClockIcon, UserPlusIcon, AlertIcon, DownloadIcon, CalendarIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import { useFeedback } from '../../../../shared/ui/feedback';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../billing/payments.css';
import '../billing/frontDeskMoney.css';

type Preset = 'today' | '7' | '30' | 'month' | 'custom';

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return keyOf(d);
};
const presetRange = (preset: Exclude<Preset, 'custom'>): DateRange => {
  if (preset === 'today') return { from: daysAgo(0), to: daysAgo(0) };
  if (preset === 'month') {
    const now = new Date();
    return { from: keyOf(new Date(now.getFullYear(), now.getMonth(), 1)), to: daysAgo(0) };
  }
  return { from: daysAgo(Number(preset) - 1), to: daysAgo(0) };
};

const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const minutes = (n: number | null) => (n === null ? '—' : `${n} min`);

interface Bucket {
  label: string;
  visits: number;
  completed: number;
  walkIns: number;
}

// Over two months of days, one bar per day gets too thin to read or hover — show weeks instead.
const toBuckets = (rows: FrontDeskDay[]): { buckets: Bucket[]; unit: 'day' | 'week' } => {
  if (rows.length <= 62) {
    return { unit: 'day', buckets: rows.map((r) => ({ label: shortDate(r.date), visits: r.visits, completed: r.completed, walkIns: r.walkIns })) };
  }
  const buckets: Bucket[] = [];
  for (let i = 0; i < rows.length; i += 7) {
    const week = rows.slice(i, i + 7);
    buckets.push({
      label: `${shortDate(week[0].date)} – ${shortDate(week[week.length - 1].date)}`,
      visits: week.reduce((s, r) => s + r.visits, 0),
      completed: week.reduce((s, r) => s + r.completed, 0),
      walkIns: week.reduce((s, r) => s + r.walkIns, 0),
    });
  }
  return { unit: 'week', buckets };
};

const FrontDeskReports = () => {
  const { toast } = useFeedback();
  const [preset, setPreset] = useState<Preset>('7');
  const [custom, setCustom] = useState<DateRange>(presetRange('7'));
  const [downloading, setDownloading] = useState<'csv' | 'pdf' | null>(null);

  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset)), [preset, custom]);
  const invalid = range.from > range.to;
  const { data: report, loading, error } = useApiData(() => (invalid ? Promise.resolve(null) : getFrontDeskReport(range)), [range.from, range.to]);
  const s = report?.summary;

  const { buckets, unit } = useMemo(() => toBuckets(report?.rows ?? []), [report]);
  const maxVisits = Math.max(1, ...buckets.map((b) => b.visits));
  const maxHour = Math.max(1, ...(report?.byHour ?? []).map((h) => h.visits));

  const download = async (format: 'csv' | 'pdf') => {
    setDownloading(format);
    try {
      await downloadFrontDeskReport(range, format);
    } catch {
      toast('The report could not be downloaded.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const presets: [Preset, string][] = [
    ['today', 'Today'],
    ['7', 'Last 7 days'],
    ['30', 'Last 30 days'],
    ['month', 'This month'],
    ['custom', 'Custom'],
  ];

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span className="fdm-title-icon">
              <ReportsIcon />
            </span>
            Front desk reports
          </h1>
          <p>How many patients came through, how the queue moved, and when the desk is busiest.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" disabled={!report || downloading !== null} onClick={() => download('csv')}>
            <DownloadIcon /> {downloading === 'csv' ? 'Downloading…' : 'CSV'}
          </button>
          <button className="pat-btn" disabled={!report || downloading !== null} onClick={() => download('pdf')}>
            <DownloadIcon /> {downloading === 'pdf' ? 'Downloading…' : 'PDF'}
          </button>
        </div>
      </div>

      <div className="fdr-range">
        <div className="fdm-aging" style={{ margin: 0 }} role="group" aria-label="Report period">
          {presets.map(([key, label]) => (
            <button key={key} className={`fdm-chip${preset === key ? ' active' : ''}`} onClick={() => setPreset(key)}>
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="pay-date-range" style={{ marginLeft: 8 }}>
            <input type="date" aria-label="From" value={custom.from} max={daysAgo(0)} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span>to</span>
            <input type="date" aria-label="To" value={custom.to} max={daysAgo(0)} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
      </div>

      {invalid && <div className="dash-error-banner">The start date is after the end date.</div>}
      {error && <div className="dash-error-banner">{error}</div>}

      <div className="fdm-kpi-row fdr-kpi-row">
        <KpiCard
          icon={<UsersIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Visits"
          value={s ? String(s.totalVisits) : '—'}
          loading={loading}
          changePct={s ? s.visitsChangePctVsPriorPeriod : undefined}
          compareLabel="the period before"
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Seen by a doctor"
          value={s ? String(s.completed) : '—'}
          loading={loading}
          footer={s ? <div className="pay-kpi-sub">{s.completionRatePct === null ? 'No visits' : `${s.completionRatePct}% of visits`}</div> : undefined}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Typical wait"
          value={s ? minutes(s.medianWaitMinutes) : '—'}
          loading={loading}
          footer={<div className="pay-kpi-sub">Arrival to seeing the doctor</div>}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#ede9fe"
          iconColor="#6d28d9"
          label="Typical consultation"
          value={s ? minutes(s.medianConsultMinutes) : '—'}
          loading={loading}
          footer={<div className="pay-kpi-sub">Time with the doctor</div>}
        />
        <KpiCard
          icon={<AlertIcon />}
          iconBg="#fee2e2"
          iconColor="#b91c1c"
          label="No-shows"
          value={s ? String(s.noShows) : '—'}
          loading={loading}
          footer={s ? <div className="pay-kpi-sub">{s.cancelled} cancelled</div> : undefined}
        />
        <KpiCard
          icon={<UserPlusIcon />}
          iconBg="#cffafe"
          iconColor="#0e7490"
          label="New patients"
          value={s ? String(s.newPatients) : '—'}
          loading={loading}
          footer={s ? <div className="pay-kpi-sub">{s.walkIns} walk-ins</div> : undefined}
        />
      </div>

      {report && (
        <>
          <div className="fdr-grid">
            <div className="fdm-card">
              <div className="fdm-card-title">Visits per {unit}</div>
              {s && s.totalVisits === 0 ? (
                <p className="pat-muted">No visits in this period.</p>
              ) : (
                <>
                  <div className="fdr-chart" role="img" aria-label={`Visits per ${unit}. Busiest: ${s?.busiestDay ?? 'none'}. Exact figures are in the daily table below.`}>
                    {buckets.map((b) => (
                      <div className="fdr-bar-slot" key={b.label} tabIndex={0} aria-label={`${b.label}: ${b.visits} visits`}>
                        <div className="fdr-bar" style={{ height: `${(b.visits / maxVisits) * 100}%` }} />
                        <div className="fdr-tip-anchor" style={{ height: `${(b.visits / maxVisits) * 100}%` }}>
                          <div className="fdr-tip">
                            <strong>{b.label}</strong>
                            <br />
                            {b.visits} visits · {b.completed} seen · {b.walkIns} walk-ins
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="fdr-axis">
                    <span>{buckets[0]?.label}</span>
                    <span>Peak {maxVisits}</span>
                    <span>{buckets[buckets.length - 1]?.label}</span>
                  </div>
                </>
              )}
            </div>

            <div className="fdm-card">
              <div className="fdm-card-title">Busiest hours</div>
              {report.byHour.length === 0 ? (
                <p className="pat-muted">No arrivals in this period.</p>
              ) : (
                <>
                  <div className="fdr-hbars">
                    {report.byHour.map((h) => (
                      <div className="fdr-hbar" key={h.hour} title={`${h.label}–${String(h.hour + 1).padStart(2, '0')}:00: ${h.visits} arrivals`}>
                        <span>{h.label}</span>
                        <div className="fdr-hbar-track">
                          <div className="fdr-hbar-fill" style={{ width: `${(h.visits / maxHour) * 100}%` }} />
                        </div>
                        <span className="fdr-hbar-value">{h.visits}</span>
                      </div>
                    ))}
                  </div>
                  <p className="pat-muted fdm-small">Arrivals by the hour they joined the queue or were booked for.</p>
                </>
              )}
            </div>
          </div>

          <div className="fdm-card">
            <div className="fdm-card-title">By doctor</div>
            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th className="fdm-num">Visits</th>
                    <th className="fdm-num">Seen</th>
                    <th className="fdm-num">Typical wait</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDoctor.length === 0 && (
                    <tr>
                      <td colSpan={4} className="pat-empty">
                        No visits in this period.
                      </td>
                    </tr>
                  )}
                  {report.byDoctor.map((d) => (
                    <tr key={d.doctor}>
                      <td className="pat-name">{d.doctor}</td>
                      <td className="fdm-num">{d.visits}</td>
                      <td className="fdm-num">{d.completed}</td>
                      <td className="fdm-num">{minutes(d.medianWaitMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="fdm-card">
            <div className="fdm-card-title">
              <span style={{ display: 'inline-flex', verticalAlign: -3, marginRight: 6, color: '#94a3b8' }}>
                <CalendarIcon />
              </span>
              Day by day
            </div>
            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="fdm-num">Visits</th>
                    <th className="fdm-num">Booked</th>
                    <th className="fdm-num">Walk-ins</th>
                    <th className="fdm-num">Follow-ups</th>
                    <th className="fdm-num">Seen</th>
                    <th className="fdm-num">No-shows</th>
                    <th className="fdm-num">Cancelled</th>
                    <th className="fdm-num">Skipped</th>
                    <th className="fdm-num">New patients</th>
                    <th className="fdm-num">Typical wait</th>
                    <th className="fdm-num">Typical consult</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.rows].reverse().map((r) => (
                    <tr key={r.date}>
                      <td>{shortDate(r.date)}</td>
                      <td className="fdm-num">
                        <strong>{r.visits}</strong>
                      </td>
                      <td className="fdm-num">{r.booked}</td>
                      <td className="fdm-num">{r.walkIns}</td>
                      <td className="fdm-num">{r.followUps}</td>
                      <td className="fdm-num">{r.completed}</td>
                      <td className="fdm-num">{r.noShows}</td>
                      <td className="fdm-num">{r.cancelled}</td>
                      <td className="fdm-num">{r.skipped}</td>
                      <td className="fdm-num">{r.newPatients}</td>
                      <td className="fdm-num">{minutes(r.medianWaitMinutes)}</td>
                      <td className="fdm-num">{minutes(r.medianConsultMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pat-muted fdm-small">
              Typical times are medians, so one very long wait does not skew them. Wait is measured from when the patient was booked for, or joined the queue as a walk-in, to
              when the doctor opened the consultation.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default FrontDeskReports;
