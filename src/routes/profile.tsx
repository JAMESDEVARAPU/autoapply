import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Account Profile · AI Job Application Agent" },
      {
        name: "description",
        content:
          "Enter your personal, education, professional and preference details once. The agent reuses them on every job application.",
      },
      { property: "og:title", content: "Account Profile · AI Job Application Agent" },
      {
        property: "og:description",
        content: "Your saved details, reused across every job application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

type Fields = Record<string, string>;

const SECTIONS: {
  title: string;
  hint?: string;
  fields: { key: string; label: string; long?: boolean; placeholder?: string; help?: string }[];
}[] = [
  {
    title: "Personal information",
    fields: [
      { key: "first_name", label: "First name" },
      { key: "middle_name", label: "Middle name" },
      { key: "last_name", label: "Last name" },
      { key: "preferred_name", label: "Preferred name" },
      { key: "email", label: "Email", placeholder: "you@example.com" },
      { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
      {
        key: "date_of_birth",
        label: "Date of birth",
        placeholder: "DD-MM-YYYY",
        help: "Example: 14-08-2002 (day-month-year)",
      },
      { key: "gender", label: "Gender", placeholder: "Male / Female / Other" },
      { key: "pronouns", label: "Pronouns", placeholder: "he/him" },
      { key: "address", label: "Address", long: true, placeholder: "House / street / area" },
      { key: "city", label: "City", placeholder: "Hyderabad" },
      { key: "state", label: "State", placeholder: "Telangana" },
      { key: "country", label: "Country", placeholder: "India" },
      { key: "pincode", label: "Pincode / ZIP", placeholder: "500081" },
      { key: "citizenship", label: "Citizenship", placeholder: "Indian" },
      {
        key: "work_authorization",
        label: "Work authorization",
        placeholder: "Authorized to work in India",
      },
    ],
  },
  {
    title: "Professional",
    fields: [
      { key: "years_of_experience", label: "Years of experience", placeholder: "2" },
      {
        key: "employment_status",
        label: "Employment status",
        placeholder: "Student / Employed / Looking for work",
      },
      {
        key: "internship_experience",
        label: "Internship experience",
        long: true,
        placeholder: "6 months at Acme as a backend intern",
      },
      {
        key: "programming_languages",
        label: "Programming languages",
        long: true,
        placeholder: "Java, Python, SQL",
      },
      { key: "frameworks", label: "Frameworks", long: true, placeholder: "Spring Boot, React" },
      { key: "databases", label: "Databases", long: true, placeholder: "Oracle, PostgreSQL" },
      { key: "cloud_skills", label: "Cloud skills", long: true, placeholder: "AWS, Docker" },
      {
        key: "certifications",
        label: "Certifications",
        long: true,
        placeholder: "Oracle Certified Associate, 2025",
      },
    ],
  },
  {
    title: "Links",
    fields: [
      { key: "linkedin_url", label: "LinkedIn", placeholder: "https://linkedin.com/in/username" },
      { key: "github_url", label: "GitHub", placeholder: "https://github.com/username" },
      { key: "portfolio_url", label: "Portfolio", placeholder: "https://yourname.dev" },
      { key: "other_urls", label: "Other URLs", long: true, placeholder: "One link per line" },
    ],
  },
  {
    title: "Application preferences",
    fields: [
      {
        key: "preferred_locations",
        label: "Preferred locations",
        placeholder: "Bengaluru, Hyderabad, Remote",
      },
      { key: "willing_to_relocate", label: "Willing to relocate", placeholder: "Yes / No" },
      { key: "work_mode", label: "Work mode", placeholder: "Onsite / Hybrid / Remote" },
      { key: "notice_period", label: "Notice period", placeholder: "Immediate / 30 days" },
      { key: "expected_salary", label: "Expected salary", placeholder: "12 LPA" },
      {
        key: "preferred_job_type",
        label: "Preferred job type",
        placeholder: "Full-time / Internship",
      },
    ],
  },
];

const EDU_FIELDS = [
  "degree",
  "branch",
  "college",
  "location",
  "start_year",
  "graduation_year",
  "cgpa",
  "percentage",
  "backlogs",
  "coursework",
] as const;

const EXP_FIELDS = [
  "company",
  "title",
  "employment_type",
  "location",
  "start_date",
  "end_date",
  "description",
] as const;

function pretty(key: string) {
  return key.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

// Accept DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY or YYYY-MM-DD; return ISO for the database.
function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let day = 0;
  let month = 0;
  let year = 0;
  let match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (match) {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
    } else {
      return null;
    }
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Show the stored ISO date back to the user as DD-MM-YYYY.
function toDisplayDate(value: unknown): string {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return match ? `${match[3]}-${match[2]}-${match[1]}` : typeof value === "string" ? value : "";
}

function ProfilePage() {
  return (
    <AppShell>
      <ProfileBody />
    </AppShell>
  );
}

function ProfileBody() {
  const { user } = useSession();
  const [fields, setFields] = useState<Fields>({});
  const [education, setEducation] = useState<any[]>([]);
  const [experience, setExperience] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!user) return;
    const [profile, edu, exp, saved] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("education_records").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("experience_records").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("saved_answers").select("*").eq("user_id", user.id).order("created_at"),
    ]);
    const row = (profile.data ?? {}) as Record<string, unknown>;
    const next: Fields = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const raw = (row[field.key] as string) ?? "";
        next[field.key] = field.key === "date_of_birth" ? toDisplayDate(raw) : raw;
      }
    }
    if (!next["email"]) next["email"] = user.email ?? "";
    setFields(next);
    setEducation(edu.data ?? []);
    setExperience(exp.data ?? []);
    setAnswers(saved.data ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function saveProfile() {
    if (!user) return;
    const dob = (fields["date_of_birth"] ?? "").trim();
    if (dob && !toIsoDate(dob)) {
      toast.error("Date of birth must be a real date in DD-MM-YYYY format, like 14-07-2003.");
      return;
    }
    setSaving(true);
    const payload: Record<string, string | null> = { id: user.id };
    for (const [key, value] of Object.entries(fields)) {
      payload[key] =
        key === "date_of_birth" ? toIsoDate(value) : value.trim() || null;
    }
    const { error } = await supabase.from("profiles").upsert(payload as never);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Account profile saved.");
  }

  async function addRow(table: "education_records" | "experience_records") {
    if (!user) return;
    const { error } = await supabase.from(table).insert({ user_id: user.id });
    if (error) toast.error(error.message);
    else void load();
  }

  async function updateRow(
    table: "education_records" | "experience_records",
    id: string,
    key: string,
    value: string,
  ) {
    const { error } = await supabase
      .from(table)
      .update({ [key]: value.trim() || null } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteRow(table: string, id: string) {
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entered once, reused on every application. The agent only uses what you put here, your resume,
          and answers you approve — it never invents details.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="panel p-6">
          <h2 className="label-mono mb-4 text-primary">{section.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((field) => (
              <div key={field.key} className={field.long ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.long ? (
                  <Textarea
                    id={field.key}
                    rows={2}
                    placeholder={field.placeholder}
                    value={fields[field.key] ?? ""}
                    onChange={(event) =>
                      setFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={field.key}
                    placeholder={field.placeholder}
                    value={fields[field.key] ?? ""}
                    onChange={(event) =>
                      setFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                )}
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label-mono text-primary">Education</h2>
          <Button variant="outline" size="sm" onClick={() => addRow("education_records")}>
            <Plus className="size-4" /> Add education
          </Button>
        </div>
        <div className="space-y-6">
          {education.length === 0 && (
            <p className="text-sm text-muted-foreground">No education records yet.</p>
          )}
          {education.map((record) => (
            <div key={record.id} className="rounded-lg border border-border/60 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {EDU_FIELDS.map((key) => (
                  <div key={key} className={key === "coursework" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                    <Label>{pretty(key)}</Label>
                    <Input
                      defaultValue={record[key] ?? ""}
                      onBlur={(event) =>
                        updateRow("education_records", record.id, key, event.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-destructive"
                onClick={() => deleteRow("education_records", record.id)}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label-mono text-primary">Experience</h2>
          <Button variant="outline" size="sm" onClick={() => addRow("experience_records")}>
            <Plus className="size-4" /> Add experience
          </Button>
        </div>
        <div className="space-y-6">
          {experience.length === 0 && (
            <p className="text-sm text-muted-foreground">No experience records yet.</p>
          )}
          {experience.map((record) => (
            <div key={record.id} className="rounded-lg border border-border/60 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {EXP_FIELDS.map((key) => (
                  <div
                    key={key}
                    className={key === "description" ? "space-y-2 sm:col-span-2 lg:col-span-3" : "space-y-2"}
                  >
                    <Label>{pretty(key)}</Label>
                    {key === "description" ? (
                      <Textarea
                        rows={3}
                        defaultValue={record[key] ?? ""}
                        onBlur={(event) =>
                          updateRow("experience_records", record.id, key, event.target.value)
                        }
                      />
                    ) : (
                      <Input
                        defaultValue={record[key] ?? ""}
                        onBlur={(event) =>
                          updateRow("experience_records", record.id, key, event.target.value)
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-destructive"
                onClick={() => deleteRow("experience_records", record.id)}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="label-mono mb-4 text-primary">Saved answers</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Answers you chose to save while applying. The agent reuses these instead of asking again.
        </p>
        <div className="space-y-3">
          {answers.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
          )}
          {answers.map((answer) => (
            <div key={answer.id} className="rounded-lg border border-border/60 p-4">
              <p className="text-sm font-medium">{answer.question}</p>
              <Textarea
                className="mt-2"
                rows={2}
                defaultValue={answer.answer ?? ""}
                onBlur={async (event) => {
                  const { error } = await supabase
                    .from("saved_answers")
                    .update({ answer: event.target.value })
                    .eq("id", answer.id);
                  if (error) toast.error(error.message);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-destructive"
                onClick={() => deleteRow("saved_answers", answer.id)}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={saveProfile} disabled={saving} size="lg">
          <Save className="size-4" /> {saving ? "Saving…" : "Save account profile"}
        </Button>
      </div>
    </div>
  );
}
