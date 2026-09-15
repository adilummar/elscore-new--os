"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setupPassword } from "@/lib/auth/setupPasswordAction";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full mt-6" isLoading={pending}>
      Update Password
    </Button>
  );
}

export default function SetupPasswordPage() {
  const [state, formAction] = useFormState(setupPassword, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 shadow-card">
        <div className="flex flex-col items-center mb-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary">Set Up Password</h1>
          <p className="text-text-secondary mt-2 text-sm">
            Please change your temporary password to secure your account.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          {state?.error && (
            <div className="p-3 text-sm text-danger bg-red-50 border border-red-200 rounded-md">
              {state.error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="currentPassword">
              Current / Temporary Password
            </label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="newPassword">
              New Password
            </label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="confirmPassword">
              Confirm New Password
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
            />
          </div>

          <SubmitButton />
        </form>
      </Card>
    </div>
  );
}