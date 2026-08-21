import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in — Hide & Weave" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Hide & Weave</CardTitle>
          <CardDescription>Enter the app password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
