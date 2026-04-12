import { createClient } from '@insforge/sdk';

const insforge = createClient({
  baseUrl: import.meta.env.VITE_INSFORGE_URL || 'https://e8cpb3g3.us-east.insforge.app',
  anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || 'ik_1016f97bf745645904003df562a619b1',
});

// Shorthand helpers para mantener sintaxis similar a Supabase
export const db = insforge.database;
export const auth = insforge.auth;

export default insforge;
