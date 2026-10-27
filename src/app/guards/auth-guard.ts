import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SUPABASE_CLIENT } from '../services/supabase';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const supabase = inject(SUPABASE_CLIENT);

  const { data, error } = await supabase.auth.getUser();

  if (!error && data.user) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
