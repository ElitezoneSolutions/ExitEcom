import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDemoMode: boolean;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error: Error | null; data: unknown }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; data: unknown }>;
  signOut: () => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null; data: unknown }>;
  verifyEmailOtp: (
    email: string,
    token: string,
  ) => Promise<{ error: Error | null; data: unknown }>;
  resendSignupOtp: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Define fallback mock user details
  const getMockUser = (
    email: string = "demo@exitecom.com",
    name: string = "Demo User",
  ): User => ({
    id: "00000000-0000-0000-0000-000000000000",
    app_metadata: {},
    user_metadata: { full_name: name },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    role: "authenticated",
    updated_at: new Date().toISOString(),
  });

  const getMockSession = (mockUser: User): Session => ({
    access_token: "mock-access-token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "mock-refresh-token",
    user: mockUser,
  });

  useEffect(() => {
    if (isSupabaseConfigured) {
      // Get initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Fallback Demo Mode - check if user was previously logged in locally
      const storedUser = localStorage.getItem("exitecom_demo_user");
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          const u = getMockUser(parsed.email, parsed.fullName);
          setUser(u);
          setSession(getMockSession(u));
        } catch {
          localStorage.removeItem("exitecom_demo_user");
        }
      }
      setLoading(false);
    }
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || "",
            },
          },
        });
        return { error: error ? new Error(error.message) : null, data };
      } catch (err: unknown) {
        const errorVal = err instanceof Error ? err : new Error(String(err));
        return { error: errorVal, data: null };
      }
    } else {
      // Mock Sign Up
      const u = getMockUser(email, fullName || "Demo User");
      localStorage.setItem(
        "exitecom_demo_user",
        JSON.stringify({ email, fullName: fullName || "Demo User" }),
      );
      setUser(u);
      setSession(getMockSession(u));
      toast.info("Signed up in Demo Mode (Supabase not configured)");
      return { error: null, data: { user: u, session: getMockSession(u) } };
    }
  };

  const signIn = async (email: string, password: string) => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error ? new Error(error.message) : null, data };
      } catch (err: unknown) {
        const errorVal = err instanceof Error ? err : new Error(String(err));
        return { error: errorVal, data: null };
      }
    } else {
      // Mock Sign In
      const u = getMockUser(email, "Demo User");
      localStorage.setItem(
        "exitecom_demo_user",
        JSON.stringify({ email, fullName: "Demo User" }),
      );
      setUser(u);
      setSession(getMockSession(u));
      toast.info("Logged in in Demo Mode (Supabase not configured)");
      return { error: null, data: { user: u, session: getMockSession(u) } };
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.auth.signOut();
        return { error: error ? new Error(error.message) : null };
      } catch (err: unknown) {
        const errorVal = err instanceof Error ? err : new Error(String(err));
        return { error: errorVal };
      }
    } else {
      localStorage.removeItem("exitecom_demo_user");
      setUser(null);
      setSession(null);
      toast.info("Logged out from Demo Mode");
      return { error: null };
    }
  };

  const signInWithGoogle = async () => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
        });
        return { error: error ? new Error(error.message) : null, data };
      } catch (err: unknown) {
        const errorVal = err instanceof Error ? err : new Error(String(err));
        return { error: errorVal, data: null };
      }
    } else {
      const u = getMockUser("google-user@exitecom.com", "Google User");
      localStorage.setItem(
        "exitecom_demo_user",
        JSON.stringify({ email: u.email, fullName: u.user_metadata.full_name }),
      );
      setUser(u);
      setSession(getMockSession(u));
      toast.info("Signed in with Google in Demo Mode");
      return { error: null, data: { user: u, session: getMockSession(u) } };
    }
  };

  // Verify the 6-digit email code sent on sign-up. On success Supabase returns a
  // session, so the user is fully authenticated afterwards.
  const verifyEmailOtp = async (email: string, token: string) => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "signup",
        });
        return { error: error ? new Error(error.message) : null, data };
      } catch (err: unknown) {
        const errorVal = err instanceof Error ? err : new Error(String(err));
        return { error: errorVal, data: null };
      }
    } else {
      // Demo mode: accept any code and create a mock session.
      const u = getMockUser(email, "Demo User");
      localStorage.setItem(
        "exitecom_demo_user",
        JSON.stringify({ email, fullName: "Demo User" }),
      );
      setUser(u);
      setSession(getMockSession(u));
      return { error: null, data: { user: u, session: getMockSession(u) } };
    }
  };

  const resendSignupOtp = async (email: string) => {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.auth.resend({ type: "signup", email });
        return { error: error ? new Error(error.message) : null };
      } catch (err: unknown) {
        const errorVal = err instanceof Error ? err : new Error(String(err));
        return { error: errorVal };
      }
    } else {
      return { error: null };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDemoMode: !isSupabaseConfigured,
        signUp,
        signIn,
        signOut,
        signInWithGoogle,
        verifyEmailOtp,
        resendSignupOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
