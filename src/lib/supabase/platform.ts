import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { clientEnv, serverEnv } from '@/lib/env';

/**
 * Typ-Definitionen für das `platform`-Schema.
 * Wir generieren die App-Types via generate_typescript_types nur für das
 * public-Schema (Supabase-Default) — für `platform` deklarieren wir die
 * Zeilen hier händisch. Das ist überschaubar (drei Tabellen), und wir
 * vermeiden ein globales Regen jedes Mal, wenn sich das public-Schema ändert.
 */
export interface PlatformDatabase {
  platform: {
    Tables: {
      admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { created_at?: string };
        Relationships: [];
      };
      subscription_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          monthly_price_cents: number;
          yearly_price_cents: number;
          max_employees: number | null;
          max_properties: number | null;
          features: Record<string, boolean>;
          sort_order: number;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          monthly_price_cents: number;
          yearly_price_cents: number;
          max_employees?: number | null;
          max_properties?: number | null;
          features?: Record<string, boolean>;
          sort_order?: number;
          is_public?: boolean;
        };
        Update: Partial<PlatformDatabase['platform']['Tables']['subscription_plans']['Insert']>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          tenant_id: string;
          plan_id: string;
          plan_interval: 'monthly' | 'yearly';
          period_start: string;
          period_end: string;
          subtotal_cents: number;
          total_cents: number;
          currency: string;
          status: 'open' | 'paid' | 'canceled' | 'refunded';
          payment_method: 'bank_transfer' | 'stripe' | 'paypal';
          paid_at: string | null;
          payment_reference: string | null;
          paypal_order_id: string | null;
          paypal_capture_id: string | null;
          issued_at: string;
          due_at: string | null;
          billing_address: unknown;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invoice_number?: string;
          tenant_id: string;
          plan_id: string;
          plan_interval: 'monthly' | 'yearly';
          period_start: string;
          period_end: string;
          subtotal_cents: number;
          total_cents: number;
          currency?: string;
          status?: 'open' | 'paid' | 'canceled' | 'refunded';
          payment_method: 'bank_transfer' | 'stripe' | 'paypal';
          paid_at?: string | null;
          payment_reference?: string | null;
          paypal_order_id?: string | null;
          paypal_capture_id?: string | null;
          issued_at?: string;
          due_at?: string | null;
          billing_address?: unknown;
          notes?: string | null;
        };
        Update: Partial<PlatformDatabase['platform']['Tables']['invoices']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      plan_interval: 'monthly' | 'yearly';
    };
    CompositeTypes: Record<string, never>;
  };
}

let cached: ReturnType<typeof createClient<PlatformDatabase, 'platform'>> | null = null;

/**
 * Service-Role-Client, der ausschließlich auf das `platform`-Schema zeigt.
 * Bypasst RLS — nur in Server-Actions/Routes verwenden, die selbst die
 * Berechtigung prüfen (requirePlatformAdmin oder Owner-Check).
 */
export function createPlatformServiceClient() {
  if (cached) return cached;
  const env = serverEnv();
  cached = createClient<PlatformDatabase, 'platform'>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: 'platform' },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
