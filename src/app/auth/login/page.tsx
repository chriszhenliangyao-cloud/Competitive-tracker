import GoogleLoginButton from "./GoogleLoginButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  domain: "That account isn't an @iniushop.com address. Sign in with your company account.",
  auth_failed: "Sign-in failed. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const msg = error ? ERRORS[error] ?? "Sign-in error." : null;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <strong>Competitive Tracker</strong>
          <span>INIU powerbank market</span>
        </div>
        {msg ? <div className="login-error">{msg}</div> : null}
        <GoogleLoginButton />
        <p className="login-note">@iniushop.com accounts only</p>
      </div>
    </div>
  );
}
