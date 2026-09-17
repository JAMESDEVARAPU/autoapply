import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { STEP_PLAN, NEVER_GUESS_KEYS, type AgentState } from "./agent-machine";

/* ------------------------------------------------------------------ helpers */

const str = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value))
  .nullish()
  .transform((value) => value ?? null);

const RESUME_SCHEMA = z.object({
  name: str,
  email: str,
  phone: str,
  location: str,
  summary: str,
  education: z
    .array(
      z
        .object({
          degree: str,
          branch: str,
          college: str,
          location: str,
          start_year: str,
          graduation_year: str,
          cgpa: str,
          percentage: str,
        })
        .partial(),
    )
    .nullish()
    .transform((value) => value ?? []),
  experience: z
    .array(
      z
        .object({
          company: str,
          title: str,
          start_date: str,
          end_date: str,
          description: str,
        })
        .partial(),
    )
    .nullish()
    .transform((value) => value ?? []),
  skills: z
    .array(str)
    .nullish()
    .transform((value) => (value ?? []).filter((item): item is string => !!item)),
  projects: z
    .array(z.object({ name: str, description: str }).partial())
    .nullish()
    .transform((value) => value ?? []),
  certifications: z
    .array(str)
    .nullish()
    .transform((value) => (value ?? []).filter((item): item is string => !!item)),
  links: z
    .array(str)
    .nullish()
    .transform((value) => (value ?? []).filter((item): item is string => !!item)),
  total_years_experience: str,
});

const MAPPING_SCHEMA = z.object({
  fields: z
    .array(
      z.object({
        selector: z.string(),
        understood_as: z.string().nullish().transform((value) => value ?? ""),
        value: str,
        source: z
          .enum(["account_profile", "resume", "saved_answer", "drafted", "unavailable"])
          .nullish()
          .transform((value) => value ?? "unavailable"),
        confidence: z.coerce.number().nullish().transform((value) => value ?? 0),
        reason: str,
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
});

function isSensitive(text: string) {
  const lower = text.toLowerCase().replace(/[^a-z]+/g, "_");
  return NEVER_GUESS_KEYS.some((key) => lower.includes(key));
}

async function loadContext(supabase: any, userId: string) {
  const [profile, education, experience, answers] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("education_records").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("experience_records").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("saved_answers").select("question, answer").eq("user_id", userId),
  ]);
  return {
    profile: profile.data ?? {},
    education: education.data ?? [],
    experience: experience.data ?? [],
    savedAnswers: answers.data ?? [],
  };
}

async function logAudit(
  supabase: any,
  userId: string,
  applicationId: string | null,
  action: string,
  detail?: string,
) {
  await supabase
    .from("audit_log")
    .insert({ user_id: userId, application_id: applicationId, action, detail: detail ?? null });
}

async function setStep(
  supabase: any,
  applicationId: string,
  state: AgentState,
  status: string,
  detail?: string | null,
) {
  await supabase
    .from("run_steps")
    .update({ status, detail: detail ?? null })
    .eq("application_id", applicationId)
    .eq("state", state);
}

/* ------------------------------------------------------- start application */

export const startApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        jobUrl: z.string().url("Enter a full job application URL, starting with https://"),
        resumeId: z.string().uuid(),
        force: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const resume = await supabase
      .from("resumes")
      .select("id, file_name")
      .eq("id", data.resumeId)
      .maybeSingle();
    if (!resume.data) throw new Error("That resume could not be found.");

    if (!data.force) {
      const existing = await supabase
        .from("applications")
        .select("id, status, created_at")
        .eq("user_id", userId)
        .eq("job_url", data.jobUrl)
        .limit(1);
      if (existing.data && existing.data.length > 0) {
        return { duplicate: true as const, applicationId: existing.data[0]!.id as string };
      }
    }

    const created = await supabase
      .from("applications")
      .insert({
        user_id: userId,
        job_url: data.jobUrl,
        resume_id: data.resumeId,
        resume_file_name: resume.data.file_name,
        status: "in_progress",
        agent_state: "RECEIVE_JOB_URL",
      })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);

    const applicationId = created.data.id as string;

    await supabase.from("run_steps").insert(
      STEP_PLAN.map((step, index) => ({
        user_id: userId,
        application_id: applicationId,
        state: step.state,
        label: step.label,
        status: "pending",
        sort_order: index,
      })),
    );

    await logAudit(supabase, userId, applicationId, "run_created", data.jobUrl);
    return { duplicate: false as const, applicationId };
  });

