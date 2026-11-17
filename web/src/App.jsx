import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute, { PermRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import TeamAttendance from './pages/TeamAttendance';
import TeamTrail from './pages/TeamTrail';
import Holidays from './pages/Holidays';
import Leaves from './pages/Leaves';
import Overtime from './pages/Overtime';
import CompOff from './pages/CompOff';
import Expenses from './pages/Expenses';
import Sites from './pages/Sites';
import Shifts from './pages/Shifts';
import TeamApprovals from './pages/TeamApprovals';
import Payroll from './pages/Payroll';
import Reports from './pages/Reports';
import Announcements from './pages/Announcements';
import Helpdesk from './pages/Helpdesk';
import Assets from './pages/Assets';
import Documents from './pages/Documents';
import Exits from './pages/Exits';
import Roles from './pages/Roles';
import Branches from './pages/Branches';
import Recruitment from './pages/Recruitment';
import Training from './pages/Training';
import Biometric from './pages/Biometric';
import Compliance from './pages/Compliance';
import AuditLog from './pages/AuditLog';
import Chat from './pages/Chat';

// [path, element, permission] — each admin page needs its own area permission
// (see backend lib/permissions.js); 'admin' = the Admin role itself.
const AREAS = [
  ['/', <Dashboard />, 'attendance'],
  ['/users', <Users />, 'users'],
  ['/attendance', <TeamAttendance key="admin" />, 'attendance'],
  ['/biometric', <Biometric />, 'attendance'],
  ['/trail', <TeamTrail />, 'location'],
  ['/shifts', <Shifts />, 'shifts'],
  ['/holidays', <Holidays />, 'holidays'],
  ['/sites', <Sites />, 'sites'],
  ['/leaves', <Leaves />, 'leave'],
  ['/overtime', <Overtime />, 'overtime'],
  ['/compoff', <CompOff />, 'compoff'],
  ['/expenses', <Expenses />, 'expenses'],
  ['/payroll', <Payroll />, 'payroll'],
  ['/reports', <Reports />, 'reports'],
  ['/announcements', <Announcements />, 'announcements'],
  ['/helpdesk', <Helpdesk />, 'helpdesk'],
  ['/assets', <Assets />, 'assets'],
  ['/documents', <Documents />, 'documents'],
  ['/exits', <Exits />, 'exits'],
  ['/recruitment', <Recruitment />, 'recruitment'],
  ['/training', <Training />, 'training'],
  ['/compliance', <Compliance />, 'compliance'],
  ['/branches', <Branches />, 'branches'],
  ['/audit', <AuditLog />, 'audit'],
  ['/roles', <Roles />, 'admin'],
];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* Reporting managers (and anyone who manages people) */}
              <Route path="/my-team" element={<TeamAttendance key="team" scope="team" />} />
              <Route path="/team-approvals" element={<TeamApprovals />} />
              <Route path="/chat" element={<Chat />} />

              {AREAS.map(([path, element, perm]) => (
                <Route key={path} element={<PermRoute perm={perm} />}>
                  <Route path={path} element={element} />
                </Route>
              ))}
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
