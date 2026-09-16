CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  first_name TEXT, middle_name TEXT, last_name TEXT, preferred_name TEXT,
  email TEXT, phone TEXT, date_of_birth DATE, gender TEXT, pronouns TEXT,
  address TEXT, city TEXT, state TEXT, country TEXT, pincode TEXT,
  citizenship TEXT, work_authorization TEXT,
  years_of_experience TEXT, employment_status TEXT, internship_experience TEXT,
  programming_languages TEXT, frameworks TEXT, databases TEXT, cloud_skills TEXT, certifications TEXT,
  linkedin_url TEXT, github_url TEXT, portfolio_url TEXT, other_urls TEXT,
  preferred_locations TEXT, willing_to_relocate TEXT, work_mode TEXT,
  notice_period TEXT, expected_salary TEXT, preferred_job_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.education_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  degree TEXT, branch TEXT, college TEXT, location TEXT,
  start_year TEXT, graduation_year TEXT, cgpa TEXT, percentage TEXT,
  backlogs TEXT, coursework TEXT, sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.education_records TO authenticated;
GRANT ALL ON public.education_records TO service_role;
ALTER TABLE public.education_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own education" ON public.education_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_edu_upd BEFORE UPDATE ON public.education_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.experience_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  company TEXT, title TEXT, location TEXT, employment_type TEXT,
  start_date TEXT, end_date TEXT, is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT, sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_records TO authenticated;
GRANT ALL ON public.experience_records TO service_role;
ALTER TABLE public.experience_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own experience" ON public.experience_records FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_exp_upd BEFORE UPDATE ON public.experience_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.saved_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  question TEXT NOT NULL, answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_answers TO authenticated;
GRANT ALL ON public.saved_answers TO service_role;
ALTER TABLE public.saved_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own answers" ON public.saved_answers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_ans_upd BEFORE UPDATE ON public.saved_answers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  file_name TEXT NOT NULL, storage_path TEXT NOT NULL,
  mime_type TEXT, file_size INT,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT, extracted JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resumes" ON public.resumes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_res_upd BEFORE UPDATE ON public.resumes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  job_url TEXT NOT NULL,
  company TEXT, role_title TEXT,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  resume_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  agent_state TEXT NOT NULL DEFAULT 'IDLE',
  confirmation_message TEXT,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_snapshot JSONB,
  notes TEXT,
  worker_claimed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own applications" ON public.applications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_app_upd BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_applications_user ON public.applications(user_id, created_at DESC);

CREATE TABLE public.run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  state TEXT NOT NULL, label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  detail TEXT, sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_steps TO authenticated;
GRANT ALL ON public.run_steps TO service_role;
ALTER TABLE public.run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own steps" ON public.run_steps FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_step_upd BEFORE UPDATE ON public.run_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_run_steps_app ON public.run_steps(application_id, sort_order);

CREATE TABLE public.field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  field_label TEXT NOT NULL, field_selector TEXT, field_type TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  understood_as TEXT, mapped_value TEXT,
  source TEXT NOT NULL DEFAULT 'unavailable',
  confidence INT NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT 'ask_user',
  fill_status TEXT NOT NULL DEFAULT 'pending',
  validation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_mappings TO authenticated;
GRANT ALL ON public.field_mappings TO service_role;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mappings" ON public.field_mappings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_map_upd BEFORE UPDATE ON public.field_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_field_mappings_app ON public.field_mappings(application_id);

CREATE TABLE public.pending_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  field_mapping_id UUID REFERENCES public.field_mappings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'missing_info',
  question TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'text',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer TEXT,
  answered_at TIMESTAMPTZ,
  save_to_profile BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_questions TO authenticated;
GRANT ALL ON public.pending_questions TO service_role;
ALTER TABLE public.pending_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own questions" ON public.pending_questions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_pq_upd BEFORE UPDATE ON public.pending_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pending_questions_app ON public.pending_questions(application_id);

CREATE TABLE public.site_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  site_host TEXT NOT NULL,
  username TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_host)
);
GRANT ALL ON public.site_credentials TO service_role;
ALTER TABLE public.site_credentials ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER t_cred_upd BEFORE UPDATE ON public.site_credentials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  action TEXT NOT NULL, detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit read" ON public.audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own audit insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_audit_user ON public.audit_log(user_id, created_at DESC);

CREATE POLICY "resume read own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "resume insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "resume update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "resume delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
