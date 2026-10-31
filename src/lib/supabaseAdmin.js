import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './supabase';

export const supabaseAdmin = createClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);
