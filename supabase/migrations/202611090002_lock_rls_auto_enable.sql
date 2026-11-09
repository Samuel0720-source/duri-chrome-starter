-- Supabase's RLS auto-enable event trigger function should not be callable through the API.
-- Event triggers still run it on CREATE TABLE; EXECUTE is not checked for them.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
