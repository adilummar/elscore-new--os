import { Metadata } from 'next';
import { DemoDetailClient } from './components/DemoDetailClient';

export const metadata: Metadata = {
  title: 'Demo Detail | EL SCORE OS',
};

export default function DemoDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DemoDetailClient id={params.id} />
    </div>
  );
}
