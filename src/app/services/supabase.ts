import { InjectionToken, isDevMode } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

// Development builds (ng serve, ng test) must only talk to the local Supabase
// stack, so a mistake can never read or write production data.
if (isDevMode() && !LOCAL_HOSTS.includes(new URL(environment.supabaseUrl).hostname)) {
  throw new Error(
    `Development builds must use the local Supabase stack, but supabaseUrl is ` +
      `"${environment.supabaseUrl}". Start it with "npx supabase start" and use ` +
      `src/environments/environment.ts.`,
  );
}

export const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

export const SUPABASE_CLIENT = new InjectionToken<typeof supabase>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: () => supabase,
});
