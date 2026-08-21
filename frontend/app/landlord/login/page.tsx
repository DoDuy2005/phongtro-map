"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";

export default function LandlordLogin() {
  const [registerMode, setRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    try {
      const data = registerMode
        ? await register({email,password,full_name:name,phone,role:"landlord"})
        : await login(email,password);
      localStorage.setItem("token", data.access_token);
      router.push("/landlord");
    } catch (e:any) { setError(e.message); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        <h1 className="text-2xl font-black">{registerMode ? "Đăng ký chủ trọ" : "Đăng nhập chủ trọ"}</h1>
        {registerMode && <>
          <input value={name} onChange={e=>setName(e.target.value)} className="mt-5 w-full rounded-lg border p-3" placeholder="Tên chủ trọ"/>
          <input value={phone} onChange={e=>setPhone(e.target.value)} className="mt-3 w-full rounded-lg border p-3" placeholder="Số điện thoại"/>
        </>}
        <input value={email} onChange={e=>setEmail(e.target.value)} className="mt-4 w-full rounded-lg border p-3" placeholder="Email"/>
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" className="mt-3 w-full rounded-lg border p-3" placeholder="Mật khẩu"/>
        {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <div className="mt-4 rounded-lg bg-sky-50 p-3 text-xs text-sky-800"><b>Tài khoản chủ trọ demo:</b><br/>chutro@phongtromap.local<br/>Mật khẩu: Chutro@123</div>
        <button className="mt-5 w-full rounded-lg bg-sky-600 p-3 font-bold text-white">{registerMode ? "Tạo tài khoản chủ trọ" : "Đăng nhập"}</button>
        <button type="button" onClick={()=>setRegisterMode(!registerMode)} className="mt-3 w-full text-sm text-sky-700">{registerMode ? "Đã có tài khoản?" : "Chưa có tài khoản? Đăng ký"}</button>
        <button type="button" onClick={()=>router.push("/")} className="mt-4 w-full text-sm text-gray-500">← Trang chủ</button>
      </form>
    </main>
  );
}
