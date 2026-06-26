import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export interface Profile {
  id: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  role?: string | null; // from user_roles via RPC, NOT from profiles table
  createdAt: string | null;
}

export interface ProfileInput {
  fullName?: string;
  email?: string;
  mobile?: string;
}

export const useProfiles = () => {
  const { user, isAdmin } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (dbError) throw dbError;

      if (data) {
        setProfile({
          id: data.id,
          fullName: data.full_name,
          email: data.email,
          mobile: data.mobile,
          createdAt: data.created_at,
        });
      }
    } catch (err: any) {
      console.error("Error fetching profile:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchAllProfiles = useCallback(async (): Promise<Profile[]> => {
    if (!isAdmin) return [];

    try {
      const { data, error: dbError } = await supabase
        .rpc("get_user_profiles_admin");

      if (dbError) throw dbError;

      const formatted: Profile[] = (data || []).map((p: any) => ({
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        mobile: p.mobile,
        role: p.role,
        createdAt: p.created_at,
      }));

      setProfiles(formatted);
      return formatted;
    } catch (err: any) {
      console.error("Error fetching all profiles:", err);
      return [];
    }
  }, [isAdmin]);

  const updateProfile = useCallback(async (input: ProfileInput): Promise<boolean> => {
    if (!user) {
      toast.error("Please login");
      return false;
    }

    try {
      const updateData: any = {};
      if (input.fullName !== undefined) updateData.full_name = input.fullName;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.mobile !== undefined) updateData.mobile = input.mobile;

      const { error: dbError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (dbError) throw dbError;

      toast.success("Profile updated!");
      await fetchProfile();
      return true;
    } catch (err: any) {
      console.error("Error updating profile:", err);
      toast.error(err.message || "Failed to update");
      return false;
    }
  }, [user, fetchProfile]);

  const createProfile = useCallback(async (_userId: string, _fullName: string): Promise<boolean> => {
    return true;
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    profiles,
    loading,
    error,
    fetchProfile,
    fetchAllProfiles,
    updateProfile,
    createProfile,
  };
};
