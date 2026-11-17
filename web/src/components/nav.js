import {
  IconLayoutDashboard, IconUsers, IconCalendar, IconMap, IconGift, IconLeave, IconClock, IconTimer,
  IconSparkles, IconMapPin, IconChart, IconChat, IconCheckCircle, IconMegaphone, IconLifebuoy,
  IconFolder, IconBox, IconDoorExit, IconLock, IconUserPlus, IconRadio, IconInbox, IconEye,
} from './icons';

// Sidebar entries. `perm` = the admin area needed (see backend lib/permissions.js;
// 'admin' = the Admin role only). `who: 'manager'` = reporting managers,
// `who: 'all'` = everyone who can open the console. `group` draws a heading.
export const NAV = [
  { to: '/my-team', label: 'My Team', icon: IconUsers, who: 'manager', group: 'My team' },
  { to: '/team-approvals', label: 'Team Approvals', icon: IconCheckCircle, who: 'manager' },

  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, end: true, perm: 'attendance', group: 'People' },
  { to: '/users', label: 'User Management', icon: IconUsers, perm: 'users' },
  { to: '/recruitment', label: 'Recruitment', icon: IconUserPlus, perm: 'recruitment' },
  { to: '/documents', label: 'Documents & Letters', icon: IconFolder, perm: 'documents' },
  { to: '/training', label: 'Training', icon: IconSparkles, perm: 'training' },
  { to: '/exits', label: 'Exits', icon: IconDoorExit, perm: 'exits' },

  { to: '/attendance', label: 'Team Attendance', icon: IconCalendar, perm: 'attendance', group: 'Time' },
  { to: '/shifts', label: 'Shifts & Week-offs', icon: IconTimer, perm: 'shifts' },
  { to: '/biometric', label: 'Biometric Devices', icon: IconRadio, perm: 'attendance' },
  { to: '/trail', label: 'Team Trail', icon: IconMap, perm: 'location' },
  { to: '/holidays', label: 'Holidays', icon: IconGift, perm: 'holidays' },
  { to: '/sites', label: 'Customer Sites', icon: IconMapPin, perm: 'sites' },

  { to: '/leaves', label: 'Leave Management', icon: IconLeave, perm: 'leave', group: 'Requests' },
  { to: '/overtime', label: 'Overtime', icon: IconClock, perm: 'overtime' },
  { to: '/compoff', label: 'Comp-Off', icon: IconSparkles, perm: 'compoff' },
  { to: '/expenses', label: 'Expenses', icon: IconChart, perm: 'expenses' },
  { to: '/helpdesk', label: 'HR Helpdesk', icon: IconLifebuoy, perm: 'helpdesk' },

  { to: '/payroll', label: 'Payroll', icon: IconChart, perm: 'payroll', group: 'Money & compliance' },
  { to: '/compliance', label: 'Compliance Calendar', icon: IconInbox, perm: 'compliance' },
  { to: '/reports', label: 'Reports', icon: IconChart, perm: 'reports' },

  { to: '/announcements', label: 'Announcements', icon: IconMegaphone, perm: 'announcements', group: 'Company' },
  { to: '/assets', label: 'Assets', icon: IconBox, perm: 'assets' },
  { to: '/branches', label: 'Branches', icon: IconMapPin, perm: 'branches' },
  { to: '/roles', label: 'Roles & Permissions', icon: IconLock, perm: 'admin' },
  { to: '/audit', label: 'Audit Log', icon: IconEye, perm: 'audit' },
  { to: '/chat', label: 'Team Chat', icon: IconChat, who: 'all' },
];

export const navFor = ({ can, isManager }) => NAV.filter((n) =>
  (n.who === 'all') || (n.who === 'manager' ? isManager : can(n.perm)));
