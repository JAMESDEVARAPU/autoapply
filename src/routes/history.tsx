import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL } from "@/lib/agent-machine";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Application history · AI Job Application Agent" },
      {
        name: "description",
        content:
          "Every application the agent has worked on: company, role, job link, resume used, status, confirmation message and notes.",
      },
      { property: "og:title", content: "Application history · AI Job Application Agent" },
      {
        property: "og:description",
        content: "Company, role, resume, status and confirmation for every application run.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <AppShell>
      <HistoryBody />
    </AppShell>
  );
}

function HistoryBody() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    void supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Application history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every run, with the resume used and what the site confirmed.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium">
                    {row.role_title || "Untitled role"}
                    {row.company ? (
                      <span className="text-muted-foreground"> · {row.company}</span>
                    ) : null}
                  </h2>
                  <a
                    href={row.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-primary hover:underline"
                  >
                    {row.job_url}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="label-mono rounded-md bg-primary/10 px-2.5 py-1 text-primary">
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <Link
                    to="/applications/$id"
                    params={{ id: row.id }}
                    className="text-sm text-primary hover:underline"
                  >
                    Open
                  </Link>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="label-mono text-muted-foreground">Date</dt>
                  <dd>{new Date(row.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="label-mono text-muted-foreground">Resume</dt>
                  <dd className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    {row.resume_file_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="label-mono text-muted-foreground">Confirmation</dt>
                  <dd>{row.confirmation_message ?? "—"}</dd>
                </div>
              </dl>

              {Array.isArray(row.missing_information) && row.missing_information.length > 0 && (
                <p className="mt-3 text-xs text-amber-300">
                  Missing information: {row.missing_information.join(", ")}
                </p>
              )}
              {row.notes && <p className="mt-2 text-xs text-muted-foreground">{row.notes}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
