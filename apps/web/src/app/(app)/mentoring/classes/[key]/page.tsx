import { ClassDetailClient } from './ClassDetailClient';

export default function ClassDetailPage({ params, searchParams }: { params: { key: string }; searchParams?: { tab?: string } }) {
  return <ClassDetailClient classKey={decodeURIComponent(params.key)} initialTab={typeof searchParams?.tab === 'string' ? searchParams.tab : undefined} />;
}
