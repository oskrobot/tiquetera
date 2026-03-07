import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { alertError } from '../lib/error-utils';
import { ensureDemoSession } from '../services/demo-auth';
import {
  addMeals,
  ensureActiveBook,
  ensureMembership,
  ensureProfile,
  fetchBookAndHistory,
  getDemoRestaurantId,
  redeemMeal,
  Redemption,
  renewBook,
  resetDemoBook,
  updateProfileName,
} from '../services/demo-data';

export function useHomeTicketBook() {
  const [bookId, setBookId] = useState<string | null>(null);
  const [used, setUsed] = useState(0);
  const [total, setTotal] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [name, setName] = useState('Cliente Demo');
  const [savingName, setSavingName] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const loadAll = useCallback(async (id: string) => {
    try {
      setRefreshing(true);
      const { book, history } = await fetchBookAndHistory(id);
      if (book) {
        setUsed(book.meals_used ?? 0);
        setTotal(book.meals_total ?? total);
      }
      setRedemptions(history);
    } catch (error) {
      alertError('Carga', error);
    } finally {
      setRefreshing(false);
    }
  }, [total]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const user = await ensureDemoSession('customer', true);
        setUserId(user.id);

        const restaurantId = await getDemoRestaurantId();
        await ensureMembership(user.id, restaurantId, 'customer');

        const profileName = await ensureProfile(user.id);
        setName(profileName);

        const currentBook = await ensureActiveBook(user.id, restaurantId);
        setBookId(currentBook.id);
        setUsed(currentBook.meals_used ?? 0);
        setTotal(currentBook.meals_total ?? 30);

        await loadAll(currentBook.id);
      } catch (error) {
        alertError('Inicio', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      if (bookId) {
        void loadAll(bookId);
      }
    }, [bookId, loadAll]),
  );

  useEffect(() => {
    if (!bookId) return;

    const bookChannel = supabase
      .channel('book_updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ticket_books', filter: `id=eq.${bookId}` },
        (payload) => {
          const nextUsed = (payload.new as { meals_used?: number }).meals_used;
          const nextTotal = (payload.new as { meals_total?: number }).meals_total;
          if (typeof nextUsed === 'number') setUsed(nextUsed);
          if (typeof nextTotal === 'number') setTotal(nextTotal);
        },
      )
      .subscribe();

    const redemptionChannel = supabase
      .channel('redeem_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'redemptions', filter: `ticket_book_id=eq.${bookId}` },
        () => {
          void loadAll(bookId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookChannel);
      supabase.removeChannel(redemptionChannel);
    };
  }, [bookId, loadAll]);

  const redeemOne = useCallback(async () => {
    if (!bookId) return;
    try {
      const updated = await redeemMeal(bookId);
      setUsed(updated.meals_used ?? 0);
      await loadAll(bookId);
    } catch (error) {
      alertError('Canje', error);
    }
  }, [bookId, loadAll]);

  const renew = useCallback(async () => {
    if (!bookId || !userId) return;
    try {
      const newBook = await renewBook(bookId, userId);
      setBookId(newBook.id);
      setUsed(newBook.meals_used ?? 0);
      setTotal(newBook.meals_total ?? 30);
      await loadAll(newBook.id);
      Alert.alert('Listo', 'Se renovó la tiquetera.');
    } catch (error) {
      alertError('Renovación', error);
    }
  }, [bookId, userId, loadAll]);

  const addDemoMeals = useCallback(async (delta: number) => {
    if (!bookId) return;
    try {
      const updated = await addMeals(bookId, delta);
      setTotal(updated.meals_total ?? total);
    } catch (error) {
      alertError('Recarga', error);
    }
  }, [bookId, total]);

  const resetDemo = useCallback(async () => {
    if (!bookId) return;
    try {
      await resetDemoBook(bookId);
      setUsed(0);
      await loadAll(bookId);
    } catch (error) {
      alertError('Reinicio', error);
    }
  }, [bookId, loadAll]);

  const saveName = useCallback(async () => {
    if (!userId) return;
    try {
      setSavingName(true);
      await updateProfileName(userId, name.trim() || 'Cliente Demo');
      Alert.alert('Perfil', 'Nombre actualizado.');
    } catch (error) {
      alertError('Perfil', error);
    } finally {
      setSavingName(false);
    }
  }, [userId, name]);

  return {
    bookId,
    used,
    total,
    loading,
    refreshing,
    redemptions,
    name,
    setName,
    savingName,
    loadAll,
    redeemOne,
    renew,
    addDemoMeals,
    resetDemo,
    saveName,
  };
}
