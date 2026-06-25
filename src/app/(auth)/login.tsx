import { useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { AuthScaffold } from "@/components/auth/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/store/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { humanizeAuthError } from "@/lib/errors";
import { isValidEmail } from "@/lib/validation";

export default function LoginScreen() {
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Enter your email.";
    else if (!isValidEmail(email)) next.email = "That doesn't look like a valid email.";
    if (!password) next.password = "Enter your password.";
    setFieldErr(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit() {
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPassword() {
    if (!isValidEmail(email)) {
      setFieldErr((p) => ({ ...p, email: "Enter your email above to reset your password." }));
      return;
    }
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (e) throw e;
      Alert.alert("Check your email", `We sent a password reset link to ${email.trim()}.`);
    } catch {
      Alert.alert("Couldn't send link", "Please try again in a moment.");
    }
  }

  return (
    <AuthScaffold tagline="Your coffee, your way — ordered ahead.">
      <Text className="mb-1 font-heading text-2xl text-textPrimary">Welcome back</Text>
      <Text className="mb-6 text-sm text-textSecondary">Sign in to start your order.</Text>

      {!isSupabaseConfigured ? (
        <View className="mb-5 rounded-2xl border border-accent-300 bg-accent-100 p-4">
          <Text className="text-sm font-semibold text-textPrimary">Supabase not connected</Text>
          <Text className="mt-1 text-xs text-textSecondary">
            Add your project URL and anon key to a .env file (see README), then restart.
          </Text>
        </View>
      ) : null}

      <Field
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (fieldErr.email) setFieldErr((p) => ({ ...p, email: undefined }));
        }}
        error={fieldErr.email}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (fieldErr.password) setFieldErr((p) => ({ ...p, password: undefined }));
        }}
        error={fieldErr.password}
        placeholder="••••••••"
        autoCapitalize="none"
        toggleable
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <Pressable
        onPress={onForgotPassword}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Forgot password? Send a reset link"
        className="mb-4 -mt-1 self-end"
      >
        <Text className="text-sm font-semibold text-brandPrimary">Forgot password?</Text>
      </Pressable>

      {error ? (
        <View className="mb-4 rounded-xl bg-dangerSoft p-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      <Button label="Sign in" onPress={onSubmit} loading={loading} haptic="medium" />

      <View className="mt-6 flex-row justify-center">
        <Text className="text-sm text-textSecondary">New to Cafinity? </Text>
        <Link href="/register" className="text-sm font-bold text-brandPrimary">
          Create an account
        </Link>
      </View>
    </AuthScaffold>
  );
}
