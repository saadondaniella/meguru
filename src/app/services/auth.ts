import { Service } from '@angular/core';
import { supabase } from './supabase';

@Service()
export class Auth {
  async signUp(email: string, password: string) {
    return await supabase.auth.signUp({
      email,
      password,
    });
  }
}
