import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class Orders {
  private supabase = inject(SUPABASE_CLIENT);

  // Get all purchases for the logged-in user
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

  // Get all sales for the logged-in seller
  async getMySales(userId: string) {
    return this.supabase
      .from('orders')
      .select(
        `*,
      listings (
        id,
        title,
        price,
        image_path,
        is_shipped
      )`,
      )
      .eq('seller_id', userId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false });
  }

  async getPurchaseBySessionId(userId: string, sessionId: string) {
    return this.supabase
      .from('orders')
      .select(
        `
      *,
      listings (
        id,
        title,
        price,
        image_path
      )
    `,
      )
      .eq('buyer_id', userId)
      .eq('stripe_session_id', sessionId)
      .maybeSingle();
  }
}
