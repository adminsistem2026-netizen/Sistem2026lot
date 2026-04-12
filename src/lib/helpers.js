import { createClient } from '@insforge/sdk';

/**
 * Genera un número de ticket único (ej: "TK-20260320-A3F9")
 */
export function generateTicketNumber() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TK-${date}-${random}`;
}

/**
 * Formatea un monto con símbolo de moneda y decimales
 */
export function formatCurrency(amount, symbol = '$', decimals = 2) {
  const formatted = Number(amount).toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formatted}`;
}

/**
 * Retorna la fecha actual en formato YYYY-MM-DD
 */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Verifica si un número es válido para la lotería (2 o 4 dígitos numéricos)
 */
export function isValidLotteryNumber(number) {
  return /^\d{2}$/.test(number) || /^\d{4}$/.test(number);
}

/**
 * Parsea entrada rápida tipo "39,9 45,2" en array de { number, pieces }
 */
export function parseQuickInput(input) {
  const entries = input.trim().split(/\s+/);
  const result = [];
  for (const entry of entries) {
    const parts = entry.split(',');
    if (parts.length !== 2) continue;
    const [number, piecesStr] = parts;
    const pieces = parseInt(piecesStr, 10);
    if (isValidLotteryNumber(number.trim()) && pieces > 0) {
      result.push({ number: number.trim(), pieces });
    }
  }
  return result;
}

/**
 * Crea un usuario en InsForge sin afectar la sesión actual.
 * Usa una instancia separada del SDK para no tocar la sesión del admin.
 * Retorna { user: { id, email } } o lanza un error.
 */
export async function createAuthUser(email, password, name) {
  const tempClient = createClient({
    baseUrl: import.meta.env.VITE_INSFORGE_URL || 'https://e8cpb3g3.us-east.insforge.app',
    anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || 'ik_1016f97bf745645904003df562a619b1',
  });

  const { data, error } = await tempClient.auth.signUp({ email, password, name });

  if (error) {
    if (error.statusCode === 409 || error.message?.toLowerCase().includes('already')) {
      throw new Error('Este correo ya está registrado');
    }
    throw new Error(error.message || `Error al crear usuario`);
  }
  if (!data?.user?.id) throw new Error('No se recibió ID del nuevo usuario');
  return data;
}
