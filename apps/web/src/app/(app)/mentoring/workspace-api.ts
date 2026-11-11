import { tutorPortalApi } from '../tutor-portal/client';

import { mentoringApi } from './mentoring-client';
import { WorkspaceRole, workspaceBase } from './workspace-view';

/** One request, through the bridge that belongs to the signed-in role. The API checks who is allowed again. */
export const call = (role: WorkspaceRole, path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown) =>
  (role === 'TUTOR' ? tutorPortalApi(`${workspaceBase(role)}${path}`, method, body) : mentoringApi(`${workspaceBase(role)}${path}`, method, body));
