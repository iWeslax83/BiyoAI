import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession } from "@/lib/auth";

export default async function OgretmenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = (await cookies()).get("session")?.value;
  if (!isValidSession(session)) {
    redirect("/ogretmen/login");
  }
  return <>{children}</>;
}
