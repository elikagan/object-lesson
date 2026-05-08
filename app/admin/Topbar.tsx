'use client';

import { useRouter } from 'next/navigation';
import styles from './admin.module.css';

export function Topbar({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.replace('/admin');
    router.refresh();
  }
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarTitle}>{title}</div>
      <div className={styles.topbarRight}>
        {right}
        <button className={`${styles.btn} ${styles.btnGhost}`} onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
