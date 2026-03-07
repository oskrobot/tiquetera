import { useCallback, useEffect, useMemo, useState } from 'react';
import { alertError } from '../lib/error-utils';
import { supabase } from '../lib/supabase';
import { ensureDemoSession } from '../services/demo-auth';
import { ensureActiveBook, ensureMembership, getDemoRestaurantId } from '../services/demo-data';

const TOKEN_TTL_MS = 2 * 60 * 1000;
const AUTO_REFRESH_BEFORE_MS = 15 * 1000;

export function useQrToken() {
  const [bookId, setBookId] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const issueToken = useCallback(async (targetBookId: string) => {
    try {
      setIssuing(true);
      const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
      const { data, error } = await supabase
        .from('qr_tokens')
        .insert([{ book_id: targetBookId, expires_at: expires }])
        .select('nonce, expires_at')
        .maybeSingle();

      if (error || !data?.nonce) throw error ?? new Error('No se pudo generar QR.');

      setNonce(String(data.nonce));
      setExpiresAt(data.expires_at);
    } catch (error) {
      alertError('QR', error);
    } finally {
      setIssuing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const user = await ensureDemoSession('customer');
        const restaurantId = await getDemoRestaurantId();
        await ensureMembership(user.id, restaurantId, 'customer');
        const activeBook = await ensureActiveBook(user.id, restaurantId);
        setBookId(activeBook.id);
        await issueToken(activeBook.id);
      } catch (error) {
        alertError('QR', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [issueToken]);

  useEffect(() => {
    if (!bookId || !expiresAt) return;

    const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
    const msUntilRefresh = Math.max(msUntilExpiry - AUTO_REFRESH_BEFORE_MS, 0);

    const timer = setTimeout(() => {
      void issueToken(bookId);
    }, msUntilRefresh);

    return () => clearTimeout(timer);
  }, [bookId, expiresAt, issueToken]);


  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsRemaining = useMemo(() => {
    if (!expiresAt) return 0;
    return Math.max(Math.ceil((new Date(expiresAt).getTime() - now) / 1000), 0);
  }, [expiresAt, now]);

  return {
    bookId,
    nonce,
    expiresAt,
    secondsRemaining,
    loading,
    issuing,
    issueToken,
  };
}
