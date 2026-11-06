import type { ComponentType } from 'react';
import {
  DashboardIcon,
  PatientsIcon,
  UserPlusIcon,
  AlertIcon,
  FamiliesIcon,
  UsersIcon,
  StarIcon,
  CalendarIcon,
  ClockIcon,
  RefreshIcon,
  InvoiceIcon,
  PaymentIcon,
  CheckCircleIcon,
  ReportsIcon,
  ClipboardIcon,
} from './Icons';

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType;
  implemented?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// Covers docs/srs/receptionist.md Section 3 (Sidebar / Menu — Receptionist View).
// Wording is deliberately plain and task-first rather than the SRS's system nouns, matching the
// pharmacy side of the front desk; the `path` of each item is the stable link back to the SRS.
export const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Check in', path: '/dashboard', icon: DashboardIcon, implemented: true }],
  },
  {
    label: 'Patients',
    items: [
      { label: 'Find a patient', path: '/patients/all', icon: PatientsIcon, implemented: true },
      { label: 'Register a patient', path: '/patients/register', icon: UserPlusIcon, implemented: true },
      { label: 'Possible duplicates', path: '/patients/duplicates', icon: AlertIcon, implemented: true },
    ],
  },
  {
    label: 'Families',
    items: [
      { label: 'All families', path: '/families/directory', icon: FamiliesIcon, implemented: true },
      { label: 'Family members', path: '/families/roster', icon: UsersIcon, implemented: true },
      { label: 'Head of family', path: '/families/head-of-family', icon: StarIcon, implemented: true },
    ],
  },
  {
    label: "Today's visits",
    items: [
      { label: "Today's patient flow", path: '/queue/live', icon: ClockIcon, implemented: true },
      { label: 'Book an appointment', path: '/appointments/book', icon: CalendarIcon, implemented: true },
      { label: 'Add a walk-in', path: '/appointments/walk-in', icon: UserPlusIcon, implemented: true },
      { label: 'Skipped & recalled', path: '/queue/skip-recall', icon: RefreshIcon, implemented: true },
    ],
  },
  {
    label: 'Lab tests',
    items: [{ label: 'Lab test orders', path: '/lab-tests/queue', icon: ClipboardIcon, implemented: true }],
  },
  {
    label: 'Billing',
    items: [
      { label: 'Invoices', path: '/billing/invoices', icon: InvoiceIcon, implemented: true },
      { label: 'Payments', path: '/billing/payments', icon: PaymentIcon, implemented: true },
      { label: 'Unpaid balances', path: '/billing/outstanding', icon: AlertIcon, implemented: true },
      { label: 'End-of-day cash count', path: '/billing/reconciliation', icon: CheckCircleIcon, implemented: true },
    ],
  },
  {
    label: 'Reports',
    items: [{ label: 'Front desk reports', path: '/reports/operational', icon: ReportsIcon, implemented: true }],
  },
];

export const findNavLabel = (path: string): string => {
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Receptionist Portal';
};
