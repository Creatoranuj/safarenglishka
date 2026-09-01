ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_key_allowlist;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_key_allowlist CHECK (
  key = ANY (ARRAY[
    'whatsapp_url','instagram_url','twitter_url','facebook_url','telegram_url',
    'youtube_url','linkedin_url','discord_url','website_url',
    'player_infinity_overlay','player_youtube_label_overlay',
    'pdf_zoom_controls'
  ]::text[])
);