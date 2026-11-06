import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { closeDay, getDayClose, listDayCloses, reopenDay } from '../../lib/billing';
import type { DayCloseLine, DayCloseRecord, DayCloseView, DayReopen } from '../../lib/billing';
import { useFeedback } from '../../../../shared/ui/feedback';
import { CheckCircleIcon, AlertIcon } from '../../components/layout/Icons';
import { formatCurrency, formatDate, formatDateTime, invoiceCode } from './billingUtils';
// Shared by the reception and admin workspaces. It deliberately imports no workspace stylesheet:
// both define the same pat-* / kpi-* class names, and loading one workspace's copy inside the other
// would restyle that workspace's own pages. Each workspace's page wrapper loads its own instead.
import './frontDeskMoney.css';

// Sri Lankan rupee notes and coins in everyday use, largest first.
const NOTES = [5000, 2000, 1000, 500, 100, 50, 20];
const COINS = [10, 5, 2, 1];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isCash = (method: string) => method.trim().toLowerCase() === 'cash';
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;

const longDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const Difference = ({ value }: { value: number }) => {
  if (Math.abs(value) < 0.01) return <span className="fdm-diff ok">Matches</span>;
  return (
    <span className={`fdm-diff ${value > 0 ? 'over' : 'short'}`}>
      {value > 0 ? 'Over' : 'Short'} {money(Math.abs(value))}
    </span>
  );
};

const LinesTable = ({ lines, openingFloat, notCounted }: { lines: DayCloseLine[]; openingFloat: number; notCounted?: string[] }) => (
  <table className="pat-table fdm-lines">
    <thead>
      <tr>
        <th>Method</th>
        <th className="fdm-num">Taken (LKR)</th>
        <th className="fdm-num">Refunded (LKR)</th>
        <th className="fdm-num">Should have (LKR)</th>
        <th className="fdm-num">Counted (LKR)</th>
        <th>Difference</th>
      </tr>
    </thead>
    <tbody>
      {lines.map((l) => (
        <tr key={l.method}>
          <td>
            <div className="pat-name">{l.method}</div>
            {isCash(l.method) && openingFloat > 0 && <span className="pat-muted" style={{ fontSize: 11.5 }}>incl. {money(openingFloat)} opening float</span>}
          </td>
          <td className="fdm-num">{money(l.received)}</td>
          <td className="fdm-num">{l.refunded > 0 ? money(l.refunded) : '—'}</td>
          <td className="fdm-num">{money(l.expected)}</td>
          {notCounted?.includes(l.method) ? (
            <>
              <td className="fdm-num pat-muted">—</td>
              <td className="pat-muted">Not counted yet</td>
            </>
          ) : (
            <>
              <td className="fdm-num">{money(l.counted)}</td>
              <td>
                <Difference value={l.variance} />
              </td>
            </>
          )}
        </tr>
      ))}
    </tbody>
  </table>
);

interface ClosedSummaryProps {
  close: DayCloseRecord;
  changed: DayCloseView['changedSinceClose'];
  canReopen: boolean;
  onReopened: () => void;
}

