import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import insforge, { db } from '../lib/insforge';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
        return {
          ...data,
          seller_code: codes[0].seller_code,
          admin_code:  codes[0].admin_code,
        };
      }
    } catch (_) { /* no crítico */ }
    return data;
  }

  function redirectByRole(role) {
    if (role === 'super_admin') navigate('/superadmin');
    else if (role === 'admin') navigate('/admin');
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

  // Restaurar sesión al cargar la app
  useEffect(() => {
    async function restoreSession() {
      try {
        const session = insforge.auth.tokenManager.getSession();
        if (session?.user) {
          const profileData = await loadProfile(session.user.id);
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
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
