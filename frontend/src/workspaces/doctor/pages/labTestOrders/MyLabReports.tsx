import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { listLabTestOrders, printLabTestOrder, printLabResultReport, markReportReceived } from '../../lib/labTestOrders';
import type { LabTestOrder, LabTestOrderStatus } from '../../lib/labTestOrders';
import MarkReceivedModal from './MarkReceivedModal';
import LabResultModal from './LabResultModal';
import { SearchIcon, PrintIcon, ClipboardIcon } from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../patients/patients.css';
import './labTestOrders.css';

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_OPTIONS: LabTestOrderStatus[] = ['Pending', 'Report Received', 'Completed', 'Cancelled'];
const LAB_STATUS_BADGE: Record<LabTestOrderStatus, string> = {
  Pending: 'badge-blue',
  'Report Received': 'badge-amber',
  Completed: 'badge-green',
  Cancelled: 'badge-red',
};

// "Patient Search → Lab Results" spec section 24, but scoped to every patient rather than one —
// the destination for the Dashboard's "Pending Lab Reports" widget, and the doctor's own worklist.
const MyLabReports = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<LabTestOrderStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [receiveOrder, setReceiveOrder] = useState<LabTestOrder | null>(null);
  const [resultOrderId, setResultOrderId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(
    () => ({ doctorId: user?.id, status: (status || undefined) as LabTestOrderStatus | undefined, search: search || undefined, limit: 100 }),
    [user?.id, status, search]
  );
  const { data: result, loading, reload } = useApiData(() => listLabTestOrders(params), [params]);
  const [actionError, setActionError] = useState<string | null>(null);
  // One click from a waiting test to its results table: records the report as back if it is not yet.
  const enterResults = async (o: LabTestOrder) => {
    setActionError(null);
    try {
      if (o.status === 'Pending') {
        await markReportReceived(o.lab_test_order_id);
        reload();
      }
      setResultOrderId(o.lab_test_order_id);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Could not open the results. Try again.');
    }
  };
  const orders = result?.data ?? [];

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Lab Tests &amp; Results</h1>
          <p>Every lab test you have ordered, for all patients. Press <strong>Enter results</strong> on a test to fill in its values. To order a test, open the patient's visit and use <strong>Order lab tests</strong>.</p>
        </div>
      </div>
      {actionError && <div className="dash-error-banner" role="alert">{actionError}</div>}

      <div className="pat-filter-bar" style={{ marginBottom: 16 }}>
        <div className="pat-search" style={{ maxWidth: 320 }}>
          <SearchIcon />
          <input placeholder="Search patient, request no., test…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <select className="pat-select" value={status} onChange={(e) => setStatus(e.target.value as LabTestOrderStatus | '')}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Patient</th>
                <th>Test</th>
                <th>Ordered</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="pat-empty">
                    No lab requests match these filters.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.lab_test_order_id}>
                  <td>{o.request_number}</td>
                  <td>
                    <button className="pat-id-link" onClick={() => navigate(`/patients/${o.patient_id}`)}>
                      {o.patient?.full_name}
                    </button>
                  </td>
                  <td>
                    {o.test_name}
                    {o.priority !== 'Routine' && <span className="badge badge-red" style={{ marginLeft: 6 }}>{o.priority}</span>}
                  </td>
                  <td>{formatDateTime(o.order_date)}</td>
                  <td>
                    <span className={`badge ${LAB_STATUS_BADGE[o.status]}`}>{o.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 230 }}>
                      <button className="pat-btn" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => printLabTestOrder(o.lab_test_order_id)}>
                        <PrintIcon /> Request
                      </button>
                      {(o.status === 'Pending' || o.status === 'Report Received') && (
                        <button className="pat-btn primary" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => void enterResults(o)}>
                          <ClipboardIcon /> Enter results
                        </button>
                      )}
                      {o.status === 'Pending' && (
                        <button className="pat-btn" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => setReceiveOrder(o)} title="Mark the report as back and attach the scanned report">
                          Attach report
                        </button>
                      )}
                      {o.status === 'Completed' && (
                        <>
                          <button className="pat-btn" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => setResultOrderId(o.lab_test_order_id)}>
                            View
                          </button>
                          <button className="pat-btn" style={{ fontSize: 13, padding: '4px 8px' }} onClick={() => printLabResultReport(o.lab_test_order_id)}>
                            <PrintIcon /> Result
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {receiveOrder && (
        <MarkReceivedModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onSaved={() => {
            setReceiveOrder(null);
            reload();
          }}
        />
      )}
      {resultOrderId && (
        <LabResultModal
          orderId={resultOrderId}
          onClose={() => setResultOrderId(null)}
          onSaved={() => {
            setResultOrderId(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default MyLabReports;
