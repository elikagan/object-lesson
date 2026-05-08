import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import { thumbUrl, heroOf, formatId } from '@/lib/items';
import type { Item } from '@/lib/types';
import styles from '../admin.module.css';
import { Topbar } from '../Topbar';

export const dynamic = 'force-dynamic';

export default async function AdminItemsList() {
  if (!(await isAdmin())) redirect('/admin');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('display_order', { ascending: true });
  const items = (data ?? []) as Item[];

  const active = items.filter((i) => !i.is_sold);
  const sold = items.filter((i) => i.is_sold);

  return (
    <div className={styles.shell}>
      <Topbar
        title={`Inventory (${items.length})`}
        right={
          <Link href="/admin/items/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            + New
          </Link>
        }
      />
      <div className={styles.body}>
        {error && <div className={styles.errorBanner}>Error loading items: {error.message}</div>}
        {items.length === 0 ? (
          <p className={styles.empty}>No items yet. Tap + New to add one.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {active.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
            {sold.length > 0 && (
              <>
                <div className={styles.archiveHeader}>Archive · {sold.length}</div>
                <ul className={styles.list}>
                  {sold.map((it) => (
                    <ItemRow key={it.id} item={it} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const thumb = thumbUrl(heroOf(item));
  return (
    <li>
      <Link href={`/admin/items/${item.id}`} className={styles.listItem}>
        {thumb ? (
          <Image src={thumb} alt="" width={56} height={56} className={styles.listThumb} unoptimized />
        ) : (
          <div className={styles.listThumb} />
        )}
        <div className={styles.listMain}>
          <div className={styles.listTitle}>{item.title}</div>
          <div className={styles.listMeta}>
            {formatId(item.id)} · ${Number(item.price).toLocaleString()}
            {item.posted_by && ` · ${item.posted_by}`}
          </div>
        </div>
        <div className={styles.listBadges}>
          {item.is_new && <span className={`${styles.badge} ${styles.badgeNew}`}>New</span>}
          {item.is_hold && <span className={`${styles.badge} ${styles.badgeHold}`}>Hold</span>}
          {item.is_sold && <span className={`${styles.badge} ${styles.badgeSold}`}>Sold</span>}
        </div>
      </Link>
    </li>
  );
}