/* ------------------------------------------------------------ parse resume */

export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ resumeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = await supabase
      .from("resumes")
      .select("id, file_name, storage_path, mime_type")
      .eq("id", data.resumeId)
      .maybeSingle();
    if (!row.data) throw new Error("That resume could not be found.");

    try {
      const download = await supabase.storage.from("resumes").download(row.data.storage_path);
      if (download.error || !download.data) throw new Error("The resume file could not be opened.");
      const bytes = new Uint8Array(await download.data.arrayBuffer());

      const { extractResumeText } = await import("./resume-text.server");
      const text = await extractResumeText(bytes, row.data.file_name, row.data.mime_type);

      const { generateJson } = await import("./ai-gateway.server");
      const extracted = await generateJson({
        system:
          "You extract structured facts from a resume. Copy values exactly as written. Never invent, infer or embellish anything. Use null or an empty list when the resume does not state something. Keys: name, email, phone, location, summary, education[degree,branch,college,location,start_year,graduation_year,cgpa,percentage], experience[company,title,start_date,end_date,description], skills[], projects[name,description], certifications[], links[], total_years_experience.",
        prompt: `Resume text:\n\n${text}`,
        parse: (value) => RESUME_SCHEMA.parse(value),
      });

      const update = await supabase
        .from("resumes")
        .update({
          parse_status: "parsed",
          parse_error: null,
          extracted: { ...extracted, raw_text: text.slice(0, 20000) },
        })
        .eq("id", row.data.id);
      if (update.error) throw new Error(update.error.message);

      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The resume could not be read.";
      await supabase
        .from("resumes")
        .update({ parse_status: "failed", parse_error: message })
        .eq("id", row.data.id);
      return { ok: false as const, error: message };
    }
  });

/* -------------------------------------------------------------- run agent */

