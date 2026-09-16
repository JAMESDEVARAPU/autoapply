import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { STATUS_LABEL } from "@/lib/agent-machine";
import { startApplication, parseResume, runAgent } from "@/lib/agent.functions";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardPaste, FileText, Link2, Play, Upload } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Job Application Agent · Apply with one link" },
      {
        name: "description",
        content:
          "Paste a job application URL, upload your resume, and let one AI agent read the form, fill it from your saved profile and ask you only what it genuinely needs.",
      },
      { property: "og:title", content: "AI Job Application Agent · Apply with one link" },
      {
        property: "og:description",
        content: "One agent reads the job form, fills it from your profile and resume, and asks before submitting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const ACCEPTED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function Dashboard() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { user } = useSession();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  const start = useServerFn(startApplication);
  const parse = useServerFn(parseResume);
  const run = useServerFn(runAgent);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("applications")
      .select("id, job_url, company, role_title, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecent(data ?? []));
    void supabase
      .from("resumes")
      .select("id, file_name")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setResumeId(data[0]!.id);
          setResumeName(data[0]!.file_name);
        }
      });
  }, [user]);

  async function uploadResume(selected: File) {
    if (!user) return;
    if (!ACCEPTED.includes(selected.type)) {
      toast.error("Please upload a PDF or DOCX resume.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("That file is larger than 10 MB.");
      return;
    }
    setBusy("Uploading resume…");
    const path = `${user.id}/${crypto.randomUUID()}-${selected.name}`;
    const upload = await supabase.storage.from("resumes").upload(path, selected, {
      contentType: selected.type,
    });
    if (upload.error) {
      setBusy(null);
      toast.error(upload.error.message);
      return;
    }
    const inserted = await supabase
      .from("resumes")
      .insert({
        user_id: user.id,
        file_name: selected.name,
        storage_path: path,
        mime_type: selected.type,
        file_size: selected.size,
      })
      .select("id")
      .single();
    if (inserted.error) {
      setBusy(null);
      toast.error(inserted.error.message);
      return;
    }
    setResumeId(inserted.data.id);
    setResumeName(selected.name);
    setBusy("Reading your resume…");
    const parsed = await parse({ data: { resumeId: inserted.data.id } });
    setBusy(null);
    if (!parsed.ok) toast.error(parsed.error);
    else toast.success(`${selected.name} read successfully.`);
  }

  async function startRun(force = false) {
    if (!resumeId) {
      toast.error("Upload your updated resume first.");
      return;
    }
    setBusy("Starting the agent…");
    try {
      const created = await start({ data: { jobUrl: jobUrl.trim(), resumeId, force } });
      if (created.duplicate) {
        setBusy(null);
        toast.warning("You already have an application for this link.", {
          action: {
            label: "Open it",
            onClick: () => navigate({ to: "/applications/$id", params: { id: created.applicationId } }),
          },
          description: "Choose 'Apply anyway' below to start a second one.",
        });
        setDuplicateReady(true);
        return;
      }
      void run({ data: { applicationId: created.applicationId } }).catch(() => undefined);
      navigate({ to: "/applications/$id", params: { id: created.applicationId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The agent could not start.");
    } finally {
      setBusy(null);
    }
  }

  const [duplicateReady, setDuplicateReady] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Start an application</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give the agent a job link and your updated resume. It handles the application from there,
          asking you only when it genuinely needs your input.
        </p>
      </div>

      <section className="panel space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="job-url">Job application URL</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="job-url"
                className="pl-9"
                placeholder="https://job-boards.greenhouse.io/company/jobs/1234567"
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text.trim()) {
                    setJobUrl(text.trim());
                  } else {
                    toast.error("Your clipboard is empty.");
                  }
                } catch {
                  toast.error("Allow clipboard access in your browser, or type the link in.");
                }
              }}
            >
              <ClipboardPaste className="size-4" /> Paste
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Keyboard paste can be blocked inside the preview window — use the Paste button.
          </p>
        </div>


        <div className="space-y-2">
          <Label>Updated resume (PDF or DOCX)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) {
                  setFile(selected);
                  void uploadResume(selected);
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Choose file
            </Button>
            {resumeName ? (
              <span className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="size-4 text-primary" />
                {resumeName}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No resume uploaded yet</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This exact file is the one submitted. The agent never edits it or replaces it with a
            generated resume.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={!!busy || !jobUrl.trim() || !resumeId} onClick={() => startRun(false)}>
            <Play className="size-4" /> Start Application
          </Button>
          {duplicateReady && (
            <Button variant="outline" onClick={() => startRun(true)}>
              Apply anyway
            </Button>
          )}
          {busy && <span className="label-mono text-primary">{busy}</span>}
          {file && !resumeId && <span className="text-sm text-muted-foreground">Waiting for upload…</span>}
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="label-mono mb-4 text-primary">Recent applications</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet — your first run will show up here.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {row.role_title || row.job_url}
                    {row.company ? <span className="text-muted-foreground"> · {row.company}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{row.job_url}</p>
                </div>
                <span className="label-mono text-muted-foreground">
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
                <Link
                  to="/applications/$id"
                  params={{ id: row.id }}
                  className="text-sm text-primary hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
