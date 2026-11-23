"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/components/providers/AuthProvider';
import { visibleSections } from './_components/TutorNav';
import { NoAccess } from './hiring/_components/kit';

/** Opens the first Tutor Management section this user can use (Hiring for most HR staff, Coordination for coordinators). */
export default function TutorHrPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const first = visibleSections(hasPermission)[0];
  useEffect(() => { if (first) router.replace(first.href); }, [first, router]);
  return first ? null : <NoAccess what="Tutor Management" />;
}
