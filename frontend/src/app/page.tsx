"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { getRoleHome } from "@/components/AuthGuard";

export default function RootPage() {
  const router = useRouter();
  const { user, fetchMe } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    if (user) {
      router.replace(getRoleHome(user.role));
    } else {
      fetchMe().then(() => {
        const u = useAuthStore.getState().user;
        if (u) router.replace(getRoleHome(u.role));
        else router.replace("/login");
      });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
