// Supabase Configuration — values are loaded from .env (VITE_ prefix for Vite)
// Configure your credentials in .env (copy from .env.example).
// The anon key is intentionally public; real access control relies on RLS policies.

export const supabaseConfig = {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    productionUrl: import.meta.env.VITE_PRODUCTION_URL,

    getRedirectUrl: function() {
        return this.productionUrl + '/index.html';
    }
};
