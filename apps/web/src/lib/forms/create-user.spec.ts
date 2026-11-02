import { readFileSync } from 'fs';
import { join } from 'path';

import { CreateUserForm, validateCreateUserForm } from './create-user';

const valid: CreateUserForm = {
  email: 'head@example.com',
  password: 'a-long-enough-password',
  firstName: 'Asha',
  lastName: 'Menon',
  departmentId: 'dept-1',
  roleId: 'role-1',
};

describe('validateCreateUserForm', () => {
  it('accepts a complete form', () => {
    expect(validateCreateUserForm(valid)).toEqual([]);
  });

  it('catches the case that failed on staging: first and last name empty', () => {
    expect(validateCreateUserForm({ ...valid, firstName: '', lastName: '' })).toEqual(['First name is required.', 'Last name is required.']);
  });

  it('treats whitespace-only names as empty', () => {
    expect(validateCreateUserForm({ ...valid, firstName: '   ', lastName: '\t' })).toHaveLength(2);
  });

  it('reports every missing field at once', () => {
    const problems = validateCreateUserForm({ email: '', password: '', firstName: '', lastName: '', departmentId: '', roleId: '' });
    expect(problems).toEqual([
      'Email is required.',
      'Password is required.',
      'First name is required.',
      'Last name is required.',
      'Select a department.',
      'Select a role.',
    ]);
  });

  it('rejects a malformed email and accepts a padded valid one', () => {
    expect(validateCreateUserForm({ ...valid, email: 'not-an-email' })).toEqual(['Enter a valid email address.']);
    expect(validateCreateUserForm({ ...valid, email: '  head@example.com ' })).toEqual([]);
  });

  it('requires a department and a role', () => {
    expect(validateCreateUserForm({ ...valid, departmentId: '' })).toEqual(['Select a department.']);
    expect(validateCreateUserForm({ ...valid, roleId: '' })).toEqual(['Select a role.']);
  });
});

describe('Users page wiring', () => {
  const page = readFileSync(join(__dirname, '../../app/(app)/settings/users/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const handler = page.slice(page.indexOf('const handleCreate'), page.indexOf('const handleStatus'));

  it('validates before submitting and reads the action result instead of relying on a thrown error', () => {
    expect(handler).toContain('validateCreateUserForm(formData)');
    expect(handler).toContain('result.ok');
    expect(handler.indexOf('validateCreateUserForm')).toBeLessThan(handler.indexOf('createUserAction('));
  });

  it('shows errors inline and no longer uses alert() for creation', () => {
    expect(handler).not.toContain('alert(');
    expect(page).toContain('role="alert"');
  });
});
