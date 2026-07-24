# Manual, Progressive Logo Generation Design

## Goal

Keep the existing Logo parameters and their defaults unchanged, but require a user click before the first Logo generation begins. Show each real generated Logo as soon as it becomes available instead of waiting for the whole batch.

## Scope

- Keep the current Logo type, font style and weight, color preference, avoided elements, quantity, and supplementary-style inputs unchanged.
- Keep `不限` and every existing default valid for manual generation; do not add required-parameter validation.
- Remove the first-entry automatic generation from Step 2.
- Preserve the existing manual generate button and variation-generation flow.
- Apply progressive display only to Logo generation. Do not change the other image-generation pages.

## Data flow

1. The user enters Step 2 and changes zero or more existing preferences.
2. The user clicks the existing manual generation button.
3. The API creates one image job and retains a partial result while it is running.
4. Each fulfilled upstream image immediately updates that job's partial image list.
5. The client polling layer detects a changed partial result and calls the Logo generator progress callback.
6. The Logo page appends that candidate to the current generation round, so each completed image becomes visible immediately.
7. On completion, the final response reconciles any result not already appended. If at least one image succeeded, keep those candidates; show an error only if none succeeded.

## Error handling

- A failed individual image does not remove already displayed candidates.
- A batch with no generated image retains the current error message.
- Existing API-side validation still runs before the job is created.

## Verification

- Source regression coverage proves Step 2 has no automatic-generation effect and has a manual progress callback chain.
- Image-job manager tests prove partial job results can be read before completion.
- Existing image and rendered-HTML tests continue to pass.