export const runAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const applicationId = data.applicationId;

    const appRow = await supabase
      .from("applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();
    if (!appRow.data) throw new Error("That application could not be found.");
    const application = appRow.data;

    const fail = async (state: AgentState, message: string, status: string) => {
      await setStep(supabase, applicationId, state, "failed", message);
      await supabase
        .from("applications")
        .update({ agent_state: state, status, notes: message })
        .eq("id", applicationId);
      await logAudit(supabase, userId, applicationId, `halt_${state}`, message);
      return { state, status, message };
    };

    /* ---- Fields already read live by the browser worker? (JavaScript sites) */
    const existingMappings = await supabase
      .from("field_mappings")
      .select("field_label, field_selector, field_type, is_required, options, action")
      .eq("application_id", applicationId);
    const workerFields = (existingMappings.data ?? []).filter(
      (row: any) => row.action === "needs_mapping",
    );

    type Field = { label: string; selector: string; type: string; required: boolean; options: string[] };
    let fields: Field[];
    let pageRole = application.role_title as string | null;
    let pageCompany = application.company as string | null;
    let pageDescription =
      ((application.page_snapshot as any)?.job_description as string | undefined) ?? "";

    if (workerFields.length > 0) {
      await setStep(supabase, applicationId, "OPEN_JOB", "done", "Page read live by your browser worker");
      await setStep(supabase, applicationId, "CHECK_LOGIN", "skipped", "Handled in the live browser");
      await setStep(supabase, applicationId, "INSPECT_APPLICATION", "done", "Form read by the browser worker");
      await setStep(
        supabase,
        applicationId,
        "EXTRACT_FIELDS",
        "done",
        `${workerFields.length} fields detected in the live browser`,
      );
      fields = workerFields.map((row: any) => ({
        label: row.field_label as string,
        selector: row.field_selector as string,
        type: row.field_type as string,
        required: Boolean(row.is_required),
        options: Array.isArray(row.options) ? (row.options as string[]) : [],
      }));
    } else {
      /* ---- OPEN_JOB */
      await setStep(supabase, applicationId, "OPEN_JOB", "running");
      await supabase.from("applications").update({ agent_state: "OPEN_JOB" }).eq("id", applicationId);

      const { inspectJobPage } = await import("./page-inspect.server");
      let page;
      try {
        page = await inspectJobPage(application.job_url);
      } catch (error) {
        return fail(
          "OPEN_JOB",
          `The job page could not be opened: ${error instanceof Error ? error.message : "unknown error"}`,
          "failed",
        );
      }

      if (page.automationBlocked) {
        return fail(
          "OPEN_JOB",
          "This website is blocking automated access. Open the application in your own browser instead — the agent will not try to get around anti-bot protection.",
          "blocked",
        );
      }
      await setStep(supabase, applicationId, "OPEN_JOB", "done", `Opened ${page.finalUrl}`);

      await supabase
        .from("applications")
        .update({
          company: application.company ?? page.company,
          role_title: application.role_title ?? page.role,
          // If we followed an Apply link to the real form page, remember it so
          // the browser worker opens the form directly.
          ...(page.hasApplicationForm && page.finalUrl !== application.job_url
            ? { job_url: page.finalUrl }
            : {}),
          page_snapshot: {
            final_url: page.finalUrl,
            title: page.title,
            field_count: page.fields.length,
            has_form: page.hasApplicationForm,
            js_rendered: page.jsRendered,
            job_description: page.jobDescription.slice(0, 6000),
          },
        })
        .eq("id", applicationId);

      /* ---- CHECK_LOGIN */
      await setStep(supabase, applicationId, "CHECK_LOGIN", "running");
      if (page.needsLogin) {
        await setStep(
          supabase,
          applicationId,
          "CHECK_LOGIN",
          "waiting",
          "This site requires an account before applying.",
        );
        await supabase
          .from("applications")
          .update({ agent_state: "HANDLE_ACCOUNT", status: "needs_input" })
          .eq("id", applicationId);
        await supabase.from("pending_questions").insert({
          user_id: userId,
          application_id: applicationId,
          kind: "account",
          question:
            "This website requires an account before the application form is shown. Sign in or create the account in your own browser, then paste the direct application form URL here so the agent can continue.",
          input_type: "text",
        });
        return { state: "HANDLE_ACCOUNT", status: "needs_input" };
      }
      await setStep(supabase, applicationId, "CHECK_LOGIN", "done", "No sign-in required to apply.");

      /* ---- verification signals */
      if (page.hasCaptcha || page.needsOtp) {
        await setStep(
          supabase,
          applicationId,
          "HANDLE_VERIFICATION",
          "waiting",
          page.needsOtp ? "The site asks for a one-time code." : "The site uses human verification.",
        );
      }

      /* ---- INSPECT_APPLICATION + EXTRACT_FIELDS */
      await setStep(supabase, applicationId, "INSPECT_APPLICATION", "done", page.title || null);
      await setStep(supabase, applicationId, "EXTRACT_FIELDS", "running");

      if (!page.hasApplicationForm) {
        if (page.jsRendered) {
          // JavaScript-built careers pages (Oracle, Workday, …) show nothing to a
          // plain page fetch. Hand the live reading to the browser worker instead
          // of asking the user for a URL that often does not exist.
          await setStep(
            supabase,
            applicationId,
            "EXTRACT_FIELDS",
            "waiting",
            "This site builds its form with JavaScript — your browser worker will open it and read the fields live.",
          );
          await supabase
            .from("applications")
            .update({
              agent_state: "INSPECT_APPLICATION",
              status: "waiting_for_worker",
              notes:
                "This site builds its form with JavaScript, so your browser worker will open it and read the form live. Start the worker and it picks this run up.",
            })
            .eq("id", applicationId);
          await logAudit(supabase, userId, applicationId, "js_site_handoff", page.finalUrl);
          return { state: "INSPECT_APPLICATION", status: "waiting_for_worker" };
        }
        await setStep(
          supabase,
          applicationId,
          "EXTRACT_FIELDS",
          "waiting",
          "No application form was found on this page.",
        );
        await supabase
          .from("applications")
          .update({ agent_state: "INSPECT_APPLICATION", status: "needs_input" })
          .eq("id", applicationId);
        await supabase.from("pending_questions").insert({
          user_id: userId,
          application_id: applicationId,
          kind: "account",
          question:
            "The agent could not find an application form on that page — it may load the form only after clicking Apply. Paste the direct URL of the application form so the agent can read it.",
          input_type: "text",
        });
        return { state: "INSPECT_APPLICATION", status: "needs_input" };
      }
      await setStep(
        supabase,
        applicationId,
        "EXTRACT_FIELDS",
        "done",
        `${page.fields.length} fields detected`,
      );

      fields = page.fields;
      pageRole = page.role;
      pageCompany = page.company;
      pageDescription = page.jobDescription;
    }

    /* ---- MAP_FIELDS */
    await setStep(supabase, applicationId, "MAP_FIELDS", "running");
    await supabase.from("applications").update({ agent_state: "MAP_FIELDS" }).eq("id", applicationId);

    const ctx = await loadContext(supabase, userId);
    const resume = application.resume_id
      ? await supabase
          .from("resumes")
          .select("file_name, extracted, parse_status")
          .eq("id", application.resume_id)
          .maybeSingle()
      : { data: null };
    const resumeData = (resume.data?.extracted as Record<string, unknown> | null) ?? null;

    const { generateJson, describeGatewayError } = await import("./ai-gateway.server");
    let mapped: z.infer<typeof MAPPING_SCHEMA>;
    try {
      mapped = await generateJson({
        system: [
          "You map job-application form fields to a candidate's own saved data.",
          "Understand each field from its label and type, not just its HTML name.",
          'Return {"fields":[{"selector","understood_as","value","source","confidence","reason"}]} covering every given field.',
          "Sources: account_profile, resume, saved_answer, drafted, unavailable. Confidence is 0-100.",
          "NEVER fabricate or estimate personal, legal, academic or financial facts: experience, degrees, CGPA, skills, citizenship, work authorization, salary, disability, gender, veteran status, notice period, certifications or employment history. If the candidate data does not state it, return source unavailable, value null and confidence 0.",
          "Use source 'drafted' only for open-ended motivation questions such as 'why are you interested in this role', and draft strictly from the job description, resume and profile without inventing achievements.",
          "For select fields, the value must be one of the given options, otherwise return unavailable.",
        ].join(" "),
        prompt: JSON.stringify({
          job: { role: pageRole, company: pageCompany, description: pageDescription.slice(0, 4000) },
          account_profile: ctx.profile,
          education: ctx.education,
          experience: ctx.experience,
          saved_answers: ctx.savedAnswers,
          resume: resumeData,
          fields: fields.map((field) => ({
            selector: field.selector,
            label: field.label,
            type: field.type,
            required: field.required,
            options: field.options,
          })),
        }),
        parse: (value) => MAPPING_SCHEMA.parse(value),
      });
    } catch (error) {
      return fail("MAP_FIELDS", describeGatewayError(error), "failed");
    }

    const bySelector = new Map(mapped.fields.map((field) => [field.selector, field]));

    await supabase.from("field_mappings").delete().eq("application_id", applicationId);
    await supabase.from("pending_questions").delete().eq("application_id", applicationId).is("answer", null);

    const answeredRows = await supabase
      .from("pending_questions")
      .select("question, answer")
      .eq("application_id", applicationId)
      .not("answer", "is", null);
    const answered = new Map(
      (answeredRows.data ?? []).map((row: any) => [row.question.toLowerCase(), row.answer as string]),
    );

    type Row = {
      user_id: string;
      application_id: string;
      field_label: string;
      field_selector: string;
      field_type: string;
      is_required: boolean;
      understood_as: string | null;
      mapped_value: string | null;
      source: string;
      confidence: number;
      action: string;
      fill_status: string;
      options: string[];
    };

    const rows: Row[] = fields.map((field) => {
      const guess = bySelector.get(field.selector);
      const isFileField = field.type === "file";
      let value = guess?.value?.trim() || null;
      let source: string = guess?.source ?? "unavailable";
      let confidence = Math.max(0, Math.min(100, Math.round(guess?.confidence ?? 0)));

      const priorAnswer = answered.get(field.label.toLowerCase());
      if (priorAnswer) {
        value = priorAnswer;
        source = "user_answer";
        confidence = 100;
      }

      if (isFileField) {
        value = application.resume_file_name ?? null;
        source = "resume";
        confidence = value ? 100 : 0;
      }

      if (!value) {
        source = "unavailable";
        confidence = 0;
      } else if (
        source !== "user_answer" &&
        source !== "saved_answer" &&
        source !== "resume" &&
        source !== "account_profile" &&
        isSensitive(`${field.label} ${guess?.understood_as ?? ""}`)
      ) {
        // Sensitive facts may never come from a draft or a guess.
        value = null;
        source = "unavailable";
        confidence = 0;
      }

      // Every column on the form gets a value: fill whatever we genuinely know,
      // and ask about anything left blank — required or not — so nothing is skipped.
      const action = value && confidence >= 50 ? "fill" : "ask_user";

      return {
        user_id: userId,
        application_id: applicationId,
        field_label: field.label,
        field_selector: field.selector,
        field_type: field.type,
        is_required: field.required,
        understood_as: guess?.understood_as ?? null,
        mapped_value: value,
        source,
        confidence,
        action,
        fill_status: "pending",
        options: field.options ?? [],
      };
    });

    const inserted = await supabase.from("field_mappings").insert(rows).select("id, field_label, field_type, action, is_required, mapped_value");
    if (inserted.error) return fail("MAP_FIELDS", inserted.error.message, "failed");

    const filled = rows.filter((row) => row.action === "fill").length;
    const skipped = rows.filter((row) => row.action === "skip").length;
    const asks = (inserted.data ?? []).filter((row: any) => row.action === "ask_user");

    await setStep(
      supabase,
      applicationId,
      "MAP_FIELDS",
      "done",
      `${filled} of ${rows.length} fields matched · ${asks.length} need your answer · ${skipped} optional skipped`,
    );

    /* ---- questions for anything unknown */
    if (asks.length > 0) {
      const optionsByLabel = new Map<string, string[]>(
        fields.map((field) => [field.label, (field.options ?? []).filter(Boolean)]),
      );
      await supabase.from("pending_questions").insert(
        asks.map((row: any) => {
          const fieldOptions = (optionsByLabel.get(row.field_label) ?? []).filter(
            (option) => !/^(select|choose|please select|--)/i.test(option),
          );
          const isChoice =
            fieldOptions.length > 0 || row.field_type === "checkbox" || row.field_type === "radio";
          return {
            user_id: userId,
            application_id: applicationId,
            field_mapping_id: row.id,
            kind: isSensitive(row.field_label) ? "sensitive" : "missing_info",
            question: row.field_label,
            input_type: row.field_type === "textarea" ? "textarea" : isChoice ? "choice" : "text",
            options: fieldOptions.length > 0 ? fieldOptions.slice(0, 30) : isChoice ? ["Yes", "No"] : [],
          };
        }),
      );
      await setStep(supabase, applicationId, "HANDLE_MISSING_INFORMATION", "waiting", `${asks.length} answers needed`);
      await supabase
        .from("applications")
        .update({
          agent_state: "HANDLE_MISSING_INFORMATION",
          status: "needs_input",
          missing_information: asks.map((row: any) => row.field_label),
        })
        .eq("id", applicationId);
      await logAudit(supabase, userId, applicationId, "questions_raised", `${asks.length} fields`);
      return { state: "HANDLE_MISSING_INFORMATION", status: "needs_input" };
    }

    return finishToReview(supabase, userId, applicationId);
  });

