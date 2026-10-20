import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from '../services/supabase';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);

  const { data, error } = await supabase.auth.getUser();

  if (!error && data.user) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
