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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      announcement_receipts: {
        Row: {
          acknowledged_at: string | null
          announcement_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          announcement_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          announcement_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_receipts_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          published_at: string | null
          requires_acknowledgement: boolean
          status: Database["public"]["Enums"]["announcement_status"]
          target_property_id: string | null
          target_role_key: string | null
          target_type: Database["public"]["Enums"]["announcement_target_type"]
          target_user_ids: string[] | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          published_at?: string | null
          requires_acknowledgement?: boolean
          status?: Database["public"]["Enums"]["announcement_status"]
          target_property_id?: string | null
          target_role_key?: string | null
          target_type: Database["public"]["Enums"]["announcement_target_type"]
          target_user_ids?: string[] | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          published_at?: string | null
          requires_acknowledgement?: boolean
          status?: Database["public"]["Enums"]["announcement_status"]
          target_property_id?: string | null
          target_role_key?: string | null
          target_type?: Database["public"]["Enums"]["announcement_target_type"]
          target_user_ids?: string[] | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_target_property_id_fkey"
            columns: ["target_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changed_columns: string[] | null
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          row_id: string | null
          table_name: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_columns?: string[] | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          row_id?: string | null
          table_name: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_columns?: string[] | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          row_id?: string | null
          table_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_login_events: {
        Row: {
          at: string
          endpoint: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          at?: string
          endpoint: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          at?: string
          endpoint?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_mfa_recovery_codes: {
        Row: {
          code_hash: string
          generated_at: string
          id: string
          used_at: string | null
          used_ip: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          generated_at?: string
          id?: string
          used_at?: string | null
          used_ip?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          generated_at?: string
          id?: string
          used_at?: string | null
          used_ip?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          endpoint: string
          id: string
          identifier: string
          updated_at: string
          window_start: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          endpoint: string
          id?: string
          identifier: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          endpoint?: string
          id?: string
          identifier?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      automation_dispatches: {
        Row: {
          dispatch_key: string
          dispatched_at: string
          entity_id: string
          entity_type: string
          rule_id: string
          run_id: string | null
          tenant_id: string
        }
        Insert: {
          dispatch_key: string
          dispatched_at?: string
          entity_id: string
          entity_type: string
          rule_id: string
          run_id?: string | null
          tenant_id: string
        }
        Update: {
          dispatch_key?: string
          dispatched_at?: string
          entity_id?: string
          entity_type?: string
          rule_id?: string
          run_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_dispatches_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_dispatches_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_dispatches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_key: string
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          name: string
          tenant_id: string
          trigger_config: Json
          trigger_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_config?: Json
          action_key: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
          tenant_id: string
          trigger_config?: Json
          trigger_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_config?: Json
          action_key?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          tenant_id?: string
          trigger_config?: Json
          trigger_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          action_failed_count: number
          action_ok_count: number
          created_at: string
          error: string | null
          id: string
          match_count: number
          rule_id: string
          tenant_id: string
          trigger_key: string
        }
        Insert: {
          action_failed_count?: number
          action_ok_count?: number
          created_at?: string
          error?: string | null
          id?: string
          match_count?: number
          rule_id: string
          tenant_id: string
          trigger_key: string
        }
        Update: {
          action_failed_count?: number
          action_ok_count?: number
          created_at?: string
          error?: string | null
          id?: string
          match_count?: number
          rule_id?: string
          tenant_id?: string
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_line_items: {
        Row: {
          created_at: string
          description: string
          document_kind: Database["public"]["Enums"]["billing_document_kind"]
          gross_cents: number
          id: string
          invoice_id: string | null
          net_cents: number
          offer_id: string | null
          position: number
          quantity: number
          tax_cents: number
          tax_rate: number
          tenant_id: string
          unit: string | null
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          description: string
          document_kind: Database["public"]["Enums"]["billing_document_kind"]
          gross_cents?: number
          id?: string
          invoice_id?: string | null
          net_cents?: number
          offer_id?: string | null
          position: number
          quantity?: number
          tax_cents?: number
          tax_rate?: number
          tenant_id: string
          unit?: string | null
          unit_price_cents?: number
        }
        Update: {
          created_at?: string
          description?: string
          document_kind?: Database["public"]["Enums"]["billing_document_kind"]
          gross_cents?: number
          id?: string
          invoice_id?: string | null
          net_cents?: number
          offer_id?: string | null
          position?: number
          quantity?: number
          tax_cents?: number
          tax_rate?: number
          tenant_id?: string
          unit?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          floors: number | null
          id: string
          name: string
          notes: string | null
          property_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          year_built: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          floors?: number | null
          id?: string
          name: string
          notes?: string | null
          property_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          year_built?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          floors?: number | null
          id?: string
          name?: string
          notes?: string | null
          property_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_run_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          help_text: string | null
          id: string
          kind: string
          label: string
          max_value: number | null
          min_value: number | null
          note: string | null
          position: number
          required: boolean
          run_id: string
          template_item_id: string | null
          tenant_id: string
          unit: string | null
          updated_at: string
          value_bool: boolean | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          help_text?: string | null
          id?: string
          kind: string
          label: string
          max_value?: number | null
          min_value?: number | null
          note?: string | null
          position: number
          required?: boolean
          run_id: string
          template_item_id?: string | null
          tenant_id: string
          unit?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          help_text?: string | null
          id?: string
          kind?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          note?: string | null
          position?: number
          required?: boolean
          run_id?: string
          template_item_id?: string | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_run_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_run_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          notes: string | null
          property_id: string | null
          started_at: string
          started_by: string | null
          status: string
          template_id: string
          tenant_id: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          property_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          template_id: string
          tenant_id: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          property_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          template_id?: string
          tenant_id?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          help_text: string | null
          id: string
          kind: string
          label: string
          max_value: number | null
          min_value: number | null
          position: number
          required: boolean
          template_id: string
          tenant_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          help_text?: string | null
          id?: string
          kind?: string
          label: string
          max_value?: number | null
          min_value?: number | null
          position: number
          required?: boolean
          template_id: string
          tenant_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          help_text?: string | null
          id?: string
          kind?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          position?: number
          required?: boolean
          template_id?: string
          tenant_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_reports: {
        Row: {
          building_id: string | null
          category: string | null
          code: string | null
          converted_work_order_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location_details: string | null
          priority: string
          property_id: string
          rejection_reason: string | null
          reporter_contact: string | null
          reporter_kind: string
          reporter_name: string | null
          reporter_user_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          building_id?: string | null
          category?: string | null
          code?: string | null
          converted_work_order_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location_details?: string | null
          priority?: string
          property_id: string
          rejection_reason?: string | null
          reporter_contact?: string | null
          reporter_kind?: string
          reporter_name?: string | null
          reporter_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          building_id?: string | null
          category?: string | null
          code?: string | null
          converted_work_order_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location_details?: string | null
          priority?: string
          property_id?: string
          rejection_reason?: string | null
          reporter_contact?: string | null
          reporter_kind?: string
          reporter_name?: string | null
          reporter_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_reports_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_reports_converted_work_order_id_fkey"
            columns: ["converted_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_reports_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          byte_size: number
          caption: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          kind: string
          mime_type: string
          original_filename: string
          property_id: string | null
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          byte_size: number
          caption?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          kind?: string
          mime_type: string
          original_filename: string
          property_id?: string | null
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          byte_size?: number
          caption?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          kind?: string
          mime_type?: string
          original_filename?: string
          property_id?: string | null
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          created_by: string | null
          employment_status: string
          hire_date: string | null
          hourly_rate: number | null
          id: string
          notes: string | null
          phone: string | null
          skills: string[]
          tenant_id: string
          termination_date: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employment_status?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          phone?: string | null
          skills?: string[]
          tenant_id: string
          termination_date?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employment_status?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          phone?: string | null
          skills?: string[]
          tenant_id?: string
          termination_date?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bill_to_address: string | null
          bill_to_name: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          gross_total_cents: number
          id: string
          issued_at: string | null
          net_total_cents: number
          notes: string | null
          offer_id: string | null
          owner_id: string | null
          paid_at: string | null
          property_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tax_total_cents: number
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          work_order_id: string | null
        }
        Insert: {
          bill_to_address?: string | null
          bill_to_name: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          gross_total_cents?: number
          id?: string
          issued_at?: string | null
          net_total_cents?: number
          notes?: string | null
          offer_id?: string | null
          owner_id?: string | null
          paid_at?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_total_cents?: number
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          work_order_id?: string | null
        }
        Update: {
          bill_to_address?: string | null
          bill_to_name?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          gross_total_cents?: number
          id?: string
          issued_at?: string | null
          net_total_cents?: number
          notes?: string | null
          offer_id?: string | null
          owner_id?: string | null
          paid_at?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_total_cents?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      key_handovers: {
        Row: {
          copies_count: number
          created_at: string
          expected_return_at: string | null
          happened_at: string
          holder_contact: string | null
          holder_kind: string | null
          holder_name: string | null
          holder_user_id: string | null
          id: string
          issue_handover_id: string | null
          key_id: string
          kind: string
          note: string | null
          performed_by: string | null
          property_id: string
          reference_work_order_id: string | null
          tenant_id: string
        }
        Insert: {
          copies_count?: number
          created_at?: string
          expected_return_at?: string | null
          happened_at?: string
          holder_contact?: string | null
          holder_kind?: string | null
          holder_name?: string | null
          holder_user_id?: string | null
          id?: string
          issue_handover_id?: string | null
          key_id: string
          kind: string
          note?: string | null
          performed_by?: string | null
          property_id: string
          reference_work_order_id?: string | null
          tenant_id: string
        }
        Update: {
          copies_count?: number
          created_at?: string
          expected_return_at?: string | null
          happened_at?: string
          holder_contact?: string | null
          holder_kind?: string | null
          holder_name?: string | null
          holder_user_id?: string | null
          id?: string
          issue_handover_id?: string | null
          key_id?: string
          kind?: string
          note?: string | null
          performed_by?: string | null
          property_id?: string
          reference_work_order_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_handovers_issue_handover_id_fkey"
            columns: ["issue_handover_id"]
            isOneToOne: false
            referencedRelation: "key_handovers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_handovers_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_handovers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_handovers_reference_work_order_id_fkey"
            columns: ["reference_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_handovers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      keys: {
        Row: {
          building_id: string | null
          code: string | null
          copies_total: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          identifier: string | null
          kind: string
          label: string
          notes: string | null
          property_id: string
          status: string
          storage_location: string | null
          tenant_id: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          building_id?: string | null
          code?: string | null
          copies_total?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          identifier?: string | null
          kind?: string
          label: string
          notes?: string | null
          property_id: string
          status?: string
          storage_location?: string | null
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          building_id?: string | null
          code?: string | null
          copies_total?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          identifier?: string | null
          kind?: string
          label?: string
          notes?: string | null
          property_id?: string
          status?: string
          storage_location?: string | null
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keys_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keys_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keys_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          active: boolean
          assigned_role: string | null
          building_id: string | null
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          estimated_minutes: number | null
          id: string
          interval_days: number
          last_completed_at: string | null
          next_due_at: string
          notes: string | null
          priority: string
          property_id: string
          tenant_id: string
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          assigned_role?: string | null
          building_id?: string | null
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          interval_days: number
          last_completed_at?: string | null
          next_due_at?: string
          notes?: string | null
          priority?: string
          property_id: string
          tenant_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          assigned_role?: string | null
          building_id?: string | null
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          interval_days?: number
          last_completed_at?: string | null
          next_due_at?: string
          notes?: string | null
          priority?: string
          property_id?: string
          tenant_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category: string
          code: string | null
          created_at: string
          created_by: string | null
          current_stock: number
          deleted_at: string | null
          id: string
          label: string
          min_stock: number
          notes: string | null
          sku: string | null
          status: string
          storage_location: string | null
          supplier: string | null
          tenant_id: string
          unit: string
          unit_cost: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          deleted_at?: string | null
          id?: string
          label: string
          min_stock?: number
          notes?: string | null
          sku?: string | null
          status?: string
          storage_location?: string | null
          supplier?: string | null
          tenant_id: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          deleted_at?: string | null
          id?: string
          label?: string
          min_stock?: number
          notes?: string | null
          sku?: string | null
          status?: string
          storage_location?: string | null
          supplier?: string | null
          tenant_id?: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          is_owner: boolean
          status: string
          tenant_id: string
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_owner?: boolean
          status?: string
          tenant_id: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_owner?: boolean
          status?: string
          tenant_id?: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_thread_participants: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          last_read_at: string | null
          tenant_id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          last_read_at?: string | null
          tenant_id: string
          thread_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          last_read_at?: string | null
          tenant_id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_thread_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          context_id: string | null
          context_type: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          subject: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          subject: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          sent_at: string
          tenant_id: string
          thread_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          sent_at?: string
          tenant_id: string
          thread_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          sent_at?: string
          tenant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_reset: boolean
          meter_id: string
          note: string | null
          property_id: string
          read_at: string
          reading: number
          reference_work_order_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_reset?: boolean
          meter_id: string
          note?: string | null
          property_id: string
          read_at?: string
          reading: number
          reference_work_order_id?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_reset?: boolean
          meter_id?: string
          note?: string | null
          property_id?: string
          read_at?: string
          reading?: number
          reference_work_order_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_reference_work_order_id_fkey"
            columns: ["reference_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meters: {
        Row: {
          building_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          digits_after: number
          digits_before: number
          id: string
          installed_at: string | null
          label: string
          last_replacement_at: string | null
          location_note: string | null
          meter_number: string | null
          notes: string | null
          property_id: string
          status: string
          tenant_id: string
          unit_id: string | null
          unit_of_measure: string
          updated_at: string
          updated_by: string | null
          utility_kind: string
        }
        Insert: {
          building_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          digits_after?: number
          digits_before?: number
          id?: string
          installed_at?: string | null
          label: string
          last_replacement_at?: string | null
          location_note?: string | null
          meter_number?: string | null
          notes?: string | null
          property_id: string
          status?: string
          tenant_id: string
          unit_id?: string | null
          unit_of_measure?: string
          updated_at?: string
          updated_by?: string | null
          utility_kind?: string
        }
        Update: {
          building_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          digits_after?: number
          digits_before?: number
          id?: string
          installed_at?: string | null
          label?: string
          last_replacement_at?: string | null
          location_note?: string | null
          meter_number?: string | null
          notes?: string | null
          property_id?: string
          status?: string
          tenant_id?: string
          unit_id?: string | null
          unit_of_measure?: string
          updated_at?: string
          updated_by?: string | null
          utility_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "meters_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          read_at: string | null
          subject: string
          tenant_id: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          read_at?: string | null
          subject: string
          tenant_id: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          subject?: string
          tenant_id?: string
          url?: string | null
          user_id?: string
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
      offers: {
        Row: {
          bill_to_address: string | null
          bill_to_name: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          gross_total_cents: number
          id: string
          issued_at: string | null
          net_total_cents: number
          notes: string | null
          owner_id: string | null
          property_id: string | null
          status: Database["public"]["Enums"]["offer_status"]
          tax_total_cents: number
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          bill_to_address?: string | null
          bill_to_name: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          gross_total_cents?: number
          id?: string
          issued_at?: string | null
          net_total_cents?: number
          notes?: string | null
          owner_id?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          tax_total_cents?: number
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          bill_to_address?: string | null
          bill_to_name?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          gross_total_cents?: number
          id?: string
          issued_at?: string | null
          net_total_cents?: number
          notes?: string | null
          owner_id?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          tax_total_cents?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_properties: {
        Row: {
          created_at: string
          owner_id: string
          property_id: string
          role: string | null
          share_percent: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          property_id: string
          role?: string | null
          share_percent?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          property_id?: string
          role?: string | null
          share_percent?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          house_number: string | null
          id: string
          kind: string
          last_name: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          street: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          house_number?: string | null
          id?: string
          kind?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          house_number?: string | null
          id?: string
          kind?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          key: string
          label_de: string
          module_key: string
          scopable: boolean
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          key: string
          label_de: string
          module_key: string
          scopable?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          key?: string
          label_de?: string
          module_key?: string
          scopable?: boolean
        }
        Relationships: []
      }
      properties: {
        Row: {
          access_notes: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          emergency_notes: string | null
          gps_lat: number | null
          gps_lng: number | null
          house_number: string | null
          id: string
          name: string
          notes: string | null
          postal_code: string | null
          property_type: string | null
          street: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_notes?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          emergency_notes?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          house_number?: string | null
          id?: string
          name: string
          notes?: string | null
          postal_code?: string | null
          property_type?: string | null
          street?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_notes?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          emergency_notes?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          house_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          postal_code?: string | null
          property_type?: string | null
          street?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_error: string | null
          last_used_at: string | null
          p256dh: string
          tenant_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          p256dh: string
          tenant_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          p256dh?: string
          tenant_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      residents: {
        Row: {
          building_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          moved_in: string | null
          moved_out: string | null
          notes: string | null
          phone: string | null
          portal_activated_at: string | null
          portal_invited_at: string | null
          property_id: string | null
          tenant_id: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          moved_in?: string | null
          moved_out?: string | null
          notes?: string | null
          phone?: string | null
          portal_activated_at?: string | null
          portal_invited_at?: string | null
          property_id?: string | null
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          moved_in?: string | null
          moved_out?: string | null
          notes?: string | null
          phone?: string | null
          portal_activated_at?: string | null
          portal_invited_at?: string | null
          property_id?: string | null
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "residents_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_entries: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          employee_id: string
          end_at: string
          id: string
          kind: string
          note: string | null
          start_at: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_at: string
          id?: string
          kind?: string
          note?: string | null
          start_at: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_at?: string
          id?: string
          kind?: string
          note?: string | null
          start_at?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_emails: {
        Row: {
          attachment_names: string[] | null
          body_hash: string | null
          cc_addresses: string[] | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["sent_email_entity"] | null
          error: string | null
          id: string
          provider: string
          provider_message_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["sent_email_status"]
          subject: string
          tenant_id: string
          to_addresses: string[]
        }
        Insert: {
          attachment_names?: string[] | null
          body_hash?: string | null
          cc_addresses?: string[] | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["sent_email_entity"] | null
          error?: string | null
          id?: string
          provider: string
          provider_message_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["sent_email_status"]
          subject: string
          tenant_id: string
          to_addresses: string[]
        }
        Update: {
          attachment_names?: string[] | null
          body_hash?: string | null
          cc_addresses?: string[] | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["sent_email_entity"] | null
          error?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["sent_email_status"]
          subject?: string
          tenant_id?: string
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sent_emails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          assignee_user_id: string | null
          building_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          material_id: string
          note: string | null
          occurred_at: string
          property_id: string | null
          quantity: number
          tenant_id: string
          unit_cost_at_time: number | null
          unit_id: string | null
          work_order_id: string | null
        }
        Insert: {
          assignee_user_id?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          material_id: string
          note?: string | null
          occurred_at?: string
          property_id?: string | null
          quantity: number
          tenant_id: string
          unit_cost_at_time?: number | null
          unit_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          assignee_user_id?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          material_id?: string
          note?: string | null
          occurred_at?: string
          property_id?: string | null
          quantity?: number
          tenant_id?: string
          unit_cost_at_time?: number | null
          unit_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          config: Json
          enabled: boolean
          module_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          enabled?: boolean
          module_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          enabled?: boolean
          module_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: Json | null
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          invoice_data: Json | null
          locale: string
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          payment_method: string
          slug: string
          status: string
          subscription_interval: "monthly" | "yearly" | null
          subscription_plan_id: string | null
          subscription_status: string
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          invoice_data?: Json | null
          locale?: string
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          payment_method?: string
          slug: string
          status?: string
          subscription_interval?: "monthly" | "yearly" | null
          subscription_plan_id?: string | null
          subscription_status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          invoice_data?: Json | null
          locale?: string
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          payment_method?: string
          slug?: string
          status?: string
          subscription_interval?: "monthly" | "yearly" | null
          subscription_plan_id?: string | null
          subscription_status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          end_at: string | null
          id: string
          kind: string
          note: string | null
          property_id: string | null
          source: string
          start_at: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          property_id?: string | null
          source?: string
          start_at: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          property_id?: string | null
          source?: string
          start_at?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_corrections: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entry_user_id: string
          id: string
          proposed_end_at: string | null
          proposed_kind: string | null
          proposed_note: string | null
          proposed_property_id: string | null
          proposed_start_at: string | null
          proposed_work_order_id: string | null
          reason: string
          requested_at: string
          requested_by: string
          status: string
          tenant_id: string
          time_entry_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entry_user_id: string
          id?: string
          proposed_end_at?: string | null
          proposed_kind?: string | null
          proposed_note?: string | null
          proposed_property_id?: string | null
          proposed_start_at?: string | null
          proposed_work_order_id?: string | null
          reason: string
          requested_at?: string
          requested_by: string
          status?: string
          tenant_id: string
          time_entry_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entry_user_id?: string
          id?: string
          proposed_end_at?: string | null
          proposed_kind?: string | null
          proposed_note?: string | null
          proposed_property_id?: string | null
          proposed_start_at?: string | null
          proposed_work_order_id?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string
          status?: string
          tenant_id?: string
          time_entry_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_corrections_proposed_property_id_fkey"
            columns: ["proposed_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_corrections_proposed_work_order_id_fkey"
            columns: ["proposed_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_corrections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_corrections_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_stops: {
        Row: {
          actual_arrival_at: string | null
          actual_departure_at: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          label: string
          note: string | null
          planned_arrival_at: string | null
          planned_departure_at: string | null
          property_id: string | null
          sequence: number
          status: string
          tenant_id: string
          tour_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_arrival_at?: string | null
          actual_departure_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          label: string
          note?: string | null
          planned_arrival_at?: string | null
          planned_departure_at?: string | null
          property_id?: string | null
          sequence: number
          status?: string
          tenant_id: string
          tour_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_arrival_at?: string | null
          actual_departure_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          label?: string
          note?: string | null
          planned_arrival_at?: string | null
          planned_departure_at?: string | null
          property_id?: string | null
          sequence?: number
          status?: string
          tenant_id?: string
          tour_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_stops_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_stops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_stops_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          code: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          driver_user_id: string | null
          id: string
          notes: string | null
          planned_date: string
          started_at: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          code?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_user_id?: string | null
          id?: string
          notes?: string | null
          planned_date?: string
          started_at?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          code?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_user_id?: string | null
          id?: string
          notes?: string | null
          planned_date?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          building_id: string
          code: string
          created_at: string
          created_by: string | null
          floor: number | null
          id: string
          notes: string | null
          property_id: string
          rooms: number | null
          size_sqm: number | null
          tenant_id: string
          unit_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          building_id: string
          code: string
          created_at?: string
          created_by?: string | null
          floor?: number | null
          id?: string
          notes?: string | null
          property_id: string
          rooms?: number | null
          size_sqm?: number | null
          tenant_id: string
          unit_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          building_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          floor?: number | null
          id?: string
          notes?: string | null
          property_id?: string
          rooms?: number | null
          size_sqm?: number | null
          tenant_id?: string
          unit_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_group_members: {
        Row: {
          user_group_id: string
          user_id: string
        }
        Insert: {
          user_group_id: string
          user_id: string
        }
        Update: {
          user_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_group_members_user_group_id_fkey"
            columns: ["user_group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role_id: string
          scope_id: string | null
          scope_type: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role_id: string
          scope_id?: string | null
          scope_type?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role_id?: string
          scope_id?: string | null
          scope_type?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          notification_prefs: Json
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          notification_prefs?: Json
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          notification_prefs?: Json
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_events: {
        Row: {
          cost_eur: number | null
          created_at: string
          created_by: string | null
          event_date: string
          id: string
          kind: string
          mileage_km: number | null
          next_due_at: string | null
          note: string | null
          tenant_id: string
          vehicle_id: string
          vendor: string | null
        }
        Insert: {
          cost_eur?: number | null
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          kind: string
          mileage_km?: number | null
          next_due_at?: string | null
          note?: string | null
          tenant_id: string
          vehicle_id: string
          vendor?: string | null
        }
        Update: {
          cost_eur?: number | null
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          kind?: string
          mileage_km?: number | null
          next_due_at?: string | null
          note?: string | null
          tenant_id?: string
          vehicle_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          fuel_type: string
          id: string
          insurance_expires_at: string | null
          license_plate: string
          make: string
          mileage_km: number | null
          model: string
          next_service_at: string | null
          next_service_due_km: number | null
          next_tuev_at: string | null
          notes: string | null
          primary_driver_user_id: string | null
          status: string
          storage_location: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vehicle_type: string
          vin: string | null
          year: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          fuel_type?: string
          id?: string
          insurance_expires_at?: string | null
          license_plate: string
          make: string
          mileage_km?: number | null
          model: string
          next_service_at?: string | null
          next_service_due_km?: number | null
          next_tuev_at?: string | null
          notes?: string | null
          primary_driver_user_id?: string | null
          status?: string
          storage_location?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vehicle_type?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          fuel_type?: string
          id?: string
          insurance_expires_at?: string | null
          license_plate?: string
          make?: string
          mileage_km?: number | null
          model?: string
          next_service_at?: string | null
          next_service_due_km?: number | null
          next_tuev_at?: string | null
          notes?: string | null
          primary_driver_user_id?: string | null
          status?: string
          storage_location?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_type?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_events: {
        Row: {
          actor_id: string | null
          comment: string | null
          created_at: string
          event_kind: string
          id: string
          new_value: Json | null
          old_value: Json | null
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          event_kind: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          tenant_id: string
          work_order_id: string
        }
        Update: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          event_kind?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_minutes: number | null
          assignee_id: string | null
          building_id: string | null
          category: string | null
          closed_at: string | null
          closed_by: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          description: string | null
          estimated_minutes: number | null
          id: string
          is_emergency: boolean
          planned_end: string | null
          planned_start: string | null
          priority: string
          property_id: string
          reporter_id: string | null
          reporter_kind: string | null
          reporter_note: string | null
          status: string
          tenant_id: string
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_minutes?: number | null
          assignee_id?: string | null
          building_id?: string | null
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_emergency?: boolean
          planned_end?: string | null
          planned_start?: string | null
          priority?: string
          property_id: string
          reporter_id?: string | null
          reporter_kind?: string | null
          reporter_note?: string | null
          status?: string
          tenant_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_minutes?: number | null
          assignee_id?: string | null
          building_id?: string | null
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_emergency?: boolean
          planned_end?: string | null
          planned_start?: string | null
          priority?: string
          property_id?: string
          reporter_id?: string | null
          reporter_kind?: string | null
          reporter_note?: string | null
          status?: string
          tenant_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_consume_auth_rate_limit: {
        Args: {
          p_block_sec: number
          p_endpoint: string
          p_identifier: string
          p_limit: number
          p_window_sec: number
        }
        Returns: {
          allowed: boolean
          retry_after_sec: number
        }[]
      }
      cleanup_expired_auth_rate_limits: { Args: never; Returns: number }
      consume_mfa_recovery_code: {
        Args: {
          p_plaintext: string
          p_used_ip: string
          p_user_id: string
        }
        Returns: boolean
      }
      count_unused_mfa_recovery_codes: {
        Args: { p_user_id: string }
        Returns: number
      }
      generate_mfa_recovery_codes_for_user: {
        Args: {
          p_plaintext_codes: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      enqueue_notification: {
        Args: {
          p_body?: string
          p_entity_id?: string
          p_entity_type?: string
          p_kind: string
          p_subject: string
          p_url?: string
          p_user_id: string
        }
        Returns: string
      }
      log_login_event: {
        Args: {
          p_endpoint: string
          p_ip: string
          p_user_agent: string
          p_user_id: string
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      provision_signup_tenant: {
        Args: {
          p_company_name: string
          p_slug: string
          p_terms_accepted_at: string
          p_user_id: string
        }
        Returns: Json
      }
      reset_auth_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
        }
        Returns: undefined
      }
    }
    Enums: {
      announcement_status: "draft" | "published" | "closed"
      announcement_target_type:
        | "all"
        | "role"
        | "users"
        | "residents"
        | "property"
      billing_document_kind: "offer" | "invoice"
      invoice_status: "draft" | "sent" | "paid" | "cancelled"
      offer_status: "draft" | "sent" | "accepted" | "declined" | "expired"
      sent_email_entity: "invoice" | "offer"
      sent_email_status: "queued" | "sent" | "failed"
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
      announcement_status: ["draft", "published", "closed"],
      announcement_target_type: [
        "all",
        "role",
        "users",
        "residents",
        "property",
      ],
      billing_document_kind: ["offer", "invoice"],
      invoice_status: ["draft", "sent", "paid", "cancelled"],
      offer_status: ["draft", "sent", "accepted", "declined", "expired"],
      sent_email_entity: ["invoice", "offer"],
      sent_email_status: ["queued", "sent", "failed"],
    },
  },
} as const
