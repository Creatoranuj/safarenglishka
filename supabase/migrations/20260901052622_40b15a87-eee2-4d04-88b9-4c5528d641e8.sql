GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.audit_log,
  public.automation_rules,
  public.chatbot_logs,
  public.chatbot_settings,
  public.crawl_history,
  public.deletion_requests,
  public.dependency_scan_reports,
  public.earning_links,
  public.error_logs,
  public.funnel_entries,
  public.funnel_stages,
  public.leads,
  public.marketing_campaigns,
  public.meta_ad_config,
  public.payment_events,
  public.pdf_proxy_metrics,
  public.security_alerts,
  public.security_events,
  public.trusted_hosts
TO authenticated;

GRANT SELECT ON public.earning_links TO anon;