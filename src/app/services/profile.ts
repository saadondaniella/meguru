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

  async uploadAvatar(userId: string, file: File) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxFileSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      throw new Error('Please select a JPEG, PNG or WebP image.');
    }

    if (file.size > maxFileSize) {
      throw new Error('The image must be smaller than 5 MB.');
    }

    const extension =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';

    const filePath = `${userId}/avatar-${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.storage.from('avatars').upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      throw error;
    }

    return filePath;
  }

  async updateAvatarPath(userId: string, avatarPath: string | null) {
    return await this.supabase
      .from('profiles')
      .update({ avatar_path: avatarPath })
      .eq('id', userId)
      .select()
      .single();
  }

  getAvatarUrl(avatarPath: string | null): string | null {
    if (!avatarPath) {
      return null;
    }

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(avatarPath);

    return data.publicUrl;
  }

  async deleteAvatar(avatarPath: string) {
    const { error } = await this.supabase.storage.from('avatars').remove([avatarPath]);

    if (error) {
      throw error;
    }
  }
}
