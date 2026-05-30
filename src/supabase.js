import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://svdrrntlcyfcoqvnwddi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OH7xh9GFapDsmD_dIDybcw_qJOqH8hk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);