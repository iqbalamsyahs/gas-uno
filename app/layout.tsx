import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'UNO' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1b5e20' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
