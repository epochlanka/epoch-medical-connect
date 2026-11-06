import DayCloseScreen from './DayCloseScreen';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';

/** Reception: count and close the day. Reopening a closed day is left to an administrator. */
const DayClose = () => <DayCloseScreen />;

export default DayClose;
