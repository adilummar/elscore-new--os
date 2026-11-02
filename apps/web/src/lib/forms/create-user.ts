export interface CreateUserForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  departmentId: string;
  roleId: string;
}

/** Required-field check run before the form is sent, so the user sees what is missing instead of an API error. */
export function validateCreateUserForm(form: CreateUserForm): string[] {
  const problems: string[] = [];
  const email = form.email.trim();
  if (!email) problems.push('Email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('Enter a valid email address.');
  if (!form.password) problems.push('Password is required.');
  if (!form.firstName.trim()) problems.push('First name is required.');
  if (!form.lastName.trim()) problems.push('Last name is required.');
  if (!form.departmentId) problems.push('Select a department.');
  if (!form.roleId) problems.push('Select a role.');
  return problems;
}
