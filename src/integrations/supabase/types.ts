export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_visit: string | null
          name: string
          phone: string
          tenant_id: string
          total_spend: number | null
          visits: number | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_visit?: string | null
          name: string
          phone: string
          tenant_id: string
          total_spend?: number | null
          visits?: number | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_visit?: string | null
          name?: string
          phone?: string
          tenant_id?: string
          total_spend?: number | null
          visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          id: string
          invoice_number: string | null
          issued_at: string
          meta: Json | null
          paid_at: string | null
          status: string
          subscription_id: string | null
          tax: number | null
          tenant_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_number?: string | null
          issued_at?: string
          meta?: Json | null
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          tax?: number | null
          tenant_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string
          meta?: Json | null
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          tax?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_veg: boolean | null
          name: string
          price: number
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_veg?: boolean | null
          name: string
          price?: number
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_veg?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: Database["public"]["Enums"]["notif_channel"]
          created_at: string
          id: string
          is_read: boolean
          kind: string
          meta: Json | null
          recipient_id: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notif_channel"]
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          meta?: Json | null
          recipient_id?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          channel?: Database["public"]["Enums"]["notif_channel"]
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          meta?: Json | null
          recipient_id?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          menu_item_id: string | null
          name: string
          notes: string | null
          order_id: string
          price: number
          quantity: number
          tenant_id: string
        }
        Insert: {
          id?: string
          menu_item_id?: string | null
          name: string
          notes?: string | null
          order_id: string
          price: number
          quantity?: number
          tenant_id: string
        }
        Update: {
          id?: string
          menu_item_id?: string | null
          name?: string
          notes?: string | null
          order_id?: string
          price?: number
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          served_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          notes?: string | null
          order_number?: number
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          served_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          notes?: string | null
          order_number?: number
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          served_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          label: string
          seats: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          label: string
          seats?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          label?: string
          seats?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          order_id: string | null
          rating: number
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          order_id?: string | null
          rating: number
          tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          order_id?: string | null
          rating?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_menu_items: number | null
          max_orders_month: number | null
          max_staff: number | null
          max_storage_mb: number | null
          max_tables: number | null
          monthly_price: number
          name: string
          sort_order: number | null
          yearly_price: number
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_menu_items?: number | null
          max_orders_month?: number | null
          max_staff?: number | null
          max_storage_mb?: number | null
          max_tables?: number | null
          monthly_price?: number
          name: string
          sort_order?: number | null
          yearly_price?: number
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_menu_items?: number | null
          max_orders_month?: number | null
          max_staff?: number | null
          max_storage_mb?: number | null
          max_tables?: number | null
          monthly_price?: number
          name?: string
          sort_order?: number | null
          yearly_price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_ends_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          trial_ends_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          priority: string | null
          status: string | null
          subject: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          subject: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          subject?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          brand_color: string | null
          business_type: string | null
          city: string | null
          closing_time: string | null
          country: string | null
          created_at: string
          currency: string | null
          expected_orders_per_day: number | null
          gst_number: string | null
          id: string
          logo_url: string | null
          name: string
          number_of_tables: number | null
          opening_time: string | null
          owner_email: string | null
          owner_id: string | null
          owner_name: string | null
          owner_phone: string | null
          pincode: string | null
          settings: Json
          slogan: string | null
          slug: string
          state: string | null
          status: Database["public"]["Enums"]["tenant_status"]
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          business_type?: string | null
          city?: string | null
          closing_time?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          expected_orders_per_day?: number | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          name: string
          number_of_tables?: number | null
          opening_time?: string | null
          owner_email?: string | null
          owner_id?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          pincode?: string | null
          settings?: Json
          slogan?: string | null
          slug: string
          state?: string | null
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          business_type?: string | null
          city?: string | null
          closing_time?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          expected_orders_per_day?: number | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          number_of_tables?: number | null
          opening_time?: string | null
          owner_email?: string | null
          owner_id?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          pincode?: string | null
          settings?: Json
          slogan?: string | null
          slug?: string
          state?: string | null
          status?: Database["public"]["Enums"]["tenant_status"]
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "restaurant_admin"
        | "manager"
        | "cashier"
        | "kitchen"
        | "waiter"
      notif_channel: "dashboard" | "email" | "sms" | "whatsapp"
      order_status: "new" | "preparing" | "ready" | "served" | "cancelled"
      order_type: "dine_in" | "takeaway"
      payment_status: "unpaid" | "paid" | "refunded"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
        | "paused"
      tenant_status: "pending" | "approved" | "suspended" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "restaurant_admin",
        "manager",
        "cashier",
        "kitchen",
        "waiter",
      ],
      notif_channel: ["dashboard", "email", "sms", "whatsapp"],
      order_status: ["new", "preparing", "ready", "served", "cancelled"],
      order_type: ["dine_in", "takeaway"],
      payment_status: ["unpaid", "paid", "refunded"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
        "paused",
      ],
      tenant_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
