import { parse, type HTMLElement } from "node-html-parser";

export type DetectedField = {
  label: string;
  selector: string;
  type: string;
  required: boolean;
  options: string[];
};

export type PageInspection = {
  finalUrl: string;
  status: number;
  title: string;
  company: string | null;
  role: string | null;
  jobDescription: string;
  needsLogin: boolean;
  hasCaptcha: boolean;
  needsOtp: boolean;
  automationBlocked: boolean;
  hasApplicationForm: boolean;
  jsRendered: boolean;
  fields: DetectedField[];
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  const html = await response.text();
  return { html, status: response.status, finalUrl: response.url || url };
}

function textOf(el: HTMLElement | null | undefined) {
  return (el?.text ?? "").replace(/\s+/g, " ").trim();
}

function labelFor(root: HTMLElement, el: HTMLElement): string {
  const id = el.getAttribute("id");
  if (id) {
    const escaped = id.replace(/"/g, '\\"');
    const label = root.querySelector(`label[for="${escaped}"]`);
    if (label) return textOf(label);
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();

  let parent: HTMLElement | null = el.parentNode as HTMLElement | null;
  for (let depth = 0; parent && depth < 4; depth += 1) {
    const label = parent.querySelector("label, legend");
    if (label) {
      const value = textOf(label);
      if (value) return value;
    }
    parent = parent.parentNode as HTMLElement | null;
  }

  return (
    el.getAttribute("placeholder")?.trim() ||
    el.getAttribute("name")?.trim() ||
    el.getAttribute("id")?.trim() ||
    "Unlabelled field"
  );
}

function selectorFor(el: HTMLElement, index: number) {
  const id = el.getAttribute("id");
  if (id) return `#${id}`;
  const name = el.getAttribute("name");
  if (name) return `${el.rawTagName}[name="${name}"]`;
  return `${el.rawTagName}:nth-of-type(${index + 1})`;
}

export function extractFields(root: HTMLElement): DetectedField[] {
  const controls = root.querySelectorAll("input, select, textarea");
  const fields: DetectedField[] = [];
  const seen = new Set<string>();

  controls.forEach((el, index) => {
    const tag = el.rawTagName?.toLowerCase();
    const rawType = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "input" && ["hidden", "submit", "button", "reset", "image"].includes(rawType)) return;

    const type =
      tag === "textarea"
        ? "textarea"
        : tag === "select"
          ? el.getAttribute("multiple") != null
            ? "multiselect"
            : "select"
          : rawType || "text";

    const label = labelFor(root, el);
    const selector = selectorFor(el, index);
    const key = `${type}::${label}::${selector}`;
    if (seen.has(key)) return;
    seen.add(key);

    const options =
      tag === "select"
        ? el
            .querySelectorAll("option")
            .map((option) => textOf(option))
            .filter((value) => value.length > 0)
            .slice(0, 40)
        : [];

    const required =
      el.getAttribute("required") != null ||
      el.getAttribute("aria-required") === "true" ||
      /\*\s*$/.test(label);

    fields.push({
      label: label.replace(/\s*\*\s*$/, "").slice(0, 200),
      selector,
      type,
      required,
      options,
    });
  });

  return fields.slice(0, 120);
}

function findApplyLink(root: HTMLElement, pageUrl: string): string | null {
  const anchors = root.querySelectorAll("a[href]");
  let fallback: string | null = null;
  for (const anchor of anchors) {
    const text = textOf(anchor).toLowerCase();
    if (!/apply|application/.test(text)) continue;
    const href = anchor.getAttribute("href")?.trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    const resolved = new URL(href, pageUrl).toString();
    if (/apply/.test(text.replace(/[^a-z]/g, "")) && text.length < 40) return resolved;
    fallback = fallback ?? resolved;
  }
  return fallback;
}

export async function inspectJobPage(url: string): Promise<PageInspection> {
  let { html, status, finalUrl } = await fetchPage(url);
  let root = parse(html);

  // If this page has no usable form, follow the page's own "Apply" link
  // (job description pages often link to the real application form).
  for (let hop = 0; hop < 2 && extractFields(root).length < 3; hop += 1) {
    const applyUrl = findApplyLink(root, finalUrl);
    if (!applyUrl || applyUrl === finalUrl) break;
    try {
      const next = await fetchPage(applyUrl);
      if (next.status >= 400) break;
      html = next.html;
      status = next.status;
      finalUrl = next.finalUrl;
      root = parse(html);
    } catch {
      break;
    }
  }

  const lower = html.toLowerCase();

  const metaTitle =
    root.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    textOf(root.querySelector("title"));
  const heading = textOf(root.querySelector("h1")) || null;
  const siteName =
    root.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() || null;

  const bodyRoot = root.querySelector("main") ?? root.querySelector("body");
  bodyRoot?.querySelectorAll("script, style, noscript, template").forEach((node) => node.remove());
  const bodyText = textOf(bodyRoot).slice(0, 8000);

  const fields = extractFields(root);

  // A page with almost no visible text and no form is a JavaScript app shell
  // (Oracle, Workday, SAP SuccessFactors, …). Only a real browser can read it.
  const jsRendered = fields.length < 3 && bodyText.length < 1500;

  let role = heading || metaTitle || null;
  let company = siteName;
  if (metaTitle && metaTitle.includes(" at ")) {
    const parts = metaTitle.split(" at ");
    role = role || (parts[0] ?? "").trim();
    company = company || (parts[1] ?? "").trim();
  }
  if (!company) {
    const host = new URL(finalUrl).hostname.replace(/^www\./, "");
    const greenhouse = finalUrl.match(/job-boards?\.greenhouse\.io\/([^/]+)/);
    company = greenhouse?.[1] ? greenhouse[1].replace(/[-_]/g, " ") : host;
  }

  return {
    finalUrl,
    status,
    title: metaTitle || "",
    company: company?.slice(0, 120) ?? null,
    role: role?.slice(0, 160) ?? null,
    jobDescription: bodyText,
    needsLogin:
      /sign in to apply|log in to apply|please sign in|create an account to apply/.test(lower) ||
      (fields.some((f) => f.type === "password") && fields.length <= 4),
    hasCaptcha: /recaptcha|hcaptcha|cf-turnstile|are you a robot|captcha/.test(lower),
    needsOtp: /one[- ]time (code|password)|verification code|enter the code we sent|otp/.test(lower),
    automationBlocked:
      status === 403 ||
      status === 429 ||
      /access denied|request blocked|unusual traffic|enable javascript and cookies to continue/.test(
        lower,
      ),
    hasApplicationForm: fields.length >= 3,
    jsRendered,
    fields,
  };
}
