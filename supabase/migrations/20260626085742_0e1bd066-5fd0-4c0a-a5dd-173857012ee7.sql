-- Idempotency lock for webhook events: prevents duplicate processing on retries
ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_source_event_id_key UNIQUE (source, event_id);

CREATE INDEX IF NOT EXISTS webhook_events_received_at_idx
  ON public.webhook_events (received_at DESC);