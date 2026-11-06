import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { searchLabTestCatalog, createLabTestOrder } from '../../lib/labTestOrders';
import type { LabTestCatalogEntry, LabTestOrderPriority } from '../../lib/labTestOrders';
import { SearchIcon, XIcon, SendIcon, PlusIcon } from '../../components/layout/Icons';
import './labTestOrders.css';

const PRIORITY_OPTIONS: LabTestOrderPriority[] = ['Routine', 'Urgent', 'STAT'];

/** A test chosen for this order: from the catalogue, or typed in when the catalogue lacks it. */
interface ChosenTest {
  key: string;
  name: string;
  catalog: LabTestCatalogEntry | null;
}

const fromCatalog = (t: LabTestCatalogEntry): ChosenTest => ({ key: `c${t.test_id}`, name: t.test_name, catalog: t });
const typedIn = (name: string): ChosenTest => ({ key: `t${name.toLowerCase()}`, name, catalog: null });

interface AddLabTestModalProps {
  consultationId: number;
  onClose: () => void;
  onAdded: (count: number) => void;
  /** Names of tests already ordered in this consultation, flagged so they are not ordered twice. */
  alreadyOrdered?: string[];
}

/**
 * Ordering investigations: search the catalogue (by name, abbreviation or everyday words such as
 * "sugar" or "kidney"), tick as many as needed, or order something the catalogue does not have
 * exactly as typed. Enter adds the top match, so "fbc ⏎ ufr ⏎ crp ⏎" orders three tests without
 * the mouse.
 */
const AddLabTestModal = ({ consultationId, onClose, onAdded, alreadyOrdered = [] }: AddLabTestModalProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<LabTestCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<ChosenTest[]>([]);
  const [priority, setPriority] = useState<LabTestOrderPriority>('Routine');
  const [clinicalNote, setClinicalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const term = searchTerm.trim();

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      searchLabTestCatalog(term || undefined)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [term]);

  const ordered = useMemo(() => new Set(alreadyOrdered.map((n) => n.toLowerCase())), [alreadyOrdered]);
  const isChosen = (key: string) => chosen.some((c) => c.key === key);
  const exactInResults = results.some((r) => r.test_name.toLowerCase() === term.toLowerCase() || r.abbreviation?.toLowerCase() === term.toLowerCase());
  const canTypeIn = term.length >= 2 && !loading && !exactInResults;

  const toggle = (test: ChosenTest) => setChosen((prev) => (prev.some((c) => c.key === test.key) ? prev.filter((c) => c.key !== test.key) : [...prev, test]));

  // Enter takes the top match (or the typed name when nothing matches) and clears the box for the next test.
  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const top = results[0];
    if (top && term) {
      if (!isChosen(`c${top.test_id}`)) toggle(fromCatalog(top));
    } else if (canTypeIn) {
      if (!isChosen(typedIn(term).key)) toggle(typedIn(term));
    } else {
      return;
    }
    setSearchTerm('');
  };

  const submit = async () => {
    if (chosen.length === 0) {
      setError('Choose at least one investigation.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await Promise.all(
        chosen.map((test) =>
          createLabTestOrder({
            consultation_id: consultationId,
            ...(test.catalog ? { catalog_test_id: test.catalog.test_id } : { test_name: test.name }),
            priority,
            additional_notes: clinicalNote.trim() || undefined,
          })
        )
      );
      onAdded(chosen.length);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not order the investigation(s).');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card lab-add-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="lab-add-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title" id="lab-add-title">
              Order lab tests
            </h2>
            <p className="lab-add-hint">Search by name, abbreviation or plain words like “sugar” or “kidney”. Press Enter to add the top match.</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="lab-search-box">
          <SearchIcon />
          <input
            ref={searchRef}
            autoFocus
            placeholder="e.g. FBC, blood sugar, thyroid, dengue, chest x-ray…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={onSearchKeyDown}
            aria-label="Search investigations"
          />
        </div>

        {chosen.length > 0 && (
          <div className="lab-chosen" aria-label="Chosen investigations">
            {chosen.map((c) => (
              <span className="lab-chip" key={c.key}>
                {c.catalog?.abbreviation && c.catalog.abbreviation !== c.name ? <strong>{c.catalog.abbreviation}</strong> : null}
                {c.name}
                {!c.catalog && <em>not in catalogue</em>}
                <button type="button" onClick={() => toggle(c)} aria-label={`Remove ${c.name}`}>
                  <XIcon />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="lab-list-label">{term ? 'Matching investigations' : 'Commonly ordered'}</div>
        <div className="lab-test-checklist">
          {loading && results.length === 0 && <div className="lab-empty">Searching…</div>}
          {!loading && results.length === 0 && !canTypeIn && <div className="lab-empty">No matching investigations.</div>}
          {results.map((t) => {
            const already = ordered.has(t.test_name.toLowerCase());
            return (
              <label className={`lab-test-check-row${isChosen(`c${t.test_id}`) ? ' chosen' : ''}`} key={t.test_id}>
                <input type="checkbox" checked={isChosen(`c${t.test_id}`)} onChange={() => toggle(fromCatalog(t))} />
                {t.abbreviation && <span className="lab-abbr">{t.abbreviation}</span>}
                <span className="lab-test-check-name">{t.test_name}</span>
                {already && <span className="lab-already">Already ordered</span>}
                {t.category && <span className="lab-cat">{t.category}</span>}
              </label>
            );
          })}
          {canTypeIn && (
            <button type="button" className="lab-typein" onClick={() => !isChosen(typedIn(term).key) && toggle(typedIn(term))}>
              <PlusIcon /> Order “{term}” as written <span>(not in the catalogue)</span>
            </button>
          )}
        </div>

        <div className="lab-add-row">
          <div className="modal-field" style={{ margin: 0 }}>
            <label>Priority</label>
            <div className="lab-priority" role="group" aria-label="Priority">
              {PRIORITY_OPTIONS.map((p) => (
                <button key={p} type="button" className={`${p.toLowerCase()}${priority === p ? ' on' : ''}`} aria-pressed={priority === p} onClick={() => setPriority(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-field" style={{ margin: 0, flex: 1 }}>
            <label>Clinical note (optional)</label>
            <input value={clinicalNote} onChange={(e) => setClinicalNote(e.target.value)} placeholder="e.g. ?Dengue, day 3 of fever" />
          </div>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting || chosen.length === 0} onClick={submit}>
            <SendIcon /> {submitting ? 'Ordering…' : chosen.length === 0 ? 'Order tests' : `Order ${chosen.length} test${chosen.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLabTestModal;
