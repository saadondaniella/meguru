import { Injectable } from '@angular/core';
import { supabase } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class Profile {
  async getProfile(userId: string) {
    return await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  }

  async createProfile(profile: {
    display_name: string;
    bio: string | null;
    city: string | null;
    contact_email: string | null;
    instagram: string | null;
  }) {
    return await supabase.from('profiles').insert(profile);
  }

  async updateProfile(
    userId: string,
    profile: {
      display_name: string;
      bio: string | null;
      city: string | null;
      contact_email: string | null;
      instagram: string | null;
    },
  ) {
    return await supabase.from('profiles').update(profile).eq('id', userId);
  }
  
}
