import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class Orders {
  private supabase = inject(SUPABASE_CLIENT);

  async getMyPurchases(userId: string) {
    return this.supabase
      .from('orders')
      .select(
        `*,
  listings (
    id,
    title,
    price,
    image_path
  )`,
      )
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false });
  }
}
