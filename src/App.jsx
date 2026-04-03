import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { PrinterProvider } from './contexts/PrinterContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import { ToastProvider } from './components/common/Toast';
import SellerVerifyWinners from './pages/seller/SellerVerifyWinners';

import LoginPage from './pages/auth/LoginPage';
import SellerLayout from './pages/seller/SellerLayout';
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerSales from './pages/seller/SellerSales';
import SellerNumbers from './pages/seller/SellerNumbers';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageSellers from './pages/admin/ManageSellers';
import ManageLotteries from './pages/admin/ManageLotteries';
import AdminSales from './pages/admin/AdminSales';
import AdminNumbers from './pages/admin/AdminNumbers';
import ManageLimits from './pages/admin/ManageLimits';
import ManageResults from './pages/admin/ManageResults';
import AdminSettings from './pages/admin/AdminSettings';

import SuperAdminLayout from './pages/superadmin/SuperAdminLayout';
import SuperDashboard from './pages/superadmin/SuperDashboard';
import ManageAdmins from './pages/superadmin/ManageAdmins';
import GlobalConfig from './pages/superadmin/GlobalConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <PrinterProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Seller */}
              <Route path="/seller" element={
                <ProtectedRoute allowedRoles={['seller']}>
                  <SellerLayout />
                </ProtectedRoute>
              }>
                <Route index element={<SellerDashboard />} />
                <Route path="ventas" element={<SellerSales />} />
                <Route path="numeros" element={<SellerNumbers />} />
                <Route path="ganadores" element={<SellerVerifyWinners />} />
              </Route>

              {/* Admin */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminLayout />
                </ProtectedRoute>
              }>
                <Route index element={<AdminDashboard />} />
                <Route path="vendedores" element={<ManageSellers />} />
                <Route path="loterias" element={<ManageLotteries />} />
                <Route path="ventas" element={<AdminSales />} />
                <Route path="numeros" element={<AdminNumbers />} />
                <Route path="limites" element={<ManageLimits />} />
                <Route path="resultados" element={<ManageResults />} />
                <Route path="config" element={<AdminSettings />} />
              </Route>

              {/* Super Admin */}
              <Route path="/superadmin" element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <SuperAdminLayout />
                </ProtectedRoute>
              }>
                <Route index element={<SuperDashboard />} />
                <Route path="admins" element={<ManageAdmins />} />
                <Route path="config" element={<GlobalConfig />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </ToastProvider>
          </PrinterProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