/* ------------------------------------------------------ validate + review */

async function finishToReview(supabase: any, userId: string, applicationId: string) {
  const mappings = await supabase
    .from("field_mappings")
    .select("field_label, field_type, is_required, mapped_value, action")
    .eq("application_id", applicationId);
  const rows = mappings.data ?? [];

  const missing = rows
    .filter((row: any) => row.is_required && !row.mapped_value)
    .map((row: any) => row.field_label);
  const hasResumeField = rows.some((row: any) => row.field_type === "file");

  await setStep(supabase, applicationId, "HANDLE_MISSING_INFORMATION", "done", "All questions answered");
  await setStep(
    supabase,
    applicationId,
    "UPLOAD_RESUME",
    hasResumeField ? "waiting" : "skipped",
    hasResumeField ? "Resume queued for the browser worker" : "This form has no resume upload field",
  );
  await setStep(supabase, applicationId, "FILL_FIELDS", "waiting", "Queued for the browser worker");

  if (missing.length > 0) {
    await setStep(supabase, applicationId, "VALIDATE", "failed", `Missing: ${missing.join(", ")}`);
    await supabase
      .from("applications")
      .update({ agent_state: "VALIDATE", status: "needs_input", missing_information: missing })
      .eq("id", applicationId);
    return { state: "VALIDATE", status: "needs_input", missing };
  }

  await setStep(supabase, applicationId, "VALIDATE", "done", "Required fields complete");
  await setStep(supabase, applicationId, "REVIEW", "done", "Ready for your review");
  await supabase
    .from("applications")
    .update({ agent_state: "REVIEW", status: "ready_for_review", missing_information: [] })
    .eq("id", applicationId);
  await logAudit(supabase, userId, applicationId, "ready_for_review");
  return { state: "REVIEW", status: "ready_for_review" };
}

