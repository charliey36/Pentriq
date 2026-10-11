/**
 * `review_link_clicked` = counted (human) click on an emailed review link
 * (REVIEW_LINK_CLICKED). `review_link_scan` = automated hit (email security
 * scanner / link preview / bot), stored for audit and never counted.
 * `click` = historical rows written before migration 0018.
 */
export type InteractionEventType =
  | 'click'
  | 'review_confirmed'
  | 'feedback_submitted'
  | 'review_link_clicked'
  | 'review_link_scan';

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          google_review_url: string;
          delay_hours: number;
          brand_logo_url: string | null;
          brand_primary_color: string | null;
          subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
          trial_ends_at: string;
          current_period_end: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          review_request_window_days: number;
          rebooking_reminder_interval_days: number;
          rebooking_reminders_enabled: boolean;
          onboarding_completed_at: string | null;
          welcome_email_sent_at: string | null;
          campaign_email_sent_at: string | null;
          trial_ending_email_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name?: string;
          google_review_url?: string;
          delay_hours?: number;
          brand_logo_url?: string | null;
          brand_primary_color?: string | null;
        };
        Update: {
          name?: string;
          google_review_url?: string;
          delay_hours?: number;
          brand_logo_url?: string | null;
          brand_primary_color?: string | null;
          subscription_status?: 'trialing' | 'active' | 'past_due' | 'canceled';
          trial_ends_at?: string;
          current_period_end?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          review_request_window_days?: number;
          rebooking_reminder_interval_days?: number;
          rebooking_reminders_enabled?: boolean;
          onboarding_completed_at?: string | null;
          welcome_email_sent_at?: string | null;
          campaign_email_sent_at?: string | null;
          trial_ending_email_sent_at?: string | null;
        };
        Relationships: [];
      };
      api_keys: {
        Row: { id: string; business_id: string; key_hash: string; key_prefix: string; is_active: boolean; created_at: string };
        Insert: { id?: string; business_id: string; key_hash: string; key_prefix: string; is_active?: boolean };
        Update: { key_hash?: string; key_prefix?: string; is_active?: boolean; created_at?: string };
        Relationships: [];
      };
      demo_company_records: {
        Row: { id: string; business_id: string; customer_name: string; email: string; phone: string | null; amount_spent: number; service_date: string; created_at: string; synced_at: string | null };
        Insert: { id?: string; business_id?: string; customer_name: string; email: string; phone?: string | null; amount_spent?: number; service_date?: string; synced_at?: string | null };
        Update: { synced_at?: string | null };
        Relationships: [];
      };
      integration_events: {
        Row: { id: string; business_id: string; source: 'api' | 'test'; endpoint: string; status: 'imported' | 'updated' | 'duplicate' | 'failed'; message: string; payload: unknown; created_at: string };
        Insert: { id?: string; business_id: string; source?: 'api' | 'test'; endpoint: string; status: 'imported' | 'updated' | 'duplicate' | 'failed'; message: string; payload?: unknown };
        Update: { message?: string };
        Relationships: [];
      };
      google_business_connections: {
        Row: {
          id: string;
          business_id: string;
          google_account_id: string;
          google_location_id: string | null;
          location_name: string | null;
          /** AES-256-GCM encrypted (see lib/google-token-crypto.ts). */
          access_token: string;
          /** AES-256-GCM encrypted. */
          refresh_token: string;
          token_expires_at: string | null;
          /** Space-separated scopes Google granted (migration 0020); null for older rows. */
          granted_scopes: string | null;
          status: 'pending_location' | 'active' | 'needs_reconnect';
          rating_alert_threshold: number;
          initial_sync_done: boolean;
          last_sync_error: string | null;
          connected_at: string;
          last_sync_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          google_account_id: string;
          google_location_id?: string | null;
          location_name?: string | null;
          access_token: string;
          refresh_token: string;
          token_expires_at?: string | null;
          granted_scopes?: string | null;
          status?: 'pending_location' | 'active' | 'needs_reconnect';
          rating_alert_threshold?: number;
          initial_sync_done?: boolean;
          last_sync_error?: string | null;
          connected_at?: string;
          last_sync_at?: string | null;
        };
        Update: {
          google_account_id?: string;
          google_location_id?: string | null;
          location_name?: string | null;
          access_token?: string;
          refresh_token?: string;
          token_expires_at?: string | null;
          granted_scopes?: string | null;
          status?: 'pending_location' | 'active' | 'needs_reconnect';
          rating_alert_threshold?: number;
          initial_sync_done?: boolean;
          last_sync_error?: string | null;
          connected_at?: string;
          last_sync_at?: string | null;
        };
        Relationships: [];
      };
      google_reviews: {
        Row: {
          id: string;
          business_id: string;
          google_review_id: string;
          reviewer_name: string;
          reviewer_photo_url: string | null;
          rating: number;
          comment: string | null;
          review_date: string;
          update_time: string;
          reply_text: string | null;
          reply_update_time: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          google_review_id: string;
          reviewer_name?: string;
          reviewer_photo_url?: string | null;
          rating: number;
          comment?: string | null;
          review_date: string;
          update_time: string;
          reply_text?: string | null;
          reply_update_time?: string | null;
          synced_at?: string;
        };
        Update: {
          reviewer_name?: string;
          reviewer_photo_url?: string | null;
          rating?: number;
          comment?: string | null;
          review_date?: string;
          update_time?: string;
          reply_text?: string | null;
          reply_update_time?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      review_metrics_daily: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          total_reviews: number;
          average_rating: number;
          reviews_gained_today: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          total_reviews?: number;
          average_rating?: number;
          reviews_gained_today?: number;
        };
        Update: {
          total_reviews?: number;
          average_rating?: number;
          reviews_gained_today?: number;
        };
        Relationships: [];
      };
      review_alerts: {
        Row: {
          id: string;
          business_id: string;
          type: 'new_review' | 'new_one_star' | 'low_rating' | 'rating_decrease';
          title: string;
          message: string;
          google_review_id: string | null;
          dedupe_key: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          type: 'new_review' | 'new_one_star' | 'low_rating' | 'rating_decrease';
          title: string;
          message: string;
          google_review_id?: string | null;
          dedupe_key: string;
          is_read?: boolean;
        };
        Update: {
          is_read?: boolean;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: { id: string; business_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; stripe_price_id: string | null; plan_name: string | null; status: string; current_period_end: string | null; trial_end: string | null; cancel_at_period_end: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; business_id: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; stripe_price_id?: string | null; plan_name?: string | null; status?: string; current_period_end?: string | null; trial_end?: string | null; cancel_at_period_end?: boolean; updated_at?: string };
        Update: { stripe_customer_id?: string | null; stripe_subscription_id?: string | null; stripe_price_id?: string | null; plan_name?: string | null; status?: string; current_period_end?: string | null; trial_end?: string | null; cancel_at_period_end?: boolean; updated_at?: string };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: { id: string; type: string; processed_at: string };
        Insert: { id: string; type: string };
        Update: { type?: string };
        Relationships: [];
      };
      review_sources: {
        Row: { id: string; business_id: string; source_name: string; source_type: 'manual' | 'google'; connected: boolean; created_at: string };
        Insert: { id?: string; business_id: string; source_name: string; source_type: 'manual' | 'google'; connected?: boolean };
        Update: { source_name?: string; connected?: boolean };
        Relationships: [];
      };
      manual_review_snapshots: {
        Row: { id: string; business_id: string; snapshot_date: string; review_count: number; average_rating: number; created_at: string };
        Insert: { id?: string; business_id: string; snapshot_date: string; review_count: number; average_rating: number };
        Update: { snapshot_date?: string; review_count?: number; average_rating?: number };
        Relationships: [];
      };
      review_metrics: {
        Row: { id: string; business_id: string; period: string; reviews_gained: number; rating_change: number; average_rating: number; review_count: number; calculated_at: string };
        Insert: { id?: string; business_id: string; period: string; reviews_gained?: number; rating_change?: number; average_rating?: number; review_count?: number; calculated_at?: string };
        Update: { reviews_gained?: number; rating_change?: number; average_rating?: number; review_count?: number; calculated_at?: string };
        Relationships: [];
      };
      google_business_locations: {
        Row: { id: string; business_id: string; google_account_id: string; google_location_id: string; title: string; address: string | null; created_at: string };
        Insert: { id?: string; business_id: string; google_account_id: string; google_location_id: string; title: string; address?: string | null };
        Update: { title?: string; address?: string | null };
        Relationships: [];
      };
      google_sync_jobs: {
        Row: { id: string; business_id: string; trigger: 'initial' | 'scheduled' | 'manual'; status: 'succeeded' | 'failed'; fetched: number; inserted: number; updated: number; alerts: number; error: string | null; created_at: string };
        Insert: { id?: string; business_id: string; trigger: 'initial' | 'scheduled' | 'manual'; status: 'succeeded' | 'failed'; fetched?: number; inserted?: number; updated?: number; alerts?: number; error?: string | null };
        Update: { error?: string | null };
        Relationships: [];
      };
      business_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'staff';
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'staff';
        };
        Update: {
          role?: 'owner' | 'admin' | 'staff';
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          email: string;
          phone: string | null;
          date_of_birth: string | null;
          last_service_date: string | null;
          total_spend: number;
          visit_count: number;
          source: string | null;
          unsubscribed_at: string | null;
          unsubscribed_sms_at: string | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          email: string;
          phone?: string | null;
          date_of_birth?: string | null;
          last_service_date?: string | null;
          total_spend?: number;
          visit_count?: number;
          source?: string | null;
          unsubscribed_at?: string | null;
          unsubscribed_sms_at?: string | null;
          archived_at?: string | null;
        };
        Update: {
          name?: string;
          email?: string;
          phone?: string | null;
          date_of_birth?: string | null;
          last_service_date?: string | null;
          total_spend?: number;
          visit_count?: number;
          source?: string | null;
          unsubscribed_at?: string | null;
          unsubscribed_sms_at?: string | null;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      customer_tags: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          tag: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          tag: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          recurrence_interval_days: number | null;
          default_price: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          recurrence_interval_days?: number | null;
          default_price?: number | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          recurrence_interval_days?: number | null;
          default_price?: number | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      visits: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          service_id: string | null;
          visited_at: string;
          price: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          service_id?: string | null;
          visited_at?: string;
          price?: number | null;
          notes?: string | null;
        };
        Update: {
          service_id?: string | null;
          visited_at?: string;
          price?: number | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          purpose:
            | 'review_request'
            | 'review_reminder'
            | 'rebooking_reminder'
            | 'win_back'
            | 'birthday'
            | 'referral'
            | 'loyalty'
            | 'custom';
          channel: 'email' | 'sms' | 'whatsapp';
          journey_enrollment_id: string | null;
          sequence_step: number;
          status: 'queued' | 'pending' | 'sent' | 'failed' | 'cancelled';
          visit_id: string | null;
          send_at: string;
          sent_at: string | null;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string | null;
          last_error: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          tracking_token: string;
          click_count: number;
          first_clicked_at: string | null;
          last_clicked_at: string | null;
          destination_url: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          purpose: string;
          channel?: 'email' | 'sms' | 'whatsapp';
          journey_enrollment_id?: string | null;
          sequence_step?: number;
          status?: 'queued' | 'pending' | 'sent' | 'failed' | 'cancelled';
          visit_id?: string | null;
          send_at: string;
          sent_at?: string | null;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string | null;
          last_error?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: {
          status?: 'queued' | 'pending' | 'sent' | 'failed' | 'cancelled';
          send_at?: string;
          channel?: 'email' | 'sms' | 'whatsapp';
          sent_at?: string | null;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string | null;
          last_error?: string | null;
          click_count?: number;
          first_clicked_at?: string | null;
          last_clicked_at?: string | null;
          destination_url?: string | null;
        };
        Relationships: [];
      };
      interaction_events: {
        Row: {
          id: string;
          business_id: string;
          message_id: string | null;
          customer_id: string | null;
          event_type: InteractionEventType;
          occurred_at: string;
          metadata: Record<string, unknown>;
          review_request_id: string | null;
          campaign_id: string | null;
          user_agent: string | null;
          ip_address: string | null;
          destination_url: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          message_id?: string | null;
          customer_id?: string | null;
          event_type: InteractionEventType;
          occurred_at?: string;
          metadata?: Record<string, unknown>;
          review_request_id?: string | null;
          campaign_id?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          destination_url?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      private_feedback: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string | null;
          message_id: string | null;
          rating: number | null;
          comment: string;
          status: 'new' | 'acknowledged' | 'resolved';
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id?: string | null;
          message_id?: string | null;
          rating?: number | null;
          comment: string;
          status?: 'new' | 'acknowledged' | 'resolved';
        };
        Update: {
          status?: 'new' | 'acknowledged' | 'resolved';
        };
        Relationships: [];
      };
      journeys: {
        Row: {
          id: string;
          business_id: string;
          key: 'review_sequence' | 'rebooking_reminder' | 'win_back' | 'birthday';
          name: string;
          is_active: boolean;
          steps: Array<{ wait_hours: number; channel: 'email' | 'sms' | 'whatsapp'; purpose: string }>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          key: 'review_sequence' | 'rebooking_reminder' | 'win_back' | 'birthday';
          name: string;
          is_active?: boolean;
          steps?: Array<{ wait_hours: number; channel: 'email' | 'sms' | 'whatsapp'; purpose: string }>;
        };
        Update: {
          name?: string;
          is_active?: boolean;
          steps?: Array<{ wait_hours: number; channel: 'email' | 'sms' | 'whatsapp'; purpose: string }>;
        };
        Relationships: [];
      };
      journey_enrollments: {
        Row: {
          id: string;
          journey_id: string;
          business_id: string;
          customer_id: string;
          current_step: number;
          status: 'active' | 'completed' | 'exited';
          enrolled_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          journey_id: string;
          business_id: string;
          customer_id: string;
          current_step?: number;
          status?: 'active' | 'completed' | 'exited';
        };
        Update: {
          current_step?: number;
          status?: 'active' | 'completed' | 'exited';
        };
        Relationships: [];
      };
      segments: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          rule_definition: Array<{ field: string; operator: string; value: string | number }>;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          rule_definition?: Array<{ field: string; operator: string; value: string | number }>;
        };
        Update: {
          name?: string;
          rule_definition?: Array<{ field: string; operator: string; value: string | number }>;
        };
        Relationships: [];
      };
      loyalty_programs: {
        Row: {
          id: string;
          business_id: string;
          is_active: boolean;
          points_per_visit: number;
          points_per_referral: number;
          points_per_review: number;
          redemption_points: number;
          redemption_reward_description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          is_active?: boolean;
          points_per_visit?: number;
          points_per_referral?: number;
          points_per_review?: number;
          redemption_points?: number;
          redemption_reward_description?: string;
        };
        Update: {
          is_active?: boolean;
          points_per_visit?: number;
          points_per_referral?: number;
          points_per_review?: number;
          redemption_points?: number;
          redemption_reward_description?: string;
        };
        Relationships: [];
      };
      loyalty_ledger_entries: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          delta: number;
          reason: 'visit' | 'referral' | 'review' | 'redemption' | 'birthday' | 'manual';
          reference_type: string | null;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          delta: number;
          reason: 'visit' | 'referral' | 'review' | 'redemption' | 'birthday' | 'manual';
          reference_type?: string | null;
          reference_id?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          business_id: string;
          referrer_customer_id: string;
          referee_customer_id: string | null;
          code: string;
          status: 'pending' | 'completed';
          reward_granted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          referrer_customer_id: string;
          referee_customer_id?: string | null;
          code: string;
          status?: 'pending' | 'completed';
          reward_granted_at?: string | null;
        };
        Update: {
          referee_customer_id?: string | null;
          status?: 'pending' | 'completed';
          reward_granted_at?: string | null;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          id: string;
          business_id: string;
          total_rows: number;
          success_count: number;
          error_count: number;
          duplicate_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          total_rows?: number;
          success_count?: number;
          error_count?: number;
          duplicate_count?: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      review_requests: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          status: 'pending' | 'sent' | 'failed' | 'cancelled';
          send_at: string;
          sent_at: string | null;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string | null;
          last_error: string | null;
          created_at: string;
          tracking_token: string;
          click_count: number;
          first_clicked_at: string | null;
          last_clicked_at: string | null;
          destination_url: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id: string;
          status?: 'pending' | 'sent' | 'failed' | 'cancelled';
          send_at: string;
          sent_at?: string | null;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string | null;
          last_error?: string | null;
        };
        Update: {
          status?: 'pending' | 'sent' | 'failed' | 'cancelled';
          sent_at?: string | null;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string | null;
          last_error?: string | null;
          click_count?: number;
          first_clicked_at?: string | null;
          last_clicked_at?: string | null;
          destination_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'review_requests_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_requests_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          }
        ];
      };
      click_events: {
        Row: {
          id: string;
          business_id: string;
          review_request_id: string;
          clicked_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          review_request_id: string;
          clicked_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: 'click_events_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'click_events_review_request_id_fkey';
            columns: ['review_request_id'];
            isOneToOne: false;
            referencedRelation: 'review_requests';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type Business = Database['public']['Tables']['businesses']['Row'];
export type BusinessMember = Database['public']['Tables']['business_members']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerTag = Database['public']['Tables']['customer_tags']['Row'];
export type Service = Database['public']['Tables']['services']['Row'];
export type Visit = Database['public']['Tables']['visits']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type InteractionEvent = Database['public']['Tables']['interaction_events']['Row'];
export type PrivateFeedback = Database['public']['Tables']['private_feedback']['Row'];
export type Journey = Database['public']['Tables']['journeys']['Row'];
export type JourneyEnrollment = Database['public']['Tables']['journey_enrollments']['Row'];
export type Segment = Database['public']['Tables']['segments']['Row'];
export type LoyaltyProgram = Database['public']['Tables']['loyalty_programs']['Row'];
export type LoyaltyLedgerEntry = Database['public']['Tables']['loyalty_ledger_entries']['Row'];
export type Referral = Database['public']['Tables']['referrals']['Row'];
export type ImportJob = Database['public']['Tables']['import_jobs']['Row'];
export type ReviewRequest = Database['public']['Tables']['review_requests']['Row'];
export type ClickEvent = Database['public']['Tables']['click_events']['Row'];
export type GoogleBusinessConnection = Database['public']['Tables']['google_business_connections']['Row'];
export type GoogleReview = Database['public']['Tables']['google_reviews']['Row'];
export type ReviewMetricsDaily = Database['public']['Tables']['review_metrics_daily']['Row'];
export type ReviewAlert = Database['public']['Tables']['review_alerts']['Row'];
export type ReviewSource = Database['public']['Tables']['review_sources']['Row'];
export type ManualReviewSnapshot = Database['public']['Tables']['manual_review_snapshots']['Row'];
export type ReviewMetric = Database['public']['Tables']['review_metrics']['Row'];
