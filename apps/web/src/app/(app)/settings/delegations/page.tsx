"use client";
import * as React from 'react';
import { Card } from '@/components/ui/Card';

export default function DelegationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Delegations</h1>
      <Card className="p-8 text-center text-gray-500">
        To delegate a permission, go to the User&apos;s profile or edit screen (to be built in User Profile view).
      </Card>
    </div>
  );
}
