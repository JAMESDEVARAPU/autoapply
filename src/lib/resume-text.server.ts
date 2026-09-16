import { unzipSync, strFromU8 } from "fflate";

const MAX_TEXT = 60000;

function cleanup(text: string) {
  return text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
}

async function pdfToText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function docxToText(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("This DOCX file has no readable document content.");
  const xml = strFromU8(doc);
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function extractResumeText(
  bytes: Uint8Array,
  fileName: string,
  mimeType?: string | null,
): Promise<string> {
  const name = fileName.toLowerCase();
  const isPdf = name.endsWith(".pdf") || mimeType === "application/pdf";
  const isDocx =
    name.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  let text: string;
  if (isPdf) {
    text = await pdfToText(bytes);
  } else if (isDocx) {
    text = docxToText(bytes);
  } else {
    throw new Error("Only PDF and DOCX resumes are supported.");
  }

  const cleaned = cleanup(text);
  if (cleaned.length < 40) {
    throw new Error(
      "No text could be read from this file. If it is a scanned image, please upload a text-based PDF or DOCX.",
    );
  }
  return cleaned;
}
