"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { verifyEmail } from "@/lib/api";

export default function VerifyEmailPage() {
  const [message, setMessage] = useState("Đang xác nhận email…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFailed(true);
      setMessage("Liên kết xác nhận không hợp lệ.");
      return;
    }
    verifyEmail(token)
      .then(result => setMessage(result.message))
      .catch(error => {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : "Không thể xác nhận email.");
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black">Xác nhận email</h1>
        <p role="status" className={`mt-4 text-sm ${failed ? "text-red-700" : "text-emerald-800"}`}>{message}</p>
        {!failed && message !== "Đang xác nhận email…" && <Link href="/auth" className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">Đến trang đăng nhập</Link>}
      </section>
    </main>
  );
}
