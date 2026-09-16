import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { answerQuestion, approveApplication, draftAnswer, runAgent } from "@/lib/agent.functions";
import { SOURCE_LABEL, STATUS_LABEL, STEP_PLAN } from "@/lib/agent-machine";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  FileText,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

export const Route = createFileRoute("/applications/$id")({
  head: () => ({
    meta: [
      { title: "Application run · AI Job Application Agent" },
      {
        name: "description",
        content:
          "Live progress of one job application run: detected fields, matched answers, questions the agent needs from you, and the final review before submission.",
      },
      { property: "og:title", content: "Application run · AI Job Application Agent" },
      {
        property: "og:description",
        content: "Live progress, questions and final review for one application run.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RunPage,
});

function StepIcon({ status }: { status: string }) {
  if (status === "done") return <Check className="size-4 text-primary" />;
  if (status === "running") return <Loader2 className="size-4 animate-spin text-primary" />;
  if (status === "waiting") return <AlertTriangle className="size-4 text-amber-400" />;
  if (status === "failed") return <X className="size-4 text-destructive" />;
  return <CircleDashed className="size-4 text-muted-foreground" />;
}

function RunPage() {
  return (
    <AppShell>
      <RunBody />
    </AppShell>
  );
}

function RunBody() {
  const { id } = Route.useParams();
  const [application, setApplication] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const answer = useServerFn(answerQuestion);
  const approve = useServerFn(approveApplication);
  const draft = useServerFn(draftAnswer);
  const run = useServerFn(runAgent);

  const load = useCallback(async () => {
    const [app, step, map, question] = await Promise.all([
      supabase.from("applications").select("*").eq("id", id).maybeSingle(),
      supabase.from("run_steps").select("*").eq("application_id", id).order("sort_order"),
      supabase.from("field_mappings").select("*").eq("application_id", id).order("created_at"),
      supabase.from("pending_questions").select("*").eq("application_id", id).order("created_at"),
    ]);
    setApplication(app.data);
    setSteps(step.data ?? []);
    setMappings(map.data ?? []);
    setQuestions(question.data ?? []);
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  const open = questions.filter((question) => !question.answer);
  const filled = mappings.filter((row) => row.action === "fill");
  const stepRows =
    steps.length > 0
      ? steps
      : STEP_PLAN.map((step, index) => ({ ...step, status: "pending", sort_order: index, id: step.state }));

  if (!application) {
    return <p className="label-mono text-muted-foreground">Loading run…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {application.role_title || "Application"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {application.company ?? "Unknown company"} ·{" "}
            <a href={application.job_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              job link
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="label-mono rounded-md bg-primary/10 px-3 py-1.5 text-primary">
            {STATUS_LABEL[application.status] ?? application.status}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await run({ data: { applicationId: id } });
                await load();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "The agent could not continue.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw className="size-4" /> Continue run
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="panel h-fit p-5">
          <h2 className="label-mono mb-4 text-primary">Progress</h2>
          <ol className="space-y-2.5">
            {stepRows.map((step: any) => (
              <li key={step.id} className="flex gap-2.5 text-sm">
                <span className="mt-0.5">
                  <StepIcon status={step.status} />
                </span>
                <span className="min-w-0">
                  <span className={step.status === "pending" ? "text-muted-foreground" : ""}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="block break-words text-xs text-muted-foreground">{step.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-6">
          {application.status === "blocked" && (
            <section className="panel border-destructive/50 p-5">
              <h2 className="mb-2 flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4" /> Stopped by the website
              </h2>
              <p className="text-sm text-muted-foreground">{application.notes}</p>
            </section>
          )}

          {open.length > 0 && (
            <section className="panel border-amber-400/40 p-5">
              <h2 className="mb-1 flex items-center gap-2 font-medium text-amber-300">
                <AlertTriangle className="size-4" /> Information required ({open.length})
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                The agent will not guess these. Answer them and it continues from where it stopped.
              </p>
              <div className="space-y-5">
                {open.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    onDraft={async () => {
                      const result = await draft({ data: { questionId: question.id } });
                      if (result.error) toast.error(result.error);
                      return result.draft;
                    }}
                    onSubmit={async (value, save) => {
                      const result = await answer({
                        data: { questionId: question.id, answer: value, saveToProfile: save },
                      });
                      await load();
                      if (result.rerun) {
                        await run({ data: { applicationId: id } });
                        await load();
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {(application.agent_state === "HANDLE_VERIFICATION" ||
            steps.some((step) => step.state === "HANDLE_VERIFICATION" && step.status === "waiting")) && (
            <section className="panel border-primary/40 p-5">
              <h2 className="mb-2 flex items-center gap-2 font-medium text-primary">
                <KeyRound className="size-4" /> Human verification required
              </h2>
              <p className="text-sm text-muted-foreground">
                This site asks for a one-time code or a human check. The agent never bypasses these. Your
                browser worker pauses at this point and waits for you to complete it in the live browser
                window, then continues from the same page.
              </p>
            </section>
          )}

          {application.status === "ready_for_review" && (
            <section className="panel border-primary/40 p-5">
              <h2 className="mb-3 font-medium text-primary">Application ready</h2>
              <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="label-mono text-muted-foreground">Company</dt>
                  <dd>{application.company ?? "—"}</dd>
                </div>
                <div>
                  <dt className="label-mono text-muted-foreground">Detected role</dt>
                  <dd>{application.role_title ?? "—"}</dd>
                </div>
                <div>
                  <dt className="label-mono text-muted-foreground">Resume</dt>
                  <dd className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    {application.resume_file_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="label-mono text-muted-foreground">Fields prepared</dt>
                  <dd>
                    {filled.length} of {mappings.length} · no unanswered questions
                  </dd>
                </div>
              </dl>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await approve({ data: { applicationId: id } });
                    toast.success(result.message);
                    await load();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not approve.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Send className="size-4" /> Submit Application
              </Button>
            </section>
          )}

          {application.status === "waiting_for_worker" && (
            <section className="panel border-primary/40 p-5">
              <h2 className="mb-2 font-medium text-primary">Waiting for your browser worker</h2>
              <p className="text-sm text-muted-foreground">
                You approved this application. The real form filling, resume upload and submission happen in
                a live browser on your machine — start the worker (see <code>worker/README.md</code>) and it
                picks this run up. Nothing is marked submitted until the site's own confirmation is read
                back.
              </p>
            </section>
          )}

          {application.status === "submitted" && (
            <section className="panel border-primary/40 p-5">
              <h2 className="mb-2 font-medium text-primary">Submitted</h2>
              <p className="text-sm text-muted-foreground">{application.confirmation_message}</p>
            </section>
          )}

          <section className="panel p-5">
            <h2 className="label-mono mb-4 text-primary">Detected fields ({mappings.length})</h2>
            {mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fields read yet. The agent fills this in once it has opened the form.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="label-mono text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Field</th>
                      <th className="py-2 pr-4">Understood as</th>
                      <th className="py-2 pr-4">Value</th>
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {mappings.map((row) => (
                      <tr key={row.id}>
                        <td className="max-w-[220px] py-2 pr-4 align-top">
                          {row.field_label}
                          {row.is_required && <span className="text-destructive"> *</span>}
                        </td>
                        <td className="max-w-[180px] py-2 pr-4 align-top text-muted-foreground">
                          {row.understood_as ?? "—"}
                        </td>
                        <td className="max-w-[260px] break-words py-2 pr-4 align-top">
                          {row.mapped_value ?? (
                            <span className="text-amber-300">needs your answer</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 align-top text-muted-foreground">
                          {SOURCE_LABEL[row.source] ?? row.source}
                        </td>
                        <td className="label-mono py-2 align-top">{row.confidence}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <Link to="/history" className="inline-block text-sm text-primary hover:underline">
            View all applications
          </Link>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  onSubmit,
  onDraft,
}: {
  question: any;
  onSubmit: (answer: string, save: boolean) => Promise<void>;
  onDraft: () => Promise<string | null>;
}) {
  const [value, setValue] = useState("");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);

  const options: string[] = Array.isArray(question.options) ? question.options : [];

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium">{question.question}</p>
      {question.kind === "sensitive" && (
        <p className="mt-1 text-xs text-amber-300">
          This is a personal or legal detail — only you can answer it.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {options.length > 0 ? (
          <div className="flex gap-2">
            {options.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={value === option ? "default" : "outline"}
                onClick={() => setValue(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        ) : question.input_type === "textarea" ? (
          <Textarea rows={4} value={value} onChange={(event) => setValue(event.target.value)} />
        ) : (
          <Input value={value} onChange={(event) => setValue(event.target.value)} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={busy || !value.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(value.trim(), save);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not save that answer.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save answer
          </Button>
          {question.input_type === "textarea" && question.kind !== "sensitive" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const drafted = await onDraft();
                if (drafted) setValue(drafted);
                setBusy(false);
              }}
            >
              Draft from my resume
            </Button>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={save} onCheckedChange={(checked) => setSave(checked === true)} />
            Save this answer to my Account Profile
          </label>
        </div>
      </div>
    </div>
  );
}
