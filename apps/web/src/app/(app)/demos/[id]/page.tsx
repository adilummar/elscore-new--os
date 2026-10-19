import { Metadata } from 'next';
import { DemoDetailClient } from './components/DemoDetailClient';
import { getDemoById } from '../actions';

export const metadata: Metadata = {
  title: 'Demo Detail | EL SCORE OS',
};

export default async function DemoDetailPage({ params }: { params: { id: string } }) {
  let initialDemo: any = null;
  let initialError: string | null = null;

  try {
    const res = await getDemoById(params.id);
    initialDemo = res?.data || res;
  } catch (err: any) {
    console.error(`[SSR] Failed to prefetch demo ${params.id}:`, err?.message || err);
    initialError = err?.message || 'Failed to load demo detail';
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DemoDetailClient
        id={params.id}
        initialDemo={initialDemo}
        initialError={initialError}
      />
    </div>
  );
}
