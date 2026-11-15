import {
  buildStructuredResumePdf,
  type StructuredResumeExportInput,
  type StructuredResumePdfResult,
} from "./structured-resume-pdf";

/**
 * Single async entry point for resume PDF rendering.
 *
 * Selects the engine by the `RESUME_RENDER_ENGINE` env flag. It defaults to the
 * legacy canvas renderer, so production behavior is unchanged until the flag is
 * explicitly set to "react-pdf" (reversible instantly by unsetting it). Both
 * engines satisfy the same contract and throw the same error classes
 * (StructuredResumeOverflowError / StructuredResumeContentError), so every
 * caller's try/catch keeps working unchanged.
 *
 * The react-pdf engine is imported only when the flag selects it. With the flag
 * off, none of its dependencies (react-pdf, fontkit, the layout wasm) are ever
 * loaded, so they cannot affect the legacy path.
 */
export async function renderResumePdf(
  input: StructuredResumeExportInput
): Promise<StructuredResumePdfResult> {
  if (process.env.RESUME_RENDER_ENGINE?.trim() === "react-pdf") {
    const { renderStructuredResumePdfReactPdf } = await import("./react-pdf-resume");
    return renderStructuredResumePdfReactPdf(input);
  }
  return buildStructuredResumePdf(input);
}