/* ------------------------------------------------------------ answer flow */

export const answerQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        answer: z.string().min(1, "Please enter an answer."),
        saveToProfile: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const question = await supabase
      .from("pending_questions")
      .select("*")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!question.data) throw new Error("That question could not be found.");
    const row = question.data;

    await supabase
      .from("pending_questions")
      .update({
        answer: data.answer,
        answered_at: new Date().toISOString(),
        save_to_profile: data.saveToProfile,
      })
      .eq("id", row.id);

    if (data.saveToProfile) {
      await supabase.from("saved_answers").insert({
        user_id: userId,
        question: row.question,
        answer: data.answer,
      });
    }

    if (row.field_mapping_id) {
      await supabase
        .from("field_mappings")
        .update({
          mapped_value: data.answer,
          source: "user_answer",
          confidence: 100,
          action: "fill",
        })
        .eq("id", row.field_mapping_id);
    }

    if (row.kind === "account") {
      const parsed = z.string().url().safeParse(data.answer.trim());
      if (parsed.success) {
        await supabase
          .from("applications")
          .update({ job_url: parsed.data, status: "in_progress", agent_state: "RECEIVE_JOB_URL" })
          .eq("id", row.application_id);
        return { state: "RECEIVE_JOB_URL", status: "in_progress", rerun: true };
      }
      return { state: "HANDLE_ACCOUNT", status: "needs_input", rerun: false };
    }

    const remaining = await supabase
      .from("pending_questions")
      .select("id")
      .eq("application_id", row.application_id)
      .is("answer", null);
    if ((remaining.data ?? []).length > 0) {
      return { state: "HANDLE_MISSING_INFORMATION", status: "needs_input", rerun: false };
    }

    const result = await finishToReview(supabase, userId, row.application_id);
    return { ...result, rerun: false };
  });

