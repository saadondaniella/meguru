import { Service, signal } from '@angular/core';
import { supabase } from './supabase';

@Service()
export class Auth {
  readonly isPasswordRecovery = signal(false);
  readonly isLoggedIn = signal(false);

  async signUp(email: string, password: string) {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
  }

  async signIn(email: string, password: string) {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  async resetPassword(email: string) {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
  }

  async updatePassword(password: string) {
    return await supabase.auth.updateUser({
      password,
    });
  }

  onAuthStateChange(callback: (event: string) => void) {
    return supabase.auth.onAuthStateChange((event) => {
      callback(event);
    });
  }

  async getSession() {
    return await supabase.auth.getSession();
  }

  private recoveryConfirmed = false;

  constructor() {
    supabase.auth.onAuthStateChange((event, session) => {
      this.isLoggedIn.set(!!session);

      if (event === 'PASSWORD_RECOVERY') {
        this.isPasswordRecovery.set(true);
      }

      if (event === 'SIGNED_OUT') {
        this.isPasswordRecovery.set(false);
      }
    });
  }

  async signOut() {
    return await supabase.auth.signOut();
  }
}
