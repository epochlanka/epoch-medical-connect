import { useEffect, useState } from 'react';
import { getLabTestOrder, getLabTestCatalogParameters, completeLabResult, amendLabResult, saveLabResults } from '../../lib/labTestOrders';
import type { LabTestOrder, ResultParameterInput } from '../../lib/labTestOrders';
import { XIcon, CheckCircleIcon, PlusIcon, TrashIcon } from '../../components/layout/Icons';
import './labTestOrders.css';

interface ResultRow extends ResultParameterInput {
  key: string;
}

const emptyRow = (): ResultRow => ({ key: `${Date.now()}-${Math.random()}`, parameter_name: '', unit: '', reference_range: '', result_value: '' });

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// The doctor's one screen for "Manual Laboratory Result Entry" + "Doctor Review / Interpretation"
// + "Save & Complete" (spec sections 13-19) — reachable only once an order's report has been
// received, or (to amend) once it's already Completed. Takes just the order id and re-fetches
// the full detail (with results) itself — list views this opens from don't always include the
// per-parameter results array, so trusting a passed-in summary object risks stale/missing rows.
//
// mode "entry" is the front desk's version (also used from the reception workspace): the same
// results table, but no notes or interpretation, and saving leaves the test "Report Received" for
// the doctor to review and complete. Values already typed in (by the front desk) come pre-filled.
const LabResultModal = ({ orderId, onClose, onSaved, mode = 'review' }: { orderId: number; onClose: () => void; onSaved: () => void; mode?: 'review' | 'entry' }) => {
  const [order, setOrder] = useState<LabTestOrder | null>(null);
  const [saveParameters, setSaveParameters] = useState(true);
  const [rows, setRows] = useState<ResultRow[]>([emptyRow()]);
  const [doctorNotes, setDoctorNotes] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [loadingParams, setLoadingParams] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLabTestOrder(orderId).then((full) => {
      setOrder(full);
      setDoctorNotes(full.review_notes ?? '');
      setInterpretation(full.interpretation ?? '');

      // Values already saved (by the front desk, or when amending) first, then any of the test's
      // usual parameters not filled in yet.
      const saved: ResultRow[] = (full.results ?? []).map((r) => ({
        key: String(r.result_id),
        parameter_id: r.parameter_id ?? undefined,
        parameter_name: r.parameter_name,
        unit: r.unit ?? '',
        reference_range: r.reference_range ?? '',
        result_value: r.result_value,
      }));
      const withUsual = (params: { parameter_id: number; parameter_name: string; unit: string | null; reference_range: string | null }[]) => {
        const have = new Set(saved.map((r) => r.parameter_id).filter(Boolean));
        const usual = params
          .filter((p) => !have.has(p.parameter_id))
          .map((p) => ({ key: String(p.parameter_id), parameter_id: p.parameter_id, parameter_name: p.parameter_name, unit: p.unit ?? '', reference_range: p.reference_range ?? '', result_value: '' }));
        const all = [...saved, ...usual];
        setRows(all.length > 0 ? all : [emptyRow()]);
      };
      if (full.catalog_test_id && full.status !== 'Completed') {
        getLabTestCatalogParameters(full.catalog_test_id)
          .then(withUsual)
          .catch(() => withUsual([]))
          .finally(() => setLoadingParams(false));
      } else {
        withUsual([]);
        setLoadingParams(false);
      }
    });
  }, [orderId]);

  const isAmending = order?.status === 'Completed';
  const entryOnly = mode === 'entry';
  // Parameters typed in by hand that the test's usual list does not have yet.
  const newParameters = rows.filter((r) => !r.parameter_id && r.parameter_name.trim() && r.result_value.trim());

  const updateRow = (key: string, field: keyof ResultRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: e.target.value } : r)));

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const submit = async () => {
    if (!order) return;
    const values = rows.filter((r) => r.parameter_name.trim() && r.result_value.trim());
    if (values.length === 0) {
      setError(entryOnly ? 'Enter at least one result value before saving.' : 'Enter at least one result value before completing.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        results: values.map((r) => ({ parameter_id: r.parameter_id, parameter_name: r.parameter_name.trim(), unit: r.unit || undefined, reference_range: r.reference_range || undefined, result_value: r.result_value.trim() })),
        doctor_notes: doctorNotes.trim() || undefined,
        interpretation: interpretation.trim() || undefined,
        save_parameters: newParameters.length > 0 && saveParameters ? true : undefined,
      };
      if (entryOnly) await saveLabResults(order.lab_test_order_id, { results: input.results, save_parameters: input.save_parameters });
      else if (isAmending) await amendLabResult(order.lab_test_order_id, input);
      else await completeLabResult(order.lab_test_order_id, input);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save the result.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card lab-result-modal" onClick={(e) => e.stopPropagation()}>
          <div className="lab-empty">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card lab-result-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">{order.test_name}</h2>
            <p className="modal-subtitle">
              {order.request_number} · Patient: {order.patient?.full_name}
            </p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="lab-result-meta">
          <span>Requested: {formatDateTime(order.order_date)}</span>
          {order.report_received_at && <span>Report Received: {formatDateTime(order.report_received_at)}</span>}
          {order.completed_at && <span>Reviewed: {formatDateTime(order.completed_at)}</span>}
        </div>

        <div className="modal-field">
          <label>Results from the lab report</label>
          {entryOnly && <p className="lab-entry-hint">Type in the values from the report. The doctor will review them and complete the test.</p>}
          {loadingParams ? (
            <div className="lab-empty">Loading parameters…</div>
          ) : (
            <table className="lab-result-table">
              <thead>
                <tr>
                  <th>Test Parameter</th>
                  <th>Result</th>
                  <th>Unit</th>
                  <th>Reference Range</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <input className="lab-cell-input" value={r.parameter_name} onChange={updateRow(r.key, 'parameter_name')} placeholder="e.g. Haemoglobin" disabled={!!r.parameter_id} />
                    </td>
                    <td>
                      <input className="lab-cell-input" value={r.result_value} onChange={updateRow(r.key, 'result_value')} placeholder="Value" />
                    </td>
                    <td>
                      <input className="lab-cell-input" value={r.unit} onChange={updateRow(r.key, 'unit')} placeholder="Unit" disabled={!!r.parameter_id} />
                    </td>
                    <td>
                      <input className="lab-cell-input" value={r.reference_range} onChange={updateRow(r.key, 'reference_range')} placeholder="e.g. 13-17" disabled={!!r.parameter_id} />
                    </td>
                    <td>
                      <button type="button" className="pat-icon-btn" onClick={() => removeRow(r.key)} aria-label="Remove parameter">
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="pat-btn" style={{ fontSize: 13, padding: '6px 10px', marginTop: 8 }} onClick={addRow}>
            <PlusIcon /> Add Parameter
          </button>
          {newParameters.length > 0 && (
            <label className="lab-save-params">
              <input type="checkbox" checked={saveParameters} onChange={(e) => setSaveParameters(e.target.checked)} />
              <span>
                Save {newParameters.length === 1 ? `“${newParameters[0].parameter_name.trim()}”` : `these ${newParameters.length} parameters`} for “{order.test_name}”, so they come up next time
              </span>
            </label>
          )}
        </div>

        {!entryOnly && (
          <>
            <div className="modal-field">
              <label>Doctor Notes</label>
              <textarea rows={2} value={doctorNotes} onChange={(e) => setDoctorNotes(e.target.value)} placeholder="Clinical notes about this result" />
            </div>
            <div className="modal-field">
              <label>Interpretation</label>
              <textarea rows={2} value={interpretation} onChange={(e) => setInterpretation(e.target.value)} placeholder="Clinical interpretation" />
            </div>
          </>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting} onClick={submit}>
            <CheckCircleIcon /> {submitting ? 'Saving…' : entryOnly ? 'Save results' : isAmending ? 'Save Changes' : 'Save & Complete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabResultModal;
