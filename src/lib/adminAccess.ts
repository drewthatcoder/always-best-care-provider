import { supabase } from '@/integrations/supabase/client';

/**
 * Admin check via has_role (SECURITY DEFINER), which works even when user_roles
 * has no SELECT policy. Falls back to the caller's own role row after the
 * "Users can read their own roles" policy exists.
 */
export const userIsAdmin = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'admin',
  });

  if (!error) return data === true;

  const { data: row, error: rowError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (rowError) return false;
  return row?.role === 'admin';
};
