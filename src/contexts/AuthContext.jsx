import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import insforge, { db } from '../lib/insforge';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Normaliza símbolos de moneda legacy al símbolo oficial correcto
  function normalizeCurrencySymbol(profileData) {
    const SYMBOL_BY_CODE = { CRC: '₡' };
    const LEGACY_SYMBOLS  = { '$Col': '₡', 'Col': '₡', '¢': '₡' };
    const code = profileData?.currency_code;
    const sym  = profileData?.currency_symbol;
    const fixed =
      (code && SYMBOL_BY_CODE[code]) ||
      (sym  && LEGACY_SYMBOLS[sym])  ||
      sym;
    if (fixed && fixed !== sym) return { ...profileData, currency_symbol: fixed };
    return profileData;
  }

  async function loadProfile(userId) {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Error cargando perfil:', JSON.stringify(error));
      throw new Error('Error al cargar perfil: ' + JSON.stringify(error));
    }
    // Cargar columnas nuevas via RPC (evita bug de schema cache de InsForge)
    try {
      const { data: codes } = await db.rpc('get_profile_codes', { p_user_id: userId });
      if (codes?.[0]) {
        return normalizeCurrencySymbol({ ...data, seller_code: codes[0].seller_code });
      }
    } catch (_) { /* no crítico */ }
    return normalizeCurrencySymbol(data);
  }

  function redirectByRole(role) {
    if (role === 'super_admin') navigate('/superadmin');
    else if (role === 'admin') navigate('/admin');
    else if (role === 'operator') navigate('/operator');
    else if (role === 'sub_admin') navigate('/seller/balance');
    else navigate('/seller');
  }

  async function login(email, password) {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.user) throw new Error('Error al iniciar sesión');

    const profileData = await loadProfile(data.user.id);
    if (!profileData) throw new Error('Perfil no encontrado');
    if (!profileData.is_active) throw new Error('Cuenta desactivada');
    if (profileData.expires_at && new Date(profileData.expires_at) < new Date()) {
      throw new Error('Esta cuenta ha vencido. Contacta al administrador.');
    }

    setUser(data.user);
    setProfile(profileData);
    redirectByRole(profileData.role);
  }

  async function logout() {
    await insforge.auth.signOut();
    setUser(null);
    setProfile(null);
    navigate('/login');
  }

  // Recargar el perfil fresco desde la BD (útil si se cambió moneda u otros datos)
  async function refreshProfile() {
    if (!user) return;
    try {
      const profileData = await loadProfile(user.id);
      setProfile(profileData);
    } catch (err) {
      console.error('Error recargando perfil:', err);
    }
  }

  // Restaurar sesión al cargar la app
  useEffect(() => {
    async function restoreSession() {
      try {
        const session = insforge.auth.tokenManager.getSession();
        if (session?.user) {
          const profileData = await loadProfile(session.user.id);
          if (!profileData.is_active || (profileData.expires_at && new Date(profileData.expires_at) < new Date())) {
            await insforge.auth.signOut();
            // No se setea user ni profile → ProtectedRoute redirige a /login cuando loading=false
            return;
          }
          setUser(session.user);
          setProfile(profileData);
        }
      } catch (err) {
        console.error('Error restaurando sesión:', err);
      } finally {
        setLoading(false);
      }
    }
    restoreSession();

    // Refrescar token JWT cada 3 minutos (expira en ~5 min en InsForge)
    const interval = setInterval(async () => {
      try {
        await insforge.auth.refreshSession();
      } catch (e) {
        console.warn('Admin token refresh failed:', e);
      }
    }, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
