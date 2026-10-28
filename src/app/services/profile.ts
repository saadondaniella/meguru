import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class Profile {
  private supabase = inject(SUPABASE_CLIENT);
  async getProfile(userId: string) {
    return await this.supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  }

  async searchProfiles(search: string) {
    const term = search.trim();

    if (!term) {
      return { data: [], error: null };
    }

    return await this.supabase
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', `%${term.replace(/[%_\\]/g, '\\$&')}%`)
      .order('display_name', { ascending: true })
      .limit(10);
  }

  async createProfile(profile: {
    display_name: string;
    bio: string | null;
    city: string | null;
    contact_email: string | null;
    instagram: string | null;
  }) {
    return await this.supabase.from('profiles').insert(profile);
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
    return await this.supabase.from('profiles').update(profile).eq('id', userId).select().single();
  }
}
