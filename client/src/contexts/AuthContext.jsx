import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session check
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleUser(session?.user ?? null);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      await handleUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUser = async (authUser) => {
    setUser(authUser);
    if (authUser) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();
        
        if (error) {
          console.error('Profile fetch error:', error);
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (err) {
        console.error('Unexpected auth error:', err);
        setProfile(null);
      }
    } else {
      setProfile(null);
    }
    setLoading(false);
  };

  const signInWithGoogle = () => supabase.auth.signInWithOAuth({ provider: 'google' });
  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, signOut, supabase }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
