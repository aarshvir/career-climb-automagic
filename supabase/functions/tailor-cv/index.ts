import { ApiError, fingerprint, groundedTailor, validateTailorInput } from '../_shared/core.ts';
import { authenticatedClient, configuredBillingMode, databaseError, json, readJson, serve } from '../_shared/runtime.ts';

serve(async req => {
  const { admin, user } = await authenticatedClient(req);
  const input = validateTailorInput(await readJson(req));
  const { data: existing, error: existingError } = await admin.from('application_packs').select('*').eq('user_id', user.id).eq('request_id', input.requestId).maybeSingle();
  databaseError(existingError);
  if (existing) {
    if (existing.request_fingerprint !== await fingerprint(input, existing.original_text)) throw new ApiError(409, 'REQUEST_CONFLICT', 'This request ID was already used for different inputs. Start a new request.');
    return json(req, { pack: existing });
  }
  const { data: document, error } = await admin.from('cv_documents').select('id,text_content').eq('id', input.resumeId).eq('user_id', user.id).maybeSingle();
  databaseError(error);
  if (!document) return json(req, { error: 'That CV is unavailable. Select your own CV.', code: 'CV_NOT_FOUND' }, 404);
  const result = groundedTailor(document.text_content, input.jobDescription);
  const digest = await fingerprint(input, document.text_content);
  const { data: pack, error: savedError } = await admin.rpc('jobvance_create_pack', {
    p_user_id: user.id, p_resume_id: input.resumeId, p_request_id: input.requestId, p_fingerprint: digest,
    p_job_title: input.jobTitle, p_company: input.company, p_job_url: input.jobUrl, p_job_description: input.jobDescription,
    p_original_text: result.originalText, p_tailored_text: result.tailoredText, p_matched: result.matchedKeywords, p_missing: result.missingKeywords,
    p_billing_mode: configuredBillingMode(),
  });
  databaseError(savedError);
  return json(req, { pack });
});
