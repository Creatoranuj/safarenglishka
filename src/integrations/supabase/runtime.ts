import { supabase } from "./client";

type SupabaseRuntimeClient = {
  supabaseUrl?: string;
  supabaseKey?: string;
};

const runtimeClient = supabase as unknown as SupabaseRuntimeClient;

/**
 * Canonical runtime configuration used by direct Edge Function URLs.
 *
 * The generated client is the source of truth. Build-time VITE_* values can
 * remain stale after reconnecting a project (notably in preview/APK secrets),
 * which otherwise sends a valid session JWT to a different Supabase project
 * and produces a misleading 401.
 */
export const supabaseRuntimeUrl = runtimeClient.supabaseUrl ?? "https://wegamscqtvqhxowlskfm.supabase.co";
export const supabaseRuntimeKey = runtimeClient.supabaseKey ?? "";

export const supabaseFunctionsUrl = (functionName: string): string => {
  if (!supabaseRuntimeUrl) throw new Error("Supabase client URL is unavailable");
  return `${supabaseRuntimeUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
};