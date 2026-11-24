import { Route, Routes } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout.jsx';
import RoleRoute from './RoleRoute.jsx';
import AdminShell from '../components/admin/AdminShell.jsx';
import AdminDashboard from '../pages/admin/AdminDashboard.jsx';
import CategoryManagementPage from '../pages/admin/CategoryManagementPage.jsx';
import MenuItemManagementPage from '../pages/admin/MenuItemManagementPage.jsx';
import TableManagementPage from '../pages/admin/TableManagementPage.jsx';
import AdminSettingsPage from '../pages/admin/AdminSettingsPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import TableEntryPage from '../pages/customer/TableEntryPage.jsx';
import OrderTrackingPage from '../pages/customer/OrderTrackingPage.jsx';
import HomePage from '../pages/HomePage.jsx';
import KitchenDashboard from '../pages/kitchen/KitchenDashboard.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import UnauthorizedPage from '../pages/UnauthorizedPage.jsx';
import WaiterDashboard from '../pages/waiter/WaiterDashboard.jsx';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/menu" element={<TableEntryPage />} />
        <Route path="/menu/:tableNumber" element={<TableEntryPage />} />
        <Route path="/menu/:tableNumber/:token" element={<TableEntryPage />} />
        <Route path="/track/:orderId" element={<OrderTrackingPage />} />
        <Route path="/staff/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route element={<RoleRoute allowedRoles={['admin']} />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminDashboard />} />
            <Route path="tables" element={<TableManagementPage />} />
            <Route path="categories" element={<CategoryManagementPage />} />
            <Route path="menu-items" element={<MenuItemManagementPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
        <Route element={<RoleRoute allowedRoles={['kitchen']} />}>
          <Route path="/kitchen" element={<KitchenDashboard />} />
        </Route>
        <Route element={<RoleRoute allowedRoles={['waiter']} />}>
          <Route path="/waiter" element={<WaiterDashboard />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
