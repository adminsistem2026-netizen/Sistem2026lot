import { createClient } from '@insforge/sdk';

const insforge = createClient({
  baseUrl: import.meta.env.VITE_INSFORGE_URL,
  anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY,
});

// Shorthand helpers para mantener sintaxis similar a Supabase
export const db = insforge.database;
export const auth = insforge.auth;

export default insforge;
