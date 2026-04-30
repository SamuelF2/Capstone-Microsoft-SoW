/**
 * Constants for the Microsoft Default Workflow's shared-services group picker.
 *
 * SHARED_SERVICES_GROUPS is the canonical list of named groups whose presence
 * activates a corresponding sub-role in `shared_services_review` (UX → ux-services-lead,
 * etc.). Authors can also add free-text "Other: ..." entries to the list; those
 * still count toward keeping the Shared Services Review branch active but do
 * NOT activate any sub-role (handled by the lead-only requirement).
 *
 * Keep these strings in lockstep with the role `required_if` predicates in
 * `backend/seeds/microsoft_workflow.py`. Renaming a group here without updating
 * the seed will silently break the conditional sub-role activation.
 */

export const SHARED_SERVICES_GROUPS = ['UX', 'ACM', 'Data & AI', 'Industry Solutions Delivery'];

export const OTHER_PREFIX = 'Other: ';

export const MICROSOFT_WORKFLOW_TEMPLATE_NAME = 'Microsoft Default Workflow';
