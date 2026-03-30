/**
 * pages/review/[id].js — redirect shim
 *
 * Routes old /review/{id} bookmarks to /internal-review/{id}.
 * The review workflow now uses stage-specific pages.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ReviewRedirect() {
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (id) router.replace(`/internal-review/${id}`);
  }, [id, router]);

  return null;
}
