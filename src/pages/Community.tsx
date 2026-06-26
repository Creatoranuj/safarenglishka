/**
 * Community.tsx — Admin-driven community feed with Notion page embeds,
 * member comments and likes. Notion pages are embedded via iframe from
 * the public "Share to web" URL (no Notion API needed → free-tier friendly).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  ArrowLeft, Plus, Pin, Heart, MessageCircle, Trash2,
  ExternalLink, Loader2, Users, Send,
} from "lucide-react";

type Post = {
  id: string;
  author_id: string;
  title: string;
  body: string | null;
  notion_url: string | null;
  is_pinned: boolean;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
};

/**
 * Convert a Notion "Share to web" page URL into the embeddable URL.
 * Notion's share URL works directly inside an iframe.
 */
function toNotionEmbedUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!url.hostname.includes("notion.")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const Community = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const { user, isAdmin, isAuthenticated, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [loading, setLoading] = useState(true);

  // create post form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [pinned, setPinned] = useState(false);
  const [creating, setCreating] = useState(false);

  // comment input per post
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  const loadAll = async () => {
    setLoading(true);
    const { data: postsData, error } = await supabase
      .from("community_posts")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load community");
      setLoading(false);
      return;
    }
    setPosts((postsData ?? []) as Post[]);

    const ids = (postsData ?? []).map(p => p.id);
    if (ids.length === 0) {
      setLoading(false);
      return;
    }

    const [{ data: cmts }, { data: reacts }] = await Promise.all([
      supabase.from("community_comments").select("*").in("post_id", ids).order("created_at"),
      supabase.from("community_reactions").select("post_id,user_id").in("post_id", ids),
    ]);

    const grouped: Record<string, Comment[]> = {};
    (cmts ?? []).forEach(c => {
      (grouped[c.post_id] ||= []).push(c as Comment);
    });
    setComments(grouped);

    const likeMap: Record<string, { count: number; liked: boolean }> = {};
    ids.forEach(id => { likeMap[id] = { count: 0, liked: false }; });
    (reacts ?? []).forEach(r => {
      const slot = (likeMap[r.post_id] ||= { count: 0, liked: false });
      slot.count += 1;
      if (user && r.user_id === user.id) slot.liked = true;
    });
    setLikes(likeMap);
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    if (notionUrl && !toNotionEmbedUrl(notionUrl)) {
      toast.error("Notion URL me notion.so / notion.site domain hona chahiye");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("community_posts").insert({
      author_id: user.id,
      title: title.trim(),
      body: body.trim() || null,
      notion_url: notionUrl.trim() || null,
      is_pinned: pinned,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Post published");
    setTitle(""); setBody(""); setNotionUrl(""); setPinned(false);
    setShowCreate(false);
    loadAll();
  };

  const handleDeletePost = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this post?", variant: "destructive" }))) return;
    const { error } = await supabase.from("community_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    loadAll();
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;
    const cur = likes[postId];
    if (cur?.liked) {
      await supabase.from("community_reactions").delete()
        .eq("post_id", postId).eq("user_id", user.id);
      setLikes(s => ({ ...s, [postId]: { count: Math.max(0, (s[postId]?.count ?? 1) - 1), liked: false } }));
    } else {
      await supabase.from("community_reactions").insert({ post_id: postId, user_id: user.id });
      setLikes(s => ({ ...s, [postId]: { count: (s[postId]?.count ?? 0) + 1, liked: true } }));
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!user) return;
    const text = (commentDraft[postId] ?? "").trim();
    if (!text) return;
    const userName = user.fullName || user.email?.split("@")[0] || "Member";
    const { data, error } = await supabase.from("community_comments").insert({
      post_id: postId, user_id: user.id, user_name: userName, body: text,
    }).select().single();
    if (error) return toast.error(error.message);
    setCommentDraft(d => ({ ...d, [postId]: "" }));
    setComments(c => ({ ...c, [postId]: [...(c[postId] ?? []), data as Comment] }));
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    const { error } = await supabase.from("community_comments").delete().eq("id", commentId);
    if (error) return toast.error(error.message);
    setComments(c => ({ ...c, [postId]: (c[postId] ?? []).filter(x => x.id !== commentId) }));
  };

  const sortedPosts = useMemo(() => posts, [posts]);

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button aria-label="Go back" variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" /> Community
              </h1>
              <p className="text-sm text-muted-foreground">Announcements, Notion pages and discussions</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(s => !s)}>
              <Plus className="h-4 w-4 mr-1" /> New Post
            </Button>
          )}
        </div>

        {isAdmin && showCreate && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Create Post</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
              <Textarea placeholder="Message (optional)" rows={3} value={body} onChange={e => setBody(e.target.value)} />
              <Input
                placeholder="Notion page URL (https://...notion.site/... — optional)"
                value={notionUrl}
                onChange={e => setNotionUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Notion page ko "Share → Publish to web" karke link paste karein. Iframe me embed ho jayega.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
                <Pin className="h-3 w-3" /> Pin to top
              </label>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !title.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : sortedPosts.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            Abhi tak koi post nahi. {isAdmin && "Pehla post add karein."}
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {sortedPosts.map(post => {
              const embedUrl = post.notion_url ? toNotionEmbedUrl(post.notion_url) : null;
              const postLikes = likes[post.id] ?? { count: 0, liked: false };
              const postComments = comments[post.id] ?? [];
              const isOpen = openComments[post.id];
              return (
                <Card key={post.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {post.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                          {post.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {new Date(post.created_at).toLocaleDateString()}
                          </Badge>
                          {post.notion_url && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <ExternalLink className="h-3 w-3" /> Notion
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button aria-label="Delete post" variant="ghost" size="icon" onClick={() => handleDeletePost(post.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {post.body && <p className="text-sm whitespace-pre-wrap">{post.body}</p>}

                    {embedUrl && (
                      <div className="border rounded-lg overflow-hidden bg-muted/30">
                        <iframe
                          src={embedUrl}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                          className="w-full h-[480px]"
                          title={post.title}
                        />
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t flex items-center justify-between">
                          <span>Notion page</span>
                          <a href={embedUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-1">
                      <button
                        onClick={() => handleToggleLike(post.id)}
                        className={`inline-flex items-center gap-1 text-sm transition ${postLikes.liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Heart className={`h-4 w-4 ${postLikes.liked ? "fill-current" : ""}`} />
                        {postLikes.count}
                      </button>
                      <button
                        onClick={() => setOpenComments(s => ({ ...s, [post.id]: !s[post.id] }))}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <MessageCircle className="h-4 w-4" /> {postComments.length}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="border-t pt-3 space-y-2">
                        {postComments.map(c => (
                          <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                            <div>
                              <span className="font-medium">{c.user_name}</span>{" "}
                              <span className="text-muted-foreground">{c.body}</span>
                            </div>
                            {(c.user_id === user?.id || isAdmin) && (
                              <button
                                onClick={() => handleDeleteComment(c.id, post.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input
                            placeholder="Comment likhein..."
                            value={commentDraft[post.id] ?? ""}
                            onChange={e => setCommentDraft(d => ({ ...d, [post.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && handleAddComment(post.id)}
                          />
                          <Button aria-label="Post comment" size="icon" onClick={() => handleAddComment(post.id)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Community;