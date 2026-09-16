ALTER TABLE public.field_mappings ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Reset the stuck Oracle run so the browser worker reads the live page.
DELETE FROM public.pending_questions WHERE application_id = '4c64cdbb-a778-41fc-a840-aeed32c8e9df' AND answer IS NULL;
UPDATE public.applications
SET status = 'waiting_for_worker',
    agent_state = 'INSPECT_APPLICATION',
    worker_claimed_at = NULL,
    notes = 'This site builds its form with JavaScript, so your browser worker will open it and read the form live.'
WHERE id = '4c64cdbb-a778-41fc-a840-aeed32c8e9df';
UPDATE public.run_steps
SET status = 'waiting',
    detail = 'This site is JavaScript-rendered — the browser worker will open it and detect the fields live.'
WHERE application_id = '4c64cdbb-a778-41fc-a840-aeed32c8e9df' AND state = 'EXTRACT_FIELDS';