import { useState, useEffect, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";

export interface SiteStat {
  id: number;
  statKey: string;
  statValue: string;
}

export interface LandingContent {
  sectionKey: string;
  content: any;
}

const DEFAULT_STATS: SiteStat[] = [
  { id: 1, statKey: "students", statValue: "500+" },
  { id: 2, statKey: "courses", statValue: "50+" },
  { id: 3, statKey: "teachers", statValue: "20+" },
];

export const useLandingData = () => {
  const [stats, setStats] = useState<SiteStat[]>(DEFAULT_STATS);
  const [content, setContent] = useState<LandingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("site_stats")
        .select("id, stat_key, stat_value");
      if (error) throw error;
      if (data && data.length > 0) {
        setStats(
          data.map((r) => ({
            id: r.id,
            statKey: r.stat_key,
            statValue: r.stat_value,
          }))
        );
      }
    } catch {
      // Keep defaults on error
    }
  }, []);

  const fetchContent = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("landing_content")
        .select("section_key, content");
      if (error) throw error;
      if (data) {
        setContent(
          data.map((r) => ({
            sectionKey: r.section_key,
            content: r.content,
          }))
        );
      }
    } catch {
      // Keep empty on error
    }
  }, []);

  const getStatValue = useCallback(
    (key: string): string => {
      const stat = stats.find((s) => s.statKey === key);
      return stat?.statValue || "0";
    },
    [stats]
  );

  const getContentByKey = useCallback(
    (key: string): any => {
      const item = content.find((c) => c.sectionKey === key);
      return item?.content || null;
    },
    [content]
  );

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchStats(), fetchContent()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchContent]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    stats,
    content,
    loading,
    error,
    fetchAll,
    getStatValue,
    getContentByKey,
  };
};
