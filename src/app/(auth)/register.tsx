import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { AuthScaffold } from "@/components/auth/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/store/auth";
import { humanizeAuthError } from "@/lib/errors";
import { isValidEmail, passwordStrength } from "@/lib/validation";

type FieldKey = "firstName" | "lastName" | "email" | "password" | "confirm";

const STRENGTH_COLOR = ["#C0392B", "#D97E27", "#2B6CB0", "#2F855A"];

export default function RegisterScreen() {
  const router = useRouter();
  const signUp = useAuth((s) => s.signUp);
  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Partial<Record<FieldKey, string>>>({});

  const strength = password ? passwordStrength(password) : null;

  function clearErr(key: FieldKey) {
    setFieldErr((p) => (p[key] ? { ...p, [key]: undefined } : p));
  }

  function validate() {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!firstName.trim()) next.firstName = "Required";
    if (!lastName.trim()) next.lastName = "Required";
    if (!email.trim()) next.email = "Enter your email.";
    else if (!isValidEmail(email)) next.email = "That doesn't look like a valid email.";
    if (password.length < 6) next.password = "At least 6 characters.";
    if (!confirm) next.confirm = "Re-enter your password.";
    else if (password !== confirm) next.confirm = "Passwords do not match.";
    setFieldErr(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit() {
    setError(null);
    setInfo(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(firstName, lastName, email, password);
      if (needsConfirmation) {
        setInfo("Account created! Check your email to confirm, then sign in.");
      } else {
        router.replace("/");
      }
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold tagline="Join Cafinity and start earning rewards.">
      <Text className="mb-6 font-heading text-2xl text-textPrimary">Create your account</Text>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label="First name"
            value={firstName}
            onChangeText={(t) => {
              setFirstName(t);
              clearErr("firstName");
            }}
            error={fieldErr.firstName}
            placeholder="Juan"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => lastRef.current?.focus()}
          />
        </View>
        <View className="flex-1">
          <Field
            ref={lastRef}
            label="Last name"
            value={lastName}
            onChangeText={(t) => {
              setLastName(t);
              clearErr("lastName");
            }}
            error={fieldErr.lastName}
            placeholder="Dela Cruz"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </View>
      </View>

      <Field
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          clearErr("email");
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
          clearErr("password");
        }}
        error={fieldErr.password}
        placeholder="At least 6 characters"
        autoCapitalize="none"
        toggleable
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        containerClassName={strength ? "mb-1.5" : "mb-4"}
      />
      {strength ? (
        <View className="mb-4 flex-row items-center gap-2">
          <View className="h-1.5 flex-1 flex-row gap-1">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  backgroundColor: i < strength.score ? STRENGTH_COLOR[strength.score] : "#E7DCD2",
                }}
              />
            ))}
          </View>
          <Text className="text-[11px] font-semibold" style={{ color: STRENGTH_COLOR[strength.score] }}>
            {strength.label}
          </Text>
        </View>
      ) : null}
      <Field
        ref={confirmRef}
        label="Confirm password"
        value={confirm}
        onChangeText={(t) => {
          setConfirm(t);
          clearErr("confirm");
        }}
        error={fieldErr.confirm}
        placeholder="Re-enter your password"
        autoCapitalize="none"
        toggleable
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      {error ? (
        <View className="mb-4 rounded-xl bg-dangerSoft p-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}
      {info ? (
        <View className="mb-4 rounded-xl bg-successSoft p-3">
          <Text className="text-sm text-success">{info}</Text>
        </View>
      ) : null}

      <Button label="Create account" onPress={onSubmit} loading={loading} haptic="medium" />

      <View className="mt-6 flex-row justify-center">
        <Text className="text-sm text-textSecondary">Already have an account? </Text>
        <Link href="/login" className="text-sm font-bold text-brandPrimary">
          Sign in
        </Link>
      </View>
    </AuthScaffold>
  );
}
