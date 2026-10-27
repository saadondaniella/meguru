import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

import { InjectionToken } from '@angular/core';

export const SUPABASE_CLIENT = new InjectionToken<typeof supabase>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: () => supabase,
});