/* ------------------------------------------------------------ draft answer */

export const draftAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ questionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const question = await supabase
      .from("pending_questions")
      .select("id, question, application_id, kind")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!question.data) throw new Error("That question could not be found.");
    if (question.data.kind === "sensitive") {
      return {
        draft: null as string | null,
        error:
          "This question asks for a personal or legal fact, so the agent will not draft it. Please answer it yourself.",
      };
    }

    const application = await supabase
      .from("applications")
      .select("job_url, company, role_title, resume_id, page_snapshot")
      .eq("id", question.data.application_id)
      .maybeSingle();
    const ctx = await loadContext(supabase, userId);
    const resume = application.data?.resume_id
      ? await supabase
          .from("resumes")
          .select("extracted")
          .eq("id", application.data.resume_id)
          .maybeSingle()
      : { data: null };

    const { getAgentModel, describeGatewayError } = await import("./ai-gateway.server");
    try {
      const result = await generateText({
        model: getAgentModel(),
        system:
          "You draft a short, honest answer to an open-ended job application question. Use only facts present in the candidate's profile and resume, and the job description. Never invent achievements, employers, dates, numbers or certifications. Keep it under 130 words, first person, plain language, no headings.",
        prompt: JSON.stringify({
          question: question.data.question,
          job: {
            company: application.data?.company,
            role: application.data?.role_title,
            description:
              (application.data?.page_snapshot as any)?.job_description?.slice(0, 3000) ?? "",
          },
          profile: ctx.profile,
          education: ctx.education,
          experience: ctx.experience,
          resume: resume.data?.extracted ?? null,
        }),
      });
      return { draft: result.text.trim(), error: null as string | null };
    } catch (error) {
      return { draft: null as string | null, error: describeGatewayError(error) };
    }
  });

/* ---------------------------------------------------------------- approve */

export const approveApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await supabase
      .from("applications")
      .select("id, status")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application.data) throw new Error("That application could not be found.");
    if (application.data.status !== "ready_for_review") {
      throw new Error("This application is not ready for submission yet.");
    }

    await setStep(supabase, data.applicationId, "SUBMIT", "waiting", "Approved — queued for the browser worker");
    await supabase
      .from("applications")
      .update({ agent_state: "USER_APPROVAL", status: "waiting_for_worker" })
      .eq("id", data.applicationId);
    await logAudit(supabase, userId, data.applicationId, "user_approved_submission");

    return {
      state: "USER_APPROVAL",
      status: "waiting_for_worker",
      message:
        "Approved. The filled application is queued for your browser worker, which performs the real form filling and submission.",
    };
  });
