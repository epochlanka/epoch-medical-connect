import { useEffect, useState } from 'react';
import { getAiStatus, getPatientSummary } from '../lib/ai';
import type { PatientSummaryResult } from '../lib/ai';
import './aiSummary.css';

// AI pre-consultation summary (Pro). Shows nothing at all unless the clinic has AI switched on.
// Nothing is sent until the doctor presses the button, and the result is labelled as a draft to
// check against the record: it is never saved into the consultation.

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const AiSummaryPanel = ({ patientId }: { patientId: string }) => {
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState<PatientSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let live = true;
    getAiStatus()
      .then((s) => live && setEnabled(s.enabled))
      .catch(() => live && setEnabled(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [patientId]);

  if (!enabled) return null;

  const run = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await getPatientSummary(patientId, refresh));
      setCollapsed(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The summary could not be written. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const s = result?.summary;

  return (
    <section className="card ai-sum" aria-label="AI summary of the patient record">
      <div className="ai-sum-head">
        <div>
          <h3 className="card-title">
            AI summary <span className="ai-sum-tag">Draft · check against the record</span>
          </h3>
          {result && (
            <p className="ai-sum-meta">
              From {result.basedOn.visits} visit{result.basedOn.visits === 1 ? '' : 's'} and {result.basedOn.labTests} lab test{result.basedOn.labTests === 1 ? '' : 's'} · written {formatWhen(result.generatedAt)}
            </p>
          )}
        </div>
        <div className="ai-sum-actions">
          {result && (
            <button type="button" className="card-link" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? 'Show' : 'Hide'}
            </button>
          )}
          <button type="button" className="ai-sum-btn" disabled={loading} onClick={() => run(!!result)}>
            {loading ? 'Reading the record…' : result ? 'Write again' : 'Summarise record'}
          </button>
        </div>
      </div>

      {!result && !loading && !error && (
        <p className="ai-sum-hint">A short digest of past visits, medicines, allergies and lab results. The record is sent to Anthropic without the patient’s name, NIC, phone or birth date.</p>
      )}
      {error && <div className="ai-sum-error" role="alert">{error}</div>}

      {s && !collapsed && (
        <div className="ai-sum-body">
          <p className="ai-sum-overview">{s.overview}</p>

          {s.allergies.length > 0 && (
            <div className="ai-sum-allergy">
              <strong>Allergies:</strong> {s.allergies.join(', ')}
            </div>
          )}

          {s.pointsToCheck.length > 0 && (
            <div className="ai-sum-block ai-sum-check">
              <h4>Worth checking today</h4>
              <ul>
                {s.pointsToCheck.map((p, i) => (
                  <li key={i}>
                    <strong>{p.point}</strong> — {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ai-sum-grid">
            {s.activeProblems.length > 0 && (
              <div className="ai-sum-block">
                <h4>Active problems</h4>
                <ul>
                  {s.activeProblems.map((p, i) => (
                    <li key={i}>
                      <strong>{p.problem}</strong>
                      {p.since && <span className="ai-sum-date"> since {p.since}</span>}
                      <div className="ai-sum-sub">{p.basis}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.currentMedications.length > 0 && (
              <div className="ai-sum-block">
                <h4>Current medicines</h4>
                <ul>
                  {s.currentMedications.map((m, i) => (
                    <li key={i}>
                      <strong>{m.name}</strong>
                      <div className="ai-sum-sub">{m.details}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.recentVisits.length > 0 && (
              <div className="ai-sum-block">
                <h4>Recent visits</h4>
                <ul>
                  {s.recentVisits.map((v, i) => (
                    <li key={i}>
                      <span className="ai-sum-date">{v.date}</span> {v.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.labHighlights.length > 0 && (
              <div className="ai-sum-block">
                <h4>Lab results</h4>
                <ul>
                  {s.labHighlights.map((l, i) => (
                    <li key={i}>
                      <span className="ai-sum-date">{l.date}</span> <strong>{l.test}</strong>: {l.finding}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default AiSummaryPanel;
