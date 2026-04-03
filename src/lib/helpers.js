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
  return new Date().toISOString().split('T')[0];
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
 * Usa fetch directo con el ANON_KEY en lugar del token del usuario autenticado.
 * Retorna { user: { id, email } } o lanza un error.
 */
export async function createAuthUser(email, password, name) {
  const url = `${import.meta.env.VITE_INSFORGE_URL}/api/auth/users`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_INSFORGE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, password, name }),
  });

  if (res.status === 409) throw new Error('Este correo ya está registrado');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Error al crear usuario (${res.status})`);
  }

  const data = await res.json();
  if (!data?.user?.id) throw new Error('No se recibió ID del nuevo usuario');
  return data;
}
