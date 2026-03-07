import { supabase } from '../lib/supabase';

const DEMO_PASSWORD = 'Demo1234!';

export const DEMO_ACCOUNTS = {
  customer: 'demo@tiquetera.com',
  staff: 'staff@tiquetera.com',
} as const;

async function signInOrSignUp(email: string, password: string) {
  const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
  if (signInData?.user) return signInData.user;

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  const { data: afterSignUp, error: secondSignInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (secondSignInError || !afterSignUp?.user) {
    throw secondSignInError ?? new Error('No se pudo iniciar sesión con usuario demo.');
  }

  return afterSignUp.user;
}

export async function ensureDemoSession(kind: keyof typeof DEMO_ACCOUNTS, forceSignOut = false) {
  if (forceSignOut) {
    await supabase.auth.signOut();
  }

  const session = await supabase.auth.getSession();
  const activeUser = session.data.session?.user;
  if (activeUser?.email === DEMO_ACCOUNTS[kind]) {
    return activeUser;
  }

  return signInOrSignUp(DEMO_ACCOUNTS[kind], DEMO_PASSWORD);
}
