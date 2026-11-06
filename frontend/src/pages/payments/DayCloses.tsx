import DayCloseScreen from '../../workspaces/reception/pages/billing/DayCloseScreen';
import { FeedbackProvider } from '../../shared/ui/feedback';
import '../patients/patients.css';
import '../dashboard/dashboard.css';

/**
 * Admin: the same end-of-day count the front desk uses, plus reopening a closed day for a recount.
 * The screen brings no workspace stylesheet of its own (see DayCloseScreen), so the admin styles
 * are loaded here; its confirm dialogs and toasts need the feedback provider, which the admin
 * layout does not otherwise mount.
 */
const DayCloses = () => (
  <FeedbackProvider>
    <DayCloseScreen canReopen />
  </FeedbackProvider>
);

export default DayCloses;
