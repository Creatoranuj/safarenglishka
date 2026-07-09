import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, User, Mail, Shield, LogOut, Phone, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ProfileAvatar from "../components/profile/ProfileAvatar";
import AvatarUploadModal from "../components/profile/AvatarUploadModal";
import { logger } from "../lib/logger";

const Profile = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const { role, refetchUserData, profile: authProfile, user: authUser } = useAuth();

  // Seed UI from the AuthContext cache so the page renders instantly — no
  // spinner flash. We still refresh from Supabase in the background to pick
  // up any out-of-band changes (e.g. avatar updated on another device).
  const initialProfile = authProfile
    ? {
        id: authProfile.id,
        email: authProfile.email,
        full_name: authProfile.fullName,
        avatar_url: authProfile.avatarUrl,
        mobile: authProfile.mobile,
      }
    : null;
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<any>(initialProfile);
  const [nameInput, setNameInput] = useState(initialProfile?.full_name ?? "");
  const [mobileInput, setMobileInput] = useState(initialProfile?.mobile ?? "");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);

  useEffect(() => {
    // Background refresh — no spinner; UI already painted from auth cache.
    void getProfile();
  }, []);

  const getProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (error) throw error;

      if (data) {
        setProfile(data);
        // Don't clobber what the user is typing.
        if (!isEditing) {
          setNameInput(data.full_name || "");
          setMobileInput(data.mobile || "");
        }
      } else {
        const newProfile = { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || "" };
        setProfile(newProfile);
        if (!isEditing) setNameInput(newProfile.full_name);
      }
    } catch (error: any) {
      logger.error("Error fetching profile", error);
      // Silent — the cached auth profile is already on screen. Only toast
      // if we have nothing to show at all.
      if (!profile && !authUser) {
        toast.error("Failed to load profile");
      }
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    try {
      const { error } = await supabase
        .from('profiles').update({ full_name: nameInput, mobile: mobileInput }).eq('id', profile.id);
      if (error) throw error;
      toast.success("Profile updated successfully!");
      setProfile({ ...profile, full_name: nameInput, mobile: mobileInput });
      setIsEditing(false);
      await refetchUserData();
    } catch (error: any) {
      toast.error("Failed to update profile");
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logged out successfully");
      navigate("/");
    } catch (error) {
      logger.error("Error logging out", error);
    }
  };

  // No more fullPage spinner — render immediately from the auth cache.
  if (!profile) {
    // Truly cold (no auth cache yet) — keep this branch silent; the global
    // auth bootstrap will redirect to /login if there's no session.
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      {/* Header already renders its own spacer (see Header.tsx line 72) to
          reserve room for the fixed top bar. The extra spacer that used to
          live here caused a ~52px white strip between the header and the
          blue Profile banner on mobile — removed. */}


      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-primary-foreground hover:bg-primary-foreground/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">Profile</h1>
      </div>

      <main className="flex-1 p-4 space-y-6 pb-20 md:pb-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-center py-6">
          <div className="relative">
            <ProfileAvatar
              avatarUrl={profile.avatar_url}
              fullName={profile.full_name}
              userId={profile.id}
              size="md"
              onClick={() => setAvatarModalOpen(true)}
            />
            <Button
              size="icon"
              aria-label="Change profile picture"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary hover:bg-primary/90"
              onClick={() => setAvatarModalOpen(true)}
            >
              <User className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">{profile.full_name || "No Name"}</h2>
          <p className="text-sm text-muted-foreground capitalize">{role || "User"}</p>
        </div>

        {/* Avatar Upload Modal */}
        <AvatarUploadModal
          isOpen={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          userId={profile.id}
          currentAvatarUrl={profile.avatar_url}
          fullName={profile.full_name}
          onUploadComplete={(url) => {
            setProfile({ ...profile, avatar_url: url });
            void refetchUserData();
          }}
        />

        {/* Profile Info */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <h3 className="text-lg font-semibold text-foreground">Personal Information</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" /> Full Name
              </Label>
              <Input id="name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} disabled={!isEditing} className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" /> Mobile Number
              </Label>
              <Input id="mobile" type="tel" value={mobileInput} onChange={(e) => setMobileInput(e.target.value)} disabled={!isEditing} placeholder="Enter mobile number" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" /> Email
              </Label>
              <Input id="email" value={profile.email || ""} disabled className="bg-muted border-border" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" /> Role
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 py-2 rounded-md bg-muted border border-border text-sm text-muted-foreground capitalize">
                  {role || "member"}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={async () => {
                    await refetchUserData();
                    toast.success("Role refreshed");
                  }}
                  title="Refresh role"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => { setNameInput(profile.full_name); setMobileInput(profile.mobile || ""); setIsEditing(false); }} className="flex-1">Cancel</Button>
                <Button onClick={handleSave} className="flex-1 bg-primary hover:bg-primary/90">Save Changes</Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} variant="outline" className="w-full">Edit Profile</Button>
            )}
          </div>
        </div>


        <Button onClick={handleLogout} variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground gap-2">
          <LogOut className="h-5 w-5" /> Sign Out
        </Button>
      </main>

    </div>
  );
};

export default Profile;
