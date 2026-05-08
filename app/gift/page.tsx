import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GiftClient } from './GiftClient';

export const metadata: Metadata = {
  title: 'Gift Certificate',
  description: 'Purchase a gift certificate for Object Lesson — Pasadena.',
};

export default function GiftPage() {
  return (
    <Suspense>
      <GiftClient />
    </Suspense>
  );
}
