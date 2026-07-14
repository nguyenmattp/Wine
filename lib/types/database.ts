export type Bucket = "liked" | "fine" | "disliked";
export type Visibility = "default" | "private" | "public";
export type WineType =
  | "red"
  | "white"
  | "rose"
  | "sparkling"
  | "dessert"
  | "fortified"
  | "orange";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  created_at: string;
}

export type Producer = {
  id: string;
  name: string;
  normalized_name: string;
  country: string | null;
  region: string | null;
  external_ref: Record<string, unknown> | null;
  created_by: string | null;
  is_deleted: boolean;
  created_at: string;
}

export type Wine = {
  id: string;
  producer_id: string;
  name: string;
  normalized_name: string;
  varietal: string[];
  region: string | null;
  country: string | null;
  vintage: number | null;
  wine_type: WineType | null;
  external_ref: Record<string, unknown> | null;
  created_by: string | null;
  is_deleted: boolean;
  created_at: string;
}

export type WineLog = {
  id: string;
  user_id: string;
  wine_id: string;
  bucket: Bucket;
  score: number;
  rank_in_bucket: number;
  notes: string | null;
  photo_url: string | null;
  visibility: Visibility;
  tasted_at: string;
  client_log_id: string | null;
  created_at: string;
  updated_at: string;
}

export type WineLogWithWine = WineLog & {
  wine: Wine & { producer: Producer };
}

export type Follow = {
  follower_id: string;
  followee_id: string;
  status: "pending" | "accepted";
  created_at: string;
}

export type FeedEntry = WineLogWithWine & {
  actor: { username: string; display_name: string | null } | null;
}

// Hand-authored to mirror the SQL migrations in supabase/migrations/.
// Regenerate with `supabase gen types typescript` once the project is
// linked to a live Supabase instance, if the two drift.
export type ScoreBand = {
  bucket: Bucket;
  band_min: number;
  band_max: number;
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      producers: {
        Row: Producer;
        Insert: Partial<Producer>;
        Update: Partial<Producer>;
        Relationships: [];
      };
      wines: {
        Row: Wine;
        Insert: Partial<Wine>;
        Update: Partial<Wine>;
        Relationships: [
          {
            foreignKeyName: "wines_producer_id_fkey";
            columns: ["producer_id"];
            isOneToOne: false;
            referencedRelation: "producers";
            referencedColumns: ["id"];
          },
        ];
      };
      wine_logs: {
        Row: WineLog;
        Insert: Partial<WineLog>;
        Update: Partial<WineLog>;
        Relationships: [
          {
            foreignKeyName: "wine_logs_wine_id_fkey";
            columns: ["wine_id"];
            isOneToOne: false;
            referencedRelation: "wines";
            referencedColumns: ["id"];
          },
        ];
      };
      score_bands: {
        Row: ScoreBand;
        Insert: Partial<ScoreBand>;
        Update: Partial<ScoreBand>;
        Relationships: [];
      };
      follows: {
        Row: Follow;
        Insert: Partial<Follow>;
        Update: Partial<Follow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_find_or_create_wine: {
        Args: {
          p_producer_name: string;
          p_producer_region: string | null;
          p_producer_country: string | null;
          p_wine_name: string;
          p_vintage: number | null;
          p_varietal: string[];
          p_wine_type: WineType | null;
          p_region: string | null;
          p_country: string | null;
        };
        Returns: string;
      };
      fn_update_wine_log: {
        Args: {
          p_log_id: string;
          p_bucket: Bucket;
          p_notes: string | null;
          p_tasted_at: string | null;
          p_visibility: Visibility | null;
        };
        Returns: WineLog;
      };
      fn_insert_wine_log: {
        Args: {
          p_wine_id: string;
          p_bucket: Bucket;
          p_prev_log_id: string | null;
          p_next_log_id: string | null;
          p_notes: string | null;
          p_photo_url: string | null;
          p_visibility: Visibility | null;
          p_tasted_at: string | null;
          p_client_log_id: string;
        };
        Returns: WineLog;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
