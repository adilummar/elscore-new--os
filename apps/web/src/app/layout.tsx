import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EL SCORE OS',
  description: 'Internal operating system for El Score Academy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
