import { useMemo, useState } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients } from '../../lib/patients';
import { calculateAge } from '../../lib/queue';
import {
  SearchIcon,
  RefreshIcon,
  DownloadIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../consultations/consultation.css';
import '../labTestOrders/labTestOrders.css';
import './patients.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });


const PatientSearch = () => {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [gender, setGender] = useState('');
  const [ageFrom, setAgeFrom] = useState('');
  const [ageTo, setAgeTo] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const limit = 10;

  const { data: result, loading, error } = useApiData(
    () =>
      listPatients({
        search: appliedSearch || undefined,
        status,
        gender: gender || undefined,
        ageFrom: ageFrom ? Number(ageFrom) : undefined,
        ageTo: ageTo ? Number(ageTo) : undefined,
        page,
        limit,
      }),
    [appliedSearch, status, gender, ageFrom, ageTo, page]
  );

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  const applyFilters = () => {
    setAppliedSearch(search);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setGender('');
    setAgeFrom('');
    setAgeTo('');
    setStatus('active');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await listPatients({
        search: appliedSearch || undefined,
        status,
        gender: gender || undefined,
        ageFrom: ageFrom ? Number(ageFrom) : undefined,
        ageTo: ageTo ? Number(ageTo) : undefined,
        limit: 500,
      });
      const header = ['Patient', 'MRN', 'Gender', 'Age', 'Phone', 'Last Visit'];
      const lines = full.data.map((p) =>
        [p.full_name, p.patient_id, p.gender, String(calculateAge(p.dob)), p.phone ?? '', p.last_visit ? formatDate(p.last_visit) : '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      const csv = [header.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page: p, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, p, p - 1, p + 1]);
    return Array.from(pages)
      .filter((x) => x >= 1 && x <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  // Each patient opens on the shared profile page, the same one reception and pharmacy use.
  const selectPatient = (id: string) => {
    navigate(`/patients/${encodeURIComponent(id)}`);
  };

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Patient Search</h1>
          <p>Search and view patient basic information.</p>
        </div>
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search" style={{ flex: 1 }}>
          <SearchIcon />
          <input
                placeholder="Search by name, MRN, phone or NIC…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </div>
            <button className="pat-btn" onClick={clearFilters}>
              <RefreshIcon /> Clear
            </button>
            <button className="pat-btn primary" onClick={applyFilters}>
              Search
            </button>
          </div>

          <div className="pat-filter-bar">
            <select className="pat-select" value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}>
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <div className="q-filter-field">
              <span className="q-filter-label">Age From</span>
              <input type="number" min={0} className="q-filter-input" style={{ width: 70 }} value={ageFrom} onChange={(e) => { setAgeFrom(e.target.value); setPage(1); }} placeholder="Any" />
            </div>
            <div className="q-filter-field">
              <span className="q-filter-label">Age To</span>
              <input type="number" min={0} className="q-filter-input" style={{ width: 70 }} value={ageTo} onChange={(e) => { setAgeTo(e.target.value); setPage(1); }} placeholder="Any" />
            </div>
            <select className="pat-select" value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All Statuses</option>
            </select>
            <button className="pat-btn" style={{ marginLeft: 'auto' }} disabled={exporting || rows.length === 0} onClick={handleExport}>
              <DownloadIcon /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>

          {error && <div className="dash-error-banner">Couldn't load patients: {error}</div>}

          <div className="pat-table-card">
            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Gender / Age</th>
                    <th>Phone</th>
                    <th>Last Visit</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={7} className="pat-muted">
                          Loading…
                        </td>
                      </tr>
                    ))}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="pat-empty">No patients match this filter.</div>
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((p, i) => {
                      return (
                        <tr key={p.patient_id} onClick={() => selectPatient(p.patient_id)} className="pat-clickable-row">
                          <td className="pat-muted">{((pagination?.page ?? 1) - 1) * limit + i + 1}</td>
                          <td>
                            <div className="pat-name-cell">
                              {p.photo_url ? <img className="pat-avatar" src={fileUrl(p.photo_url)} alt="" /> : <div className="pat-avatar">{initials(p.full_name)}</div>}
                              <div className="pat-name">{p.full_name}</div>
                            </div>
                          </td>
                          <td className="pat-muted">{p.patient_id}</td>
                          <td>
                            <span className={`q-gender-dot ${p.gender === 'Female' ? 'female' : 'male'}`} />
                            {p.gender} / {calculateAge(p.dob)} Y
                          </td>
                          <td className="pat-muted">{p.phone || '—'}</td>
                          <td className="pat-muted">{p.last_visit ? formatDate(p.last_visit) : 'Never'}</td>
                          <td>
                            <button className="pat-icon-btn" title="Open patient profile" onClick={(e) => { e.stopPropagation(); selectPatient(p.patient_id); }}>
                              <EyeIcon />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.total > 0 && (
              <div className="pat-pagination">
                <div className="pat-pagination-info">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} patients
                </div>
                <div className="pat-pagination-pages">
                  <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>
                    <ChevronLeftIcon />
                  </button>
                  {pageNumbers.map((p, i) => {
                    const prev = pageNumbers[i - 1];
                    const showEllipsis = prev !== undefined && p - prev > 1;
                    return (
                      <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                        <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => setPage(p)}>
                          {p}
                        </button>
                      </span>
                    );
                  })}
                  <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>
                    <ChevronRightIcon />
                  </button>
                </div>
          </div>
        )}
      </div>
    </div>
  );
};


export default PatientSearch;
