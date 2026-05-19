import { createClient } from '@supabase/supabase-js';

// Configuration depuis variables d'env Vite (.env.local)
// Fallback sur les valeurs en dur pour développement
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
