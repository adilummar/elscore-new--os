-- READ-ONLY dry run for the Tutor Hiring backfill. Contains SELECTs only. Review output before any backfill is approved.

-- 1. Old stage -> proposed new stage/decision mapping, with counts
SELECT current_stage,
  CASE current_stage
    WHEN 'LEAD' THEN 'LEAD' WHEN 'DETAILS_SHARED' THEN 'DETAILS_SHARED'
    WHEN 'CV_SHARED' THEN 'CV' WHEN 'DEMO' THEN 'LIVE_DEMO_INTERVIEW'
    WHEN 'TRAINING' THEN 'LIVE_DEMO_INTERVIEW' WHEN 'READY_FOR_ASSIGNMENT' THEN 'LIVE_DEMO_INTERVIEW'
    ELSE '(derive from stage history)' END AS proposed_stage,
  CASE current_stage
    WHEN 'TRAINING' THEN 'HIRED' WHEN 'READY_FOR_ASSIGNMENT' THEN 'HIRED'
    WHEN 'REJECTED' THEN 'REJECTED' WHEN 'NOT_INTERESTED' THEN 'NOT_INTERESTED'
    ELSE NULL END AS proposed_decision,
  COUNT(*) AS leads
FROM tutor_leads WHERE deleted_at IS NULL GROUP BY current_stage ORDER BY current_stage;

-- 2. REJECTED / NOT_INTERESTED leads: last stage reached before the outcome (NULL = cannot derive, needs manual review)
SELECT l.business_id, l.current_stage,
  (SELECT h.previous_stage FROM tutor_lead_stage_history h
    WHERE h.tutor_lead_id = l.id AND h.new_stage = l.current_stage
    ORDER BY h.changed_at DESC LIMIT 1) AS last_stage_before_outcome
FROM tutor_leads l WHERE l.deleted_at IS NULL AND l.current_stage IN ('REJECTED','NOT_INTERESTED');

-- 3. Phone conflicts: leads that would collide once formatting is stripped (assumes +91 default; review before unique index)
SELECT regexp_replace(phone, '\D', '', 'g') AS digits, COUNT(*) AS leads, array_agg(business_id) AS candidate_ids
FROM tutor_leads WHERE deleted_at IS NULL
GROUP BY 1 HAVING COUNT(*) > 1;

-- 4. Phones that look invalid for the default country (not 10-digit Indian mobile after stripping 0/91 prefixes)
SELECT business_id, phone FROM tutor_leads
WHERE deleted_at IS NULL
  AND regexp_replace(regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^91(?=\d{10}$)', ''), '^0+', '') !~ '^[6-9]\d{9}$';
