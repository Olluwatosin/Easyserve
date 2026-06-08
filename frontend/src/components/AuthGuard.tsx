"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, UserRole } from "@/stores/auth";

interface Props {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function AuthGuard({ children, allowedRoles }: Props) {
  const { user, loading, fetchMe } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    if (!user) fetchMe();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        router.replace(getRoleHome(user.role));
      }
    }
    if (!loading && !user && !localStorage.getItem("access_token")) {
      router.replace("/login");
    }
  }, [user, loading]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export function getRoleHome(role: UserRole): string {
  switch (role) {
    case "owner": return "/owner";
    case "attendant": return "/staff";
    case "bartender": return "/bar";
    case "kitchen": return "/kitchen";
    case "cashier": return "/cashier";
    case "security": return "/security";
    default: return "/login";
  }
}
