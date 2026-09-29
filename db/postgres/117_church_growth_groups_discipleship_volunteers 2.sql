-- Growth groups, discipleship pathways, and volunteer scheduling.
-- Foundation keeps basic ministries, participation, and volunteer interest only.
-- No Network multi-branch volunteer pools. Ministry pages unchanged.

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_groups (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  meeting_day_of_week SMALLINT,
  meeting_time TIME,
  meeting_location TEXT NOT NULL DEFAULT '',
  closed_at TIMESTAMPTZ,
  closed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  closure_reason TEXT,
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_groups_status_check CHECK (status IN ('active', 'closed')),
  CONSTRAINT church_groups_capacity_check CHECK (capacity IS NULL OR capacity >= 1),
  CONSTRAINT church_groups_dow_check CHECK (meeting_day_of_week IS NULL OR meeting_day_of_week BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_church_groups_branch_status
  ON public.church_groups (branch_id, status);

CREATE TABLE IF NOT EXISTS public.church_group_leaders (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.church_groups (id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  role_label TEXT NOT NULL DEFAULT 'leader',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_group_leaders_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT church_group_leaders_person_check CHECK (member_id IS NOT NULL OR admin_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_group_leaders_unique_member
  ON public.church_group_leaders (group_id, member_id) WHERE member_id IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS public.church_group_memberships (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.church_groups (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  waitlisted_at TIMESTAMPTZ,
  transferred_from_group_id INTEGER REFERENCES public.church_groups (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_group_memberships_status_check
    CHECK (status IN ('active', 'waitlisted', 'left', 'transferred'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_group_memberships_open
  ON public.church_group_memberships (group_id, member_id)
  WHERE status IN ('active', 'waitlisted');

CREATE TABLE IF NOT EXISTS public.church_group_join_requests (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.church_groups (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ,
  decided_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_group_join_requests_status_check
    CHECK (status IN ('pending', 'approved', 'declined', 'waitlisted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_group_join_requests_pending
  ON public.church_group_join_requests (group_id, member_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.church_group_meetings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.church_groups (id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_recurring_instance BOOLEAN NOT NULL DEFAULT false,
  recurrence_series_key TEXT,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_group_meetings_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_church_group_meetings_group
  ON public.church_group_meetings (group_id, starts_at);

CREATE TABLE IF NOT EXISTS public.church_group_attendance (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.church_groups (id) ON DELETE CASCADE,
  meeting_id INTEGER NOT NULL REFERENCES public.church_group_meetings (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT true,
  recorded_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_group_attendance_unique UNIQUE (meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.church_group_notes (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.church_groups (id) ON DELETE CASCADE,
  note_body TEXT NOT NULL,
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Discipleship
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_discipleship_stages (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_discipleship_stages_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS public.church_discipleship_milestones (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL REFERENCES public.church_discipleship_stages (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.church_member_discipleship (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL REFERENCES public.church_discipleship_stages (id) ON DELETE RESTRICT,
  owner_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_member_discipleship_status_check CHECK (status IN ('active', 'completed', 'paused')),
  CONSTRAINT church_member_discipleship_member_unique UNIQUE (member_id)
);

CREATE TABLE IF NOT EXISTS public.church_discipleship_history (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  from_stage_id INTEGER REFERENCES public.church_discipleship_stages (id) ON DELETE SET NULL,
  to_stage_id INTEGER NOT NULL REFERENCES public.church_discipleship_stages (id) ON DELETE RESTRICT,
  milestone_id INTEGER REFERENCES public.church_discipleship_milestones (id) ON DELETE SET NULL,
  movement_reason TEXT NOT NULL DEFAULT '',
  moved_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_discipleship_history_member
  ON public.church_discipleship_history (member_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Volunteer scheduling (beyond duty roster / interest list)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_volunteer_roles (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_volunteer_roles_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT church_volunteer_roles_branch_name_unique UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS public.church_volunteer_skills (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_volunteer_skills_branch_name_unique UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS public.church_volunteer_role_skills (
  role_id INTEGER NOT NULL REFERENCES public.church_volunteer_roles (id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES public.church_volunteer_skills (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.church_volunteer_member_skills (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES public.church_volunteer_skills (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_volunteer_member_skills_unique UNIQUE (member_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.church_volunteer_availability (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_volunteer_availability_dow_check CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT church_volunteer_availability_time_check CHECK (end_time > start_time),
  CONSTRAINT church_volunteer_availability_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS public.church_volunteer_shifts (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES public.church_volunteer_roles (id) ON DELETE RESTRICT,
  title TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  slots INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_volunteer_shifts_range_check CHECK (ends_at > starts_at),
  CONSTRAINT church_volunteer_shifts_slots_check CHECK (slots >= 1),
  CONSTRAINT church_volunteer_shifts_status_check CHECK (status IN ('open', 'filled', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.church_volunteer_assignments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  shift_id INTEGER NOT NULL REFERENCES public.church_volunteer_shifts (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned',
  assigned_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_volunteer_assignments_status_check
    CHECK (status IN ('assigned', 'confirmed', 'completed', 'declined', 'cancelled')),
  CONSTRAINT church_volunteer_assignments_unique UNIQUE (shift_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_church_volunteer_assignments_member_window
  ON public.church_volunteer_assignments (member_id, status);