const ClosedSummary = ({ close, changed, canReopen, onReopened }: ClosedSummaryProps) => {
  const { toast } = useFeedback();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitReopen = async () => {
    setBusy(true);
    setError(null);
    try {
      await reopenDay(close.date, reason.trim());
      toast(`${longDate(close.date)} is open again and can be recounted.`, 'success');
      onReopened();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The day could not be reopened.');
    } finally {
      setBusy(false);
    }
  };

  return (
  <div className="fdm-card">
    <div className="fdm-closed-head">
      <span className="fdm-closed-icon">
        <CheckCircleIcon />
      </span>
      <div>
        <div className="fdm-card-title">This day is closed</div>
        <div className="pat-muted">
          Counted and signed off by <strong>{close.closedBy}</strong> on {formatDateTime(close.closedAt)}
        </div>
      </div>
      <div className="fdm-closed-total">
        <Difference value={close.varianceTotal} />
      </div>
    </div>

    {changed && (
      <div className="fdm-warning" role="alert">
        <AlertIcon />
        <div>
          <strong>Money has moved since this day was closed.</strong>{' '}
          {changed.paymentsAdded !== 0 && `${changed.paymentsAdded} payment${Math.abs(changed.paymentsAdded) === 1 ? '' : 's'} `}
          {changed.refundsAdded !== 0 && `${changed.refundsAdded} refund${Math.abs(changed.refundsAdded) === 1 ? '' : 's'} `}
          recorded afterwards change the day's total by {formatCurrency(changed.netDifference)}.{' '}
          {canReopen ? 'Reopen the day so it can be counted again.' : 'Tell the administrator, who can reopen the day for a recount.'}
        </div>
      </div>
    )}

    <LinesTable lines={close.lines} openingFloat={close.openingFloat} />

    <div className="fdm-closed-foot">
      {close.notes && (
        <div>
          <div className="fdm-label">Note</div>
          <div>{close.notes}</div>
        </div>
      )}
      {close.denominations && (
        <div>
          <div className="fdm-label">Cash counted</div>
          <div className="fdm-denoms-read">
            {Object.entries(close.denominations)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([face, count]) => (
                <span key={face}>
                  {count} × {Number(face).toLocaleString()}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>

    {canReopen &&
      (reopening ? (
        <div className="fdm-reopen">
          <div className="modal-field">
            <label htmlFor="fdm-reopen-reason">Why does this day need to be counted again?</label>
            <textarea
              id="fdm-reopen-reason"
              rows={2}
              maxLength={1000}
              value={reason}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: a card payment was entered as cash; the drawer is being recounted"
            />
          </div>
          <p className="pat-muted fdm-hint">The count above is kept in this day&apos;s history. The front desk will then count and close the day again.</p>
          {error && <div className="dash-error-banner">{error}</div>}
          <div className="fdm-reopen-actions">
            <button className="pat-btn" disabled={busy} onClick={() => { setReopening(false); setReason(''); setError(null); }}>
              Cancel
            </button>
            <button className="pat-btn primary" disabled={busy || reason.trim().length < 5} onClick={submitReopen}>
              {busy ? 'Reopening…' : 'Reopen this day'}
            </button>
          </div>
        </div>
      ) : (
        <div className="fdm-reopen-actions">
          <button className="pat-btn" onClick={() => setReopening(true)}>
            Reopen this day
          </button>
        </div>
      ))}
  </div>
  );
};

const ReopenHistory = ({ reopens }: { reopens: DayReopen[] }) => (
  <div className="fdm-card">
    <div className="fdm-card-title">Earlier counts for this day</div>
    <p className="pat-muted fdm-hint">This day was closed and then reopened by an administrator. Each earlier count is kept here.</p>
    <div className="pat-table-scroll">
      <table className="pat-table">
        <thead>
          <tr>
            <th>Closed by</th>
            <th className="fdm-num">Counted (LKR)</th>
            <th>Difference</th>
            <th>Reopened by</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {reopens.map((r) => (
            <tr key={r.reopenId}>
              <td>
                {r.previous.closedBy}
                <div className="pat-muted" style={{ fontSize: 11.5 }}>
                  {formatDateTime(r.previous.closedAt)}
                </div>
              </td>
              <td className="fdm-num">{money(r.previous.countedTotal)}</td>
              <td>
                <Difference value={r.previous.varianceTotal} />
              </td>
              <td>
                {r.reopenedBy}
                <div className="pat-muted" style={{ fontSize: 11.5 }}>
                  {formatDateTime(r.reopenedAt)}
                </div>
              </td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

interface CountFormProps {
  view: DayCloseView;
  onClosed: () => void;
}

const CountForm = ({ view, onClosed }: CountFormProps) => {
  const { confirm, toast } = useFeedback();
  const [openingFloat, setOpeningFloat] = useState('');
  const [cashMode, setCashMode] = useState<'notes' | 'total'>('notes');
  const [denoms, setDenoms] = useState<Record<number, string>>({});
  const [cashTotal, setCashTotal] = useState('');
  const [others, setOthers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cash = view.methods.find((m) => isCash(m.method)) ?? { method: 'Cash', received: 0, refunded: 0, net: 0 };
  const otherMethods = view.methods.filter((m) => !isCash(m.method) && (m.received > 0 || m.refunded > 0));
  const quietMethods = view.methods.filter((m) => !isCash(m.method) && m.received === 0 && m.refunded === 0);

  const float = Number(openingFloat) || 0;
  const notesTotal = round2([...NOTES, ...COINS].reduce((sum, face) => sum + face * (Number(denoms[face]) || 0), 0));
  const countedCash = cashMode === 'notes' ? notesTotal : Number(cashTotal) || 0;

  const lines: DayCloseLine[] = useMemo(
    () => [
      { ...cash, expected: round2(cash.net + float), counted: countedCash, variance: round2(countedCash - (cash.net + float)) },
      ...otherMethods.map((m) => {
        const counted = Number(others[m.method]) || 0;
        return { ...m, expected: m.net, counted, variance: round2(counted - m.net) };
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, float, countedCash, others],
  );

  const missing = [
    ...(cashMode === 'total' && cashTotal === '' ? ['Cash'] : []),
    ...otherMethods.filter((m) => (others[m.method] ?? '') === '').map((m) => m.method),
  ];
  const mismatch = lines.some((l) => !missing.includes(l.method) && Math.abs(l.variance) >= 0.01);
  const canSubmit = missing.length === 0 && (!mismatch || notes.trim().length > 0) && !submitting;

  const handleSubmit = async () => {
    const ok = await confirm({
      title: `Close ${longDate(view.date)}?`,
      body: mismatch
        ? 'The count does not match what was recorded. Once closed, the count and your note are kept as they are and cannot be edited.'
        : 'Once closed, the count is kept as it is and cannot be edited.',
      confirmLabel: 'Close the day',
    });
    if (!ok) return;

    setSubmitting(true);
    setError(null);
    try {
      const denominations =
        cashMode === 'notes'
          ? Object.fromEntries(Object.entries(denoms).filter(([, v]) => Number(v) > 0).map(([face, v]) => [face, Number(v)]))
          : undefined;
      await closeDay({
        date: view.date,
        opening_float: float,
        counted: lines.map((l) => ({ method: l.method, amount: l.counted })),
        denominations,
        notes: notes.trim() || undefined,
      });
      toast(`${longDate(view.date)} is closed.`, 'success');
      onClosed();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The day could not be closed.');
    } finally {
      setSubmitting(false);
    }
  };

  const denomInput = (face: number) => (
    <label key={face} className="fdm-denom">
      <span className="fdm-denom-face">{face.toLocaleString()}</span>
      <span className="fdm-denom-x">×</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={denoms[face] ?? ''}
        placeholder="0"
        aria-label={`Number of ${face} rupee ${face >= 20 ? 'notes' : 'coins'}`}
        onChange={(e) => setDenoms((d) => ({ ...d, [face]: e.target.value.replace(/[^0-9]/g, '') }))}
      />
      <span className="fdm-denom-sum">{money(face * (Number(denoms[face]) || 0))}</span>
    </label>
  );

  return (
    <div className="fdm-count-grid">
      <div className="fdm-card">
        <div className="fdm-card-title">1. Count the cash drawer</div>
        <div className="modal-field" style={{ maxWidth: 260 }}>
          <label htmlFor="fdm-float">Opening float (cash in the drawer when the day started)</label>
          <input id="fdm-float" type="number" min={0} step="0.01" placeholder="0.00" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
        </div>

        <div className="fdm-toggle" role="radiogroup" aria-label="How to enter the cash">
          <button role="radio" aria-checked={cashMode === 'notes'} className={cashMode === 'notes' ? 'active' : ''} onClick={() => setCashMode('notes')}>
            Count notes and coins
          </button>
          <button role="radio" aria-checked={cashMode === 'total'} className={cashMode === 'total' ? 'active' : ''} onClick={() => setCashMode('total')}>
            Enter the total
          </button>
        </div>

        {cashMode === 'notes' ? (
          <>
            <div className="fdm-label">Notes</div>
            <div className="fdm-denoms">{NOTES.map(denomInput)}</div>
            <div className="fdm-label">Coins</div>
            <div className="fdm-denoms">{COINS.map(denomInput)}</div>
            <div className="fdm-cash-total">
              Cash counted <strong>{formatCurrency(notesTotal)}</strong>
            </div>
          </>
        ) : (
          <div className="modal-field" style={{ maxWidth: 260 }}>
            <label htmlFor="fdm-cash">Cash counted (LKR)</label>
            <input id="fdm-cash" type="number" min={0} step="0.01" placeholder="0.00" value={cashTotal} onChange={(e) => setCashTotal(e.target.value)} />
          </div>
        )}
      </div>

      <div className="fdm-card">
        <div className="fdm-card-title">2. Card and other payments</div>
        {otherMethods.length === 0 ? (
          <p className="pat-muted fdm-hint">
            No card, mobile or other non-cash payments were taken on this day.
          </p>
        ) : (
          <>
            <p className="pat-muted fdm-hint">
              Enter the total from each settlement slip or statement (for example the card machine&apos;s end-of-day print-out).
            </p>
            {otherMethods.map((m) => (
              <div className="modal-field" key={m.method} style={{ maxWidth: 260 }}>
                <label htmlFor={`fdm-m-${m.method}`}>{m.method} total (LKR)</label>
                <input
                  id={`fdm-m-${m.method}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={others[m.method] ?? ''}
                  onChange={(e) => setOthers((o) => ({ ...o, [m.method]: e.target.value }))}
                />
              </div>
            ))}
          </>
        )}
        {quietMethods.length > 0 && <p className="pat-muted fdm-small">Nothing was taken by {quietMethods.map((m) => m.method).join(', ')}.</p>}
      </div>

      <div className="fdm-card fdm-span">
        <div className="fdm-card-title">3. Check and close</div>
        <LinesTable lines={lines} openingFloat={float} notCounted={missing} />

        <div className="modal-field" style={{ marginTop: 16 }}>
          <label htmlFor="fdm-notes">Note {mismatch ? '(required — explain the difference)' : '(optional)'}</label>
          <textarea
            id="fdm-notes"
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={mismatch ? 'For example: gave LKR 100 change from the drawer for the canteen' : ''}
          />
        </div>

        {error && <div className="dash-error-banner">{error}</div>}

        <div className="fdm-submit-row">
          <div className="pat-muted">
            {missing.length > 0
              ? `Enter the counted amount for ${missing.join(', ')}.`
              : mismatch && !notes.trim()
                ? 'Add a note explaining the difference to close the day.'
                : 'Ready to close.'}
          </div>
          <button className="pat-btn primary" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? 'Closing…' : 'Close the day'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DayCloseScreen = ({ canReopen = false }: { canReopen?: boolean }) => {
  const [date, setDate] = useState(todayKey());
  const [showPayments, setShowPayments] = useState(false);
  const { data: view, loading, error, reload } = useApiData(() => getDayClose(date), [date]);
  const { data: history, reload: reloadHistory } = useApiData(() => listDayCloses(1, 10), []);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span className="fdm-title-icon">
              <CheckCircleIcon />
            </span>
            End-of-day cash count
          </h1>
          <p>Count the drawer and the card slips at closing, compare them with what was recorded today, and sign the day off.</p>
        </div>
        <div className="pat-header-actions">
          <div className="modal-field" style={{ margin: 0 }}>
            <label htmlFor="fdm-date">Day</label>
            <input id="fdm-date" type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <div className="dash-error-banner">{error}</div>}
      {loading && !view && <div className="pat-muted">Loading…</div>}

      {view && view.date === date && (
        <>
          <div className="fdm-kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">{view.isToday ? 'Taken today' : 'Taken this day'}</div>
              <div className="kpi-value">{formatCurrency(view.totals.received)}</div>
              <div className="fdm-kpi-sub">{view.paymentCount} payments</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Refunded</div>
              <div className="kpi-value">{formatCurrency(view.totals.refunded)}</div>
              <div className="fdm-kpi-sub">{view.refundCount} refunds</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Net recorded</div>
              <div className="kpi-value">{formatCurrency(view.totals.net)}</div>
              <div className="fdm-kpi-sub">{longDate(view.date)}</div>
            </div>
          </div>

          {view.close ? (
            <ClosedSummary
              close={view.close}
              changed={view.changedSinceClose}
              canReopen={canReopen}
              onReopened={() => {
                reload();
                reloadHistory();
              }}
            />
          ) : (
            <CountForm
              key={view.date}
              view={view}
              onClosed={() => {
                reload();
                reloadHistory();
              }}
            />
          )}

          {view.reopens.length > 0 && <ReopenHistory reopens={view.reopens} />}

          <div className="fdm-card">
            <button className="fdm-disclosure" aria-expanded={showPayments} onClick={() => setShowPayments((s) => !s)}>
              {showPayments ? '▾' : '▸'} Payments and refunds recorded on this day ({view.paymentCount + view.refundCount})
            </button>
            {showPayments && (
              <div className="pat-table-scroll">
                <table className="pat-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Invoice</th>
                      <th>Patient</th>
                      <th>Method</th>
                      <th className="fdm-num">Amount (LKR)</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.payments.length + view.refunds.length === 0 && (
                      <tr>
                        <td colSpan={6} className="pat-empty">
                          Nothing was recorded on this day.
                        </td>
                      </tr>
                    )}
                    {view.payments.map((p) => (
                      <tr key={`p${p.paymentId}`}>
                        <td>{new Date(p.receivedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</td>
                        <td>{invoiceCode(p.invoiceId, p.invoiceCreatedAt)}</td>
                        <td>{p.patientName}</td>
                        <td>{p.method}</td>
                        <td className="fdm-num">{money(p.amount)}</td>
                        <td>{p.receivedBy}</td>
                      </tr>
                    ))}
                    {view.refunds.map((r) => (
                      <tr key={`r${r.refundId}`}>
                        <td>{new Date(r.issuedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</td>
                        <td>INV #{r.invoiceId}</td>
                        <td className="pat-muted">Refund{r.reason ? ` — ${r.reason}` : ''}</td>
                        <td>{r.method}</td>
                        <td className="fdm-num fdm-owed">−{money(r.amount)}</td>
                        <td>{r.issuedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {history && history.data.length > 0 && (
        <div className="fdm-card">
          <div className="fdm-card-title">Recent closes</div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="fdm-num">Should have (LKR)</th>
                  <th className="fdm-num">Counted (LKR)</th>
                  <th>Difference</th>
                  <th>Closed by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((c) => (
                  <tr key={c.closeId}>
                    <td>{formatDate(`${c.date}T00:00:00`)}</td>
                    <td className="fdm-num">{money(c.expectedTotal)}</td>
                    <td className="fdm-num">{money(c.countedTotal)}</td>
                    <td>
                      <Difference value={c.varianceTotal} />
                    </td>
                    <td>{c.closedBy}</td>
                    <td>
                      {c.date !== date && (
                        <button className="pat-btn" onClick={() => setDate(c.date)}>
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayCloseScreen;
