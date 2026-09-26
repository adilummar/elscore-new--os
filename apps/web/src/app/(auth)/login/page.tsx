'use client';

import * as React from 'react';
import { login } from '@/lib/api/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export default function LoginPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await login({ email, password });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Hard navigation so the browser sends the newly set HttpOnly cookies
      if (result.mustChangePassword) {
        window.location.href = '/setup-password';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-floating">
        <CardHeader className="text-center pb-8 pt-8">
          <div className="w-12 h-12 bg-brand-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <span className="text-white font-bold text-xl">EL</span>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Sign in to OS</CardTitle>
          <p className="text-slate-500 mt-2 text-sm">Learn · Grow · Succeed</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">Email address</label>
              <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@elscore.internal" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full mt-6" isLoading={isLoading}>
              Sign In
            </Button>
          </form>
          
          <div className="mt-8 border-t border-slate-100 pt-6">
            {process.env.NEXT_PUBLIC_APP_ENV === 'staging' && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 text-center">Quick Login (Testing)</p>
                <div className="flex flex-wrap gap-2 justify-center">
              {[
                { label: 'Admin/CEO', email: 'admin@elscore.internal', pass: 'Admin@123!' },
                { label: 'UAT Sales A', email: 'uat_sca@elscore.test', pass: 'Test@1234!' },
                { label: 'UAT Sales B', email: 'uat_scb@elscore.test', pass: 'Test@1234!' },
                { label: 'UAT Sales Head', email: 'uat_sh@elscore.test', pass: 'Test@1234!' },
                { label: 'Fin. Counsellor', email: 'counsellor-finance-conc@elscore.internal', pass: 'Test@1234!' },
              ].map((acc) => (
                <button
                  key={acc.label}
                  type="button"
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-full transition-colors border border-slate-200"
                  onClick={() => {
                    const form = document.querySelector('form');
                    if (form) {
                      const emailInput = form.elements.namedItem('email') as HTMLInputElement;
                      const passInput = form.elements.namedItem('password') as HTMLInputElement;
                      
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      
                      if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(emailInput, acc.email);
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        nativeInputValueSetter.call(passInput, acc.pass);
                        passInput.dispatchEvent(new Event('input', { bubbles: true }));
                      } else {
                        emailInput.value = acc.email;
                        passInput.value = acc.pass;
                      }
                    }
                  }}
                >
                  {acc.label}
                </button>
              ))}
            </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}