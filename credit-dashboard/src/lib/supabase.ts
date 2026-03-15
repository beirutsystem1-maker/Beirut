import { createClient } from '@supabase/supabase-js';

// @ts-ignore
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lqvlwzsmvchpgmdxeugj.supabase.co';
// @ts-ignore
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxdmx3enNtdmNocGdtZHhldWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzA1NzQsImV4cCI6MjA4ODQwNjU3NH0.nWNQRNjGyGIcGUaYyow1PtRWbrI8lK0rOJBLT98avzU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
