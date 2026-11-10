import {
  buildStructuredResumePdf,
  type StructuredResumeExportInput,
  type StructuredResumePdfResult,
} from "./structured-resume-pdf";
import { renderStructuredResumePdfReactPdf } from "./react-pdf-resume";

/**
 * Single async entry point for resume PDF rendering.
 *
 * Selects the engine by the `RESUME_RENDER_ENGINE` env flag. It defaults to the
 * legacy canvas renderer, so production behavior is unchanged until the flag is
 * explicitly set to "react-pdf" (reversible instantly by unsetting it). Both
 * engines satisfy the same contract and throw the same error classes
 * (StructuredResumeOverflowError / StructuredResumeContentError), so every
 * caller's try/catch keeps working unchanged.
 */
export async function renderResumePdf(
  input: StructuredResumeExportInput
): Promise<StructuredResumePdfResult> {
  if (process.env.RESUME_RENDER_ENGINE?.trim() === "react-pdf") {
    return renderStructuredResumePdfReactPdf(input);
  }
  return buildStructuredResumePdf(input);
}
