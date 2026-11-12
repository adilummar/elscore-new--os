import { ClassDetailClient } from './ClassDetailClient';

export default function ClassDetailPage({ params }: { params: { key: string } }) {
  return <ClassDetailClient classKey={decodeURIComponent(params.key)} />;
}
