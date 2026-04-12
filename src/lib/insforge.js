import { createClient } from '@insforge/sdk';

const insforge = createClient({
  baseUrl: import.meta.env.VITE_INSFORGE_URL || 'https://w54yh5ce.us-east.insforge.app',
  anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || 'ik_9d16e487f6a52cf24e19dda5922ff2de',
});

// Shorthand helpers para mantener sintaxis similar a Supabase
export const db = insforge.database;
export const auth = insforge.auth;

export default insforge;
