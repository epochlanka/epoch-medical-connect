import { Navigate, Route, Routes } from 'react-router-dom';
import FrontDeskShell from './frontDesk/FrontDeskShell';
import { WORKSPACES, workspaceHome } from '../../app/workspaces';

import CheckIn from './pages/checkIn/CheckIn';
import Patients from './pages/patients/Patients';
import RegisterPatient from './pages/patients/RegisterPatient';
import DuplicateReview from './pages/patients/DuplicateReview';
import FamilyDirectory from './pages/families/FamilyDirectory';
import FamilyMemberRoster from './pages/families/FamilyMemberRoster';
import HeadOfFamily from './pages/families/HeadOfFamily';
import BookAppointment from './pages/appointments/BookAppointment';
import WalkInQueue from './pages/appointments/WalkInQueue';
import LiveQueueBoard from './pages/appointments/LiveQueueBoard';
import SkipRecallLog from './pages/appointments/SkipRecallLog';
import ConsolidatedInvoice from './pages/billing/ConsolidatedInvoice';
import Payments from './pages/billing/Payments';
import OutstandingBalances from './pages/billing/OutstandingBalances';
import DayClose from './pages/billing/DayClose';
import FrontDeskReports from './pages/reports/FrontDeskReports';
import LabTestOrders from './pages/labTestOrders/LabTestOrders';
import PatientProfile from '../../shared/patients/PatientProfile';

/** The reception workspace, mounted by the shell at /reception. */

const home = workspaceHome(WORKSPACES.reception);

const ReceptionWorkspace = () => (
  <FrontDeskShell desk="Reception">
    <Routes>
      <Route index element={<Navigate to={home} replace />} />
      <Route path="dashboard" element={<CheckIn />} />
      <Route path="patients/all" element={<Patients />} />
      <Route path="patients/register" element={<RegisterPatient />} />
      <Route path="patients/duplicates" element={<DuplicateReview />} />
      <Route path="patients/:patientId" element={<PatientProfile />} />
      <Route path="families/directory" element={<FamilyDirectory />} />
      <Route path="families/roster" element={<FamilyMemberRoster />} />
      <Route path="families/roster/:familyId" element={<FamilyMemberRoster />} />
      <Route path="families/head-of-family" element={<HeadOfFamily />} />
      <Route path="appointments/book" element={<BookAppointment />} />
      <Route path="appointments/walk-in" element={<WalkInQueue />} />
      <Route path="queue/live" element={<LiveQueueBoard />} />
      <Route path="queue/skip-recall" element={<SkipRecallLog />} />
      <Route path="billing/invoices" element={<ConsolidatedInvoice />} />
      <Route path="billing/payments" element={<Payments />} />
      <Route path="lab-tests/queue" element={<LabTestOrders />} />
      <Route path="billing/outstanding" element={<OutstandingBalances />} />
      <Route path="billing/reconciliation" element={<DayClose />} />
      <Route path="reports/operational" element={<FrontDeskReports />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </FrontDeskShell>
);

export default ReceptionWorkspace;
