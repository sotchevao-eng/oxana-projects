export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ProjectRowStatus = 'published' | 'draft' | 'archived'
export type ContactRowStatus = 'new' | 'in_progress' | 'done' | 'archived'

export interface ProjectImageRow {
  id: string
  project_id: string
  image_url: string
  alt: string | null
  sort_order: number
  created_at: string
}

export interface ProjectRow {
  id: string
  title: string
  slug: string
  short_description: string
  description: string
  task: string | null
  solution: string | null
  result: string | null
  category: string
  subcategory: string
  status: ProjectRowStatus
  year: number
  event_date: string | null
  cover_image: string | null
  card_image: string | null
  demo_url: string | null
  website_url: string | null
  github_url: string | null
  technologies: string[] | null
  tags: string[] | null
  featured: boolean
  sort_order: number
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  project_images?: ProjectImageRow[] | null
}

export interface ContactInsertRow {
  name: string
  company?: string | null
  email?: string | null
  phone?: string | null
  project_type?: string | null
  message: string
  status?: ContactRowStatus
}

export interface ContactRow {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  project_type: string | null
  message: string
  status: ContactRowStatus
  created_at: string
}

export interface SiteSettingsRow {
  id: string
  site_name: string
  subtitle: string | null
  description: string | null
  email: string | null
  phone: string | null
  telegram: string | null
  vk: string | null
  github: string | null
  hero_image: string | null
  updated_at: string
}

export interface ClientRow {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  messenger: string | null
  notes: string | null
  created_at: string
}

export interface ClientProjectRow {
  id: string
  client_id: string
  title: string
  project_type: string
  description: string | null
  task: string | null
  notes: string | null
  budget: string | null
  deadline: string | null
  status: string
  brief_token: string
  proposal_token: string
  created_at: string
  updated_at: string
  clients?: ClientRow | ClientRow[] | null
}

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow
        Insert: {
          id?: string
          title: string
          slug: string
          short_description: string
          description: string
          task?: string | null
          solution?: string | null
          result?: string | null
          category: string
          subcategory?: string
          status?: ProjectRowStatus
          year: number
          event_date?: string | null
          cover_image?: string | null
          card_image?: string | null
          demo_url?: string | null
          website_url?: string | null
          github_url?: string | null
          technologies?: string[] | null
          tags?: string[] | null
          featured?: boolean
          sort_order?: number
          seo_title?: string | null
          seo_description?: string | null
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
        Relationships: []
      }
      project_images: {
        Row: ProjectImageRow
        Insert: {
          id?: string
          project_id: string
          image_url: string
          alt?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['project_images']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'project_images_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      contacts: {
        Row: ContactRow
        Insert: ContactInsertRow
        Update: Partial<ContactInsertRow>
        Relationships: []
      }
      site_settings: {
        Row: SiteSettingsRow
        Insert: {
          id?: string
          site_name?: string
          subtitle?: string | null
          description?: string | null
          email?: string | null
          phone?: string | null
          telegram?: string | null
          vk?: string | null
          github?: string | null
          hero_image?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['site_settings']['Insert']>
        Relationships: []
      }
      clients: {
        Row: ClientRow
        Insert: {
          id?: string
          name: string
          company?: string | null
          email?: string | null
          phone?: string | null
          messenger?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: []
      }
      client_projects: {
        Row: ClientProjectRow
        Insert: {
          id?: string
          client_id: string
          title: string
          project_type: string
          description?: string | null
          task?: string | null
          notes?: string | null
          budget?: string | null
          deadline?: string | null
          status?: string
          brief_token: string
          proposal_token: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Omit<Database['public']['Tables']['client_projects']['Insert'], 'brief_token' | 'proposal_token'>
        > & {
          brief_token?: string
          proposal_token?: string
        }
        Relationships: [
          {
            foreignKeyName: 'client_projects_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
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
