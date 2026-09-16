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
      applications: {
        Row: {
          agent_state: string
          company: string | null
          confirmation_message: string | null
          created_at: string
          id: string
          job_url: string
          missing_information: Json
          notes: string | null
          page_snapshot: Json | null
          resume_file_name: string | null
          resume_id: string | null
          role_title: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_answers: Json
          user_id: string
          worker_claimed_at: string | null
        }
        Insert: {
          agent_state?: string
          company?: string | null
          confirmation_message?: string | null
          created_at?: string
          id?: string
          job_url: string
          missing_information?: Json
          notes?: string | null
          page_snapshot?: Json | null
          resume_file_name?: string | null
          resume_id?: string | null
          role_title?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_answers?: Json
          user_id: string
          worker_claimed_at?: string | null
        }
        Update: {
          agent_state?: string
          company?: string | null
          confirmation_message?: string | null
          created_at?: string
          id?: string
          job_url?: string
          missing_information?: Json
          notes?: string | null
          page_snapshot?: Json | null
          resume_file_name?: string | null
          resume_id?: string | null
          role_title?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_answers?: Json
          user_id?: string
          worker_claimed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          application_id: string | null
          created_at: string
          detail: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          application_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          application_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      education_records: {
        Row: {
          backlogs: string | null
          branch: string | null
          cgpa: string | null
          college: string | null
          coursework: string | null
          created_at: string
          degree: string | null
          graduation_year: string | null
          id: string
          location: string | null
          percentage: string | null
          sort_order: number
          start_year: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          backlogs?: string | null
          branch?: string | null
          cgpa?: string | null
          college?: string | null
          coursework?: string | null
          created_at?: string
          degree?: string | null
          graduation_year?: string | null
          id?: string
          location?: string | null
          percentage?: string | null
          sort_order?: number
          start_year?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          backlogs?: string | null
          branch?: string | null
          cgpa?: string | null
          college?: string | null
          coursework?: string | null
          created_at?: string
          degree?: string | null
          graduation_year?: string | null
          id?: string
          location?: string | null
          percentage?: string | null
          sort_order?: number
          start_year?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      experience_records: {
        Row: {
          company: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          end_date: string | null
          id: string
          is_current: boolean
          location: string | null
          sort_order: number
          start_date: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          location?: string | null
          sort_order?: number
          start_date?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          location?: string | null
          sort_order?: number
          start_date?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      field_mappings: {
        Row: {
          action: string
          application_id: string
          confidence: number
          created_at: string
          field_label: string
          field_selector: string | null
          field_type: string | null
          fill_status: string
          id: string
          is_required: boolean
          mapped_value: string | null
          options: Json
          source: string
          understood_as: string | null
          updated_at: string
          user_id: string
          validation_error: string | null
        }
        Insert: {
          action?: string
          application_id: string
          confidence?: number
          created_at?: string
          field_label: string
          field_selector?: string | null
          field_type?: string | null
          fill_status?: string
          id?: string
          is_required?: boolean
          mapped_value?: string | null
          options?: Json
          source?: string
          understood_as?: string | null
          updated_at?: string
          user_id: string
          validation_error?: string | null
        }
        Update: {
          action?: string
          application_id?: string
          confidence?: number
          created_at?: string
          field_label?: string
          field_selector?: string | null
          field_type?: string | null
          fill_status?: string
          id?: string
          is_required?: boolean
          mapped_value?: string | null
          options?: Json
          source?: string
          understood_as?: string | null
          updated_at?: string
          user_id?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_mappings_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          application_id: string
          created_at: string
          field_mapping_id: string | null
          id: string
          input_type: string
          kind: string
          options: Json
          question: string
          save_to_profile: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          application_id: string
          created_at?: string
          field_mapping_id?: string | null
          id?: string
          input_type?: string
          kind?: string
          options?: Json
          question: string
          save_to_profile?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          application_id?: string
          created_at?: string
          field_mapping_id?: string | null
          id?: string
          input_type?: string
          kind?: string
          options?: Json
          question?: string
          save_to_profile?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_questions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_questions_field_mapping_id_fkey"
            columns: ["field_mapping_id"]
            isOneToOne: false
            referencedRelation: "field_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          certifications: string | null
          citizenship: string | null
          city: string | null
          cloud_skills: string | null
          country: string | null
          created_at: string
          databases: string | null
          date_of_birth: string | null
          email: string | null
          employment_status: string | null
          expected_salary: string | null
          first_name: string | null
          frameworks: string | null
          gender: string | null
          github_url: string | null
          id: string
          internship_experience: string | null
          last_name: string | null
          linkedin_url: string | null
          middle_name: string | null
          notice_period: string | null
          other_urls: string | null
          phone: string | null
          pincode: string | null
          portfolio_url: string | null
          preferred_job_type: string | null
          preferred_locations: string | null
          preferred_name: string | null
          programming_languages: string | null
          pronouns: string | null
          state: string | null
          updated_at: string
          willing_to_relocate: string | null
          work_authorization: string | null
          work_mode: string | null
          years_of_experience: string | null
        }
        Insert: {
          address?: string | null
          certifications?: string | null
          citizenship?: string | null
          city?: string | null
          cloud_skills?: string | null
          country?: string | null
          created_at?: string
          databases?: string | null
          date_of_birth?: string | null
          email?: string | null
          employment_status?: string | null
          expected_salary?: string | null
          first_name?: string | null
          frameworks?: string | null
          gender?: string | null
          github_url?: string | null
          id: string
          internship_experience?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          middle_name?: string | null
          notice_period?: string | null
          other_urls?: string | null
          phone?: string | null
          pincode?: string | null
          portfolio_url?: string | null
          preferred_job_type?: string | null
          preferred_locations?: string | null
          preferred_name?: string | null
          programming_languages?: string | null
          pronouns?: string | null
          state?: string | null
          updated_at?: string
          willing_to_relocate?: string | null
          work_authorization?: string | null
          work_mode?: string | null
          years_of_experience?: string | null
        }
        Update: {
          address?: string | null
          certifications?: string | null
          citizenship?: string | null
          city?: string | null
          cloud_skills?: string | null
          country?: string | null
          created_at?: string
          databases?: string | null
          date_of_birth?: string | null
          email?: string | null
          employment_status?: string | null
          expected_salary?: string | null
          first_name?: string | null
          frameworks?: string | null
          gender?: string | null
          github_url?: string | null
          id?: string
          internship_experience?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          middle_name?: string | null
          notice_period?: string | null
          other_urls?: string | null
          phone?: string | null
          pincode?: string | null
          portfolio_url?: string | null
          preferred_job_type?: string | null
          preferred_locations?: string | null
          preferred_name?: string | null
          programming_languages?: string | null
          pronouns?: string | null
          state?: string | null
          updated_at?: string
          willing_to_relocate?: string | null
          work_authorization?: string | null
          work_mode?: string | null
          years_of_experience?: string | null
        }
        Relationships: []
      }
      resumes: {
        Row: {
          created_at: string
          extracted: Json | null
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          parse_error: string | null
          parse_status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted?: Json | null
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted?: Json | null
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      run_steps: {
        Row: {
          application_id: string
          created_at: string
          detail: string | null
          id: string
          label: string
          sort_order: number
          state: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          detail?: string | null
          id?: string
          label: string
          sort_order?: number
          state: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          label?: string
          sort_order?: number
          state?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_answers: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_credentials: {
        Row: {
          created_at: string
          id: string
          secret_ciphertext: string
          site_host: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          secret_ciphertext: string
          site_host: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          secret_ciphertext?: string
          site_host?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
