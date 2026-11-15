import { Fragment, useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getInvoice, getOutstandingBalances } from '../../lib/billing';
import type { AgingKey, Invoice, OutstandingGroup, OutstandingParams } from '../../lib/billing';
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, SearchIcon, UsersIcon, InvoiceIcon, ClockIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import ViewInvoiceModal from './ViewInvoiceModal';
import RecordPaymentModal from './RecordPaymentModal';
import { formatCurrency, formatDate, paymentStatusLabel, STATUS_BADGE } from './billingUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import './payments.css';
import './frontDeskMoney.css';
import { PatientLink } from '../../../../shared/patients/PatientPanel';

const ageLabel = (days: number) => (days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`);

const csvEscape = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (groups: OutstandingGroup[]) => {
  const header = ['Patient', 'Patient ID', 'Phone', 'Invoice No.', 'Invoice date', 'Days unpaid', 'Total', 'Paid', 'Balance'];
  const body = groups.flatMap((g) =>
    g.invoices.map((i) => [g.patientName, g.patientId, g.phone, i.code, formatDate(i.createdAt), i.ageDays, i.total.toFixed(2), i.paid.toFixed(2), i.balance.toFixed(2)]),
  );
  return [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
};

const OutstandingBalances = () => {
  const [search, setSearch] = useState('');
  const [aging, setAging] = useState<AgingKey | ''>('');
  const [sort, setSort] = useState<'balance' | 'oldest'>('balance');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const params: OutstandingParams = useMemo(
    () => ({ search: search.trim() || undefined, aging: aging || undefined, sort, page, limit: 15 }),
    [search, aging, sort, page],
  );
  const { data, loading, error, reload } = useApiData(() => getOutstandingBalances(params), [params]);
  const summary = data?.summary;
  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const over30 = summary?.aging.find((b) => b.key === 'over30');

  const takePayment = async (invoiceId: number) => {
    setOpening(invoiceId);
    try {
      setPaymentTarget(await getInvoice(invoiceId));
    } finally {
      setOpening(null);
    }
  };

  const handleExport = async () => {
    const all = await getOutstandingBalances({ ...params, page: 1, limit: 100 });
    let groups = all.data;
    for (let p = 2; p <= all.pagination.totalPages; p += 1) groups = groups.concat((await getOutstandingBalances({ ...params, page: p, limit: 100 })).data);
    const blob = new Blob([toCsv(groups)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unpaid-balances-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span className="fdm-title-icon">
              <AlertIcon />
            </span>
            Unpaid balances
          </h1>
          <p>Patients who still owe money. Open a patient to see each unpaid bill and take a payment against it.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport} disabled={!rows.length}>
            <DownloadIcon /> Export
          </button>
        </div>
      </div>

      <div className="fdm-kpi-row">
        <KpiCard icon={<InvoiceIcon />} iconBg="#fee2e2" iconColor="#b91c1c" label="Total owed" value={summary ? formatCurrency(summary.totalOutstanding) : '—'} loading={!summary} />
        <KpiCard icon={<UsersIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Patients owing" value={summary ? String(summary.patientCount) : '—'} loading={!summary} />
        <KpiCard
          icon={<InvoiceIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Unpaid bills"
          value={summary ? String(summary.invoiceCount) : '—'}
          loading={!summary}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#ede9fe"
          iconColor="#6d28d9"
          label="Owed over 30 days"
          value={over30 ? formatCurrency(over30.amount) : '—'}
          loading={!summary}
          footer={over30 ? <div className="pay-kpi-sub">{over30.count} bills</div> : undefined}
        />
      </div>

      <div className="fdm-aging" role="group" aria-label="Filter by how long the oldest bill has been unpaid">
        <button className={`fdm-chip${aging === '' ? ' active' : ''}`} onClick={() => { setAging(''); setPage(1); }}>
          All
        </button>
        {summary?.aging.map((b) => (
          <button
            key={b.key}
            className={`fdm-chip${aging === b.key ? ' active' : ''}`}
            onClick={() => {
              setAging(b.key);
              setPage(1);
            }}
          >
            {b.label}
            <span className="fdm-chip-amount">{formatCurrency(b.amount)}</span>
          </button>
        ))}
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search" style={{ flex: 1, maxWidth: 380 }}>
          <SearchIcon />
          <input
            placeholder="Search by patient name, phone, patient ID or invoice no.…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select className="pat-select" value={sort} onChange={(e) => setSort(e.target.value as 'balance' | 'oldest')} aria-label="Sort">
          <option value="balance">Largest balance first</option>
          <option value="oldest">Oldest debt first</option>
        </select>
      </div>

      {error && <div className="dash-error-banner">{error}</div>}

      <div className="pat-table-card" style={{ marginTop: 16 }}>
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Phone</th>
                <th>Unpaid bills</th>
                <th>Oldest unpaid</th>
                <th className="fdm-num">Billed (LKR)</th>
                <th className="fdm-num">Paid (LKR)</th>
                <th className="fdm-num">Owes (LKR)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="pat-empty">
                    {search || aging ? 'No unpaid balances match these filters.' : 'Nobody owes the clinic anything right now.'}
                  </td>
                </tr>
              )}
              {rows.map((g) => {
                const open = expanded === g.key;
                return (
                  <Fragment key={g.key}>
                    <tr className={open ? 'fdm-row-open' : undefined}>
                      <td>
                        <div className="pat-name"><PatientLink patientId={g.patientId}>{g.patientName}</PatientLink></div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {g.patientId ?? 'Unregistered walk-in'}
                        </span>
                      </td>
                      <td>{g.phone ?? '—'}</td>
                      <td>{g.invoices.length}</td>
                      <td>
                        <span className={g.oldestAgeDays > 30 ? 'fdm-age-old' : undefined}>{ageLabel(g.oldestAgeDays)}</span>
                        <div className="pat-muted" style={{ fontSize: 11.5 }}>
                          {formatDate(g.oldestInvoiceAt)}
                        </div>
                      </td>
                      <td className="fdm-num">{g.totalBilled.toFixed(2)}</td>
                      <td className="fdm-num">{g.totalPaid.toFixed(2)}</td>
                      <td className="fdm-num fdm-owed">{g.balance.toFixed(2)}</td>
                      <td>
                        <button className="pat-btn" aria-expanded={open} onClick={() => setExpanded(open ? null : g.key)}>
                          {open ? 'Hide bills' : 'Show bills'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="fdm-detail-row">
                        <td colSpan={8}>
                          <table className="fdm-subtable">
                            <thead>
                              <tr>
                                <th>Invoice</th>
                                <th>Date</th>
                                <th>For</th>
                                <th>Status</th>
                                <th className="fdm-num">Total</th>
                                <th className="fdm-num">Paid</th>
                                <th className="fdm-num">Owes</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.invoices.map((i) => (
                                <tr key={i.invoiceId}>
                                  <td>
                                    <button className="pat-id-link" onClick={() => setViewInvoiceId(i.invoiceId)}>
                                      {i.code}
                                    </button>
                                  </td>
                                  <td>
                                    {formatDate(i.createdAt)} <span className="pat-muted">({ageLabel(i.ageDays)})</span>
                                  </td>
                                  <td>{i.type.replace('+', ' + ')}</td>
                                  <td>
                                    <span className={`badge ${STATUS_BADGE[paymentStatusLabel(i.status)]}`}>{paymentStatusLabel(i.status)}</span>
                                  </td>
                                  <td className="fdm-num">{i.total.toFixed(2)}</td>
                                  <td className="fdm-num">{i.paid.toFixed(2)}</td>
                                  <td className="fdm-num fdm-owed">{i.balance.toFixed(2)}</td>
                                  <td>
                                    <button className="pat-btn primary" disabled={opening === i.invoiceId} onClick={() => takePayment(i.invoiceId)}>
                                      {opening === i.invoiceId ? 'Opening…' : 'Take payment'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > pagination.limit && (
          <div className="pat-pagination">
            <div className="pat-pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} patients
            </div>
            <div className="pat-pagination-pages">
              <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} aria-label="Previous page">
                <ChevronLeftIcon />
              </button>
              <span className="pat-muted" style={{ fontSize: 12.5 }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} aria-label="Next page">
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {viewInvoiceId && (
        <ViewInvoiceModal
          invoiceId={viewInvoiceId}
          onClose={() => setViewInvoiceId(null)}
          onRecordPayment={(inv) => {
            setViewInvoiceId(null);
            setPaymentTarget(inv);
          }}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default OutstandingBalances;
