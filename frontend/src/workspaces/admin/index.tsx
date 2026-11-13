import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { WORKSPACES, workspaceHome } from '../../app/workspaces';

import Dashboard from '../../pages/dashboard/Dashboard';
import Patients from '../../pages/patients/Patients';
import Families from '../../pages/families/Families';
import Appointments from '../../pages/appointments/Appointments';
import StockManagement from '../../pages/stock/StockManagement';
import PurchaseOrders from '../../pages/purchaseOrders/PurchaseOrders';
import Suppliers from '../../pages/suppliers/Suppliers';
import Invoices from '../../pages/invoices/Invoices';
import Reports from '../../pages/reports/Reports';
import UsersRoles from '../../pages/users/UsersRoles';
import Payments from '../../pages/payments/Payments';
import DayCloses from '../../pages/payments/DayCloses';
import Settings from '../../pages/settings/Settings';
import LabTestOrders from '../../pages/labTestOrders/LabTestOrders';
import QueueDashboard from '../../pages/QueueDashboard';
import BookAppointment from '../../pages/BookAppointment';
import LetterTemplates from '../../pages/letters/LetterTemplates';
import LetterTemplateEditor from '../../pages/letters/LetterTemplateEditor';
import PatientProfile from '../../shared/patients/PatientProfile';

/**
 * The administration workspace, mounted by the shell at /admin.
 *
 * Paths here are declared relative to that mount point, and pages navigate with
 * useWorkspaceNavigate / the workspace's own paths — nothing inside a workspace needs to know its
 * prefix. The shell loads this module lazily, so a receptionist never downloads it.
 */

const home = workspaceHome(WORKSPACES.admin);

// Admin used to have its own copy of the consultation and prescription pages. Those now live only in
// the clinical workspace (which admins can open); old links and bookmarks land on the equivalent page.
const clinical = WORKSPACES.doctor.base;
const ToClinicalVisit = () => {
  const { appointmentId = '' } = useParams();
  return <Navigate to={`${clinical}/consultations/workspace/${encodeURIComponent(appointmentId)}`} replace />;
};
const ToClinicalPrescription = () => {
  const { consultationId = '' } = useParams();
  return <Navigate to={`${clinical}/prescriptions/new/${encodeURIComponent(consultationId)}`} replace />;
};

const AdminWorkspace = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route index element={<Navigate to={home} replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="patients" element={<Patients />} />
      <Route path="patients/:patientId" element={<PatientProfile />} />
      <Route path="families" element={<Families />} />
      <Route path="appointments" element={<Appointments />} />
      <Route path="pharmacy" element={<Navigate to="../inventory/stock" replace />} />
      <Route path="inventory/medicines" element={<Navigate to="../stock" relative="path" replace />} />
      <Route path="inventory/stock" element={<StockManagement />} />
      <Route path="inventory/purchase-orders" element={<PurchaseOrders />} />
      <Route path="suppliers" element={<Suppliers />} />
      <Route path="billing/invoices" element={<Invoices />} />
      <Route path="billing/payments" element={<Payments />} />
      <Route path="billing/day-close" element={<DayCloses />} />
      <Route path="reports" element={<Reports />} />
      <Route path="users" element={<UsersRoles />} />
      <Route path="settings" element={<Settings />} />
      <Route path="consultations" element={<Navigate to={`${clinical}/queue/live`} replace />} />
      <Route path="consultations/:appointmentId" element={<ToClinicalVisit />} />
      <Route path="prescriptions" element={<Navigate to={`${clinical}/prescriptions/my`} replace />} />
      <Route path="prescriptions/new/:consultationId" element={<ToClinicalPrescription />} />
      <Route path="prescriptions/:prescriptionId" element={<Navigate to={`${clinical}/prescriptions/my`} replace />} />
      <Route path="lab-test-orders" element={<LabTestOrders />} />
      <Route path="queue" element={<QueueDashboard />} />
      <Route path="book-appointment" element={<BookAppointment />} />
      <Route path="letter-templates" element={<LetterTemplates />} />
      <Route path="letter-templates/new" element={<LetterTemplateEditor />} />
      <Route path="letter-templates/:templateId" element={<LetterTemplateEditor />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Route>
  </Routes>
);

export default AdminWorkspace;
