import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Playground
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue.
          </p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
