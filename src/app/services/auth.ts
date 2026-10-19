import { Service, signal } from '@angular/core';
import { supabase } from './supabase';

@Service()
export class Auth {
  readonly isPasswordRecovery = signal(false);

  async signUp(email: string, password: string) {
    return await supabase.auth.signUp({
      email,
      password,
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
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.isPasswordRecovery.set(true);
      }
    });
  }

  async signOut() {
    return await supabase.auth.signOut();
  }
}
