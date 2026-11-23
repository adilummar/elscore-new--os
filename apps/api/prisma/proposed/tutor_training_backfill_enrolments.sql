-- PROPOSED, NOT APPLIED. Run after tutor_training_phase_b.sql.
-- Candidates marked Hired before Training existed have no enrolment. New Hired decisions create one
-- automatically. This creates the missing rows, attributed to whoever recorded the Hired decision.

BEGIN;

-- Preview: Hired candidates without an enrolment, and who marked them Hired.
SELECT l.business_id, l.decision_at,
  (SELECT h.changed_by_user_id FROM tutor_lead_decision_history h
    WHERE h.tutor_lead_id = l.id AND h.new_decision = 'HIRED' ORDER BY h.changed_at DESC LIMIT 1) AS hired_by
FROM tutor_leads l
WHERE l.deleted_at IS NULL AND l.decision = 'HIRED'
  AND NOT EXISTS (SELECT 1 FROM tutor_training_enrolments e WHERE e.tutor_lead_id = l.id);

INSERT INTO tutor_training_enrolments (id, tutor_lead_id, enrolled_at, enrolled_by_user_id)
SELECT gen_random_uuid()::text, l.id, COALESCE(l.decision_at, l.updated_at), h.changed_by_user_id
FROM tutor_leads l
JOIN LATERAL (
  SELECT changed_by_user_id FROM tutor_lead_decision_history
  WHERE tutor_lead_id = l.id AND new_decision = 'HIRED' ORDER BY changed_at DESC LIMIT 1
) h ON TRUE
WHERE l.deleted_at IS NULL AND l.decision = 'HIRED'
  AND NOT EXISTS (SELECT 1 FROM tutor_training_enrolments e WHERE e.tutor_lead_id = l.id);

-- COMMIT only if the INSERT count matches the preview; otherwise ROLLBACK.
-- COMMIT;
