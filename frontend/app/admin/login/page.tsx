"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function AdminLogin() {
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");
  const router=useRouter();
  async function submit(e:React.FormEvent){e.preventDefault();try{const x=await login(email,password);localStorage.setItem("token",x.access_token);router.push("/admin")}catch(e:any){setError(e.message)}}
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7"><h1 className="text-2xl font-black">Quản trị hệ thống</h1><input value={email} onChange={e=>setEmail(e.target.value)} className="mt-5 w-full rounded-lg border p-3" placeholder="Email admin"/><input value={password} onChange={e=>setPassword(e.target.value)} type="password" className="mt-3 w-full rounded-lg border p-3" placeholder="Mật khẩu"/>{error&&<p className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-4 rounded-lg bg-slate-100 p-3 text-xs text-slate-700"><b>Tài khoản demo:</b><br/>admin@phongtromap.local<br/>Mật khẩu: Admin@123</div>
        <button className="mt-5 w-full rounded-lg bg-slate-900 p-3 font-bold text-white">Đăng nhập</button></form></main>
}
