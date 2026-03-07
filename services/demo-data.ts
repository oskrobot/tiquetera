import { supabase } from '../lib/supabase';

export const MAX_TOTAL = 30;

export type Redemption = { id: string; redeemed_at: string };

export async function getDemoRestaurantId() {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id')
    .eq('name', 'Restaurante Demo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) throw error ?? new Error('Falta restaurante Demo');
  return data.id as string;
}

export async function ensureMembership(userId: string, restaurantId: string, role: 'customer' | 'staff') {
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId)
    .limit(1);

  if (error) throw error;
  if (!data?.length) {
    const { error: insertError } = await supabase
      .from('memberships')
      .insert([{ user_id: userId, restaurant_id: restaurantId, role }]);
    if (insertError) throw insertError;
  }
}

export async function ensureProfile(userId: string, fallbackName = 'Cliente Demo') {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data.full_name || fallbackName;

  const { error: insertError } = await supabase
    .from('profiles')
    .insert([{ id: userId, full_name: fallbackName }]);

  if (insertError) throw insertError;
  return fallbackName;
}

export async function getDemoPlan(restaurantId: string) {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('id, meals_total')
    .eq('restaurant_id', restaurantId)
    .eq('name', 'Plan 30')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return {
    id: data?.id ?? null,
    mealsTotal: data?.meals_total ?? MAX_TOTAL,
  };
}

export async function ensureActiveBook(userId: string, restaurantId: string) {
  const plan = await getDemoPlan(restaurantId);

  const { data: existingBook, error: selectError } = await supabase
    .from('ticket_books')
    .select('*')
    .eq('user_id', userId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existingBook) return existingBook;

  const { data: createdBook, error: insertError } = await supabase
    .from('ticket_books')
    .insert([
      {
        user_id: userId,
        meals_total: plan.mealsTotal,
        restaurant_id: restaurantId,
        meal_plan_id: plan.id,
        status: 'active',
      },
    ])
    .select('*')
    .maybeSingle();

  if (insertError || !createdBook) throw insertError ?? new Error('No se pudo crear la tiquetera');
  return createdBook;
}

export async function fetchBookAndHistory(bookId: string) {
  const [{ data: book, error: bookError }, { data: history, error: historyError }] = await Promise.all([
    supabase.from('ticket_books').select('*').eq('id', bookId).limit(1).maybeSingle(),
    supabase
      .from('redemptions')
      .select('id, redeemed_at')
      .eq('ticket_book_id', bookId)
      .order('redeemed_at', { ascending: false })
      .limit(10),
  ]);

  if (bookError) throw bookError;
  if (historyError) throw historyError;

  return { book, history: (history ?? []) as Redemption[] };
}

export async function updateProfileName(userId: string, name: string) {
  const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', userId);
  if (error) throw error;
}

export async function redeemMeal(bookId: string) {
  const { data: book, error: bookError } = await supabase
    .from('ticket_books')
    .select('*')
    .eq('id', bookId)
    .limit(1)
    .maybeSingle();

  if (bookError || !book) throw bookError ?? new Error('No se encontró la tiquetera');

  const remaining = (book.meals_total ?? 0) - (book.meals_used ?? 0);
  if (remaining <= 0) throw new Error('Sin saldo disponible.');

  const { error: redemptionError } = await supabase.from('redemptions').insert([{ ticket_book_id: bookId }]);
  if (redemptionError) throw redemptionError;

  const { data: updated, error: updateError } = await supabase
    .from('ticket_books')
    .update({ meals_used: (book.meals_used ?? 0) + 1 })
    .eq('id', bookId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) throw updateError ?? new Error('No se pudo actualizar el saldo');
  return updated;
}

export async function renewBook(bookId: string, userId: string) {
  const { data: book, error: bookError } = await supabase
    .from('ticket_books')
    .select('id, restaurant_id, meal_plan_id')
    .eq('id', bookId)
    .limit(1)
    .maybeSingle();

  if (bookError || !book) throw bookError ?? new Error('No se encontró la tiquetera');

  const { data: plan } = await supabase
    .from('meal_plans')
    .select('id, meals_total')
    .eq('id', book.meal_plan_id)
    .limit(1)
    .maybeSingle();

  const { error: expireError } = await supabase.from('ticket_books').update({ status: 'expired' }).eq('id', bookId);
  if (expireError) throw expireError;

  const { data: created, error: createError } = await supabase
    .from('ticket_books')
    .insert([
      {
        user_id: userId,
        meals_total: plan?.meals_total ?? MAX_TOTAL,
        restaurant_id: book.restaurant_id,
        meal_plan_id: plan?.id ?? null,
        status: 'active',
      },
    ])
    .select('*')
    .maybeSingle();

  if (createError || !created) throw createError ?? new Error('No se pudo renovar la tiquetera');
  return created;
}

export async function addMeals(bookId: string, delta: number) {
  const { data: book, error: bookError } = await supabase
    .from('ticket_books')
    .select('meals_total')
    .eq('id', bookId)
    .limit(1)
    .maybeSingle();

  if (bookError || !book) throw bookError ?? new Error('No se encontró la tiquetera');

  const nextTotal = (book.meals_total ?? MAX_TOTAL) + delta;
  if (nextTotal > MAX_TOTAL) {
    throw new Error(`El máximo por tiquetera es ${MAX_TOTAL}.`);
  }

  const { data: updated, error: updateError } = await supabase
    .from('ticket_books')
    .update({ meals_total: nextTotal })
    .eq('id', bookId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) throw updateError ?? new Error('No se pudo recargar');
  return updated;
}

export async function resetDemoBook(bookId: string) {
  const { error: deleteError } = await supabase.from('redemptions').delete().eq('ticket_book_id', bookId);
  if (deleteError) throw deleteError;

  const { data: updated, error: updateError } = await supabase
    .from('ticket_books')
    .update({ meals_used: 0 })
    .eq('id', bookId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) throw updateError ?? new Error('No se pudo reiniciar');
  return updated;
}
