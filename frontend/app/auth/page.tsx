"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { getMe, login, register } from "@/lib/api";

type Mode = "login" | "register";
type Role = "user" | "landlord";
type LoginRole = Role | "admin";

function roleHome(role: string) {
  if (role === "admin") return "/admin";
  if (role === "landlord") return "/landlord";
  return "/rooms";
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<Role>("user");
  const [loginRole, setLoginRole] = useState<LoginRole>("user");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const result = await register({ email, password, full_name: name, phone, role });
        setNotice(result.message);
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        return;
      }
      const result = await login(email, password, loginRole);
      localStorage.setItem("token", result.access_token);
      const account = await getMe();
      router.replace(roleHome(account.role));
    } catch (err) {
      localStorage.removeItem("token");
      setError(err instanceof Error ? err.message : "Không thể xác thực tài khoản");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5">
      <section className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <button type="button" onClick={() => router.push("/")} className="mb-7 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={16} /> Trang chủ
        </button>
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Phòng Trọ Map</p>
          <h1 className="mt-2 text-3xl font-black text-gray-950">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {mode === "login" ? "Dùng một tài khoản cho khách, chủ trọ và quản trị viên." : "Chọn loại tài khoản để bắt đầu sử dụng dịch vụ."}
          </p>
        </div>

        {mode === "register" && (
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button type="button" onClick={() => setRole("user")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${role === "user" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}>
              <UserRound size={17} /> Khách tìm trọ
            </button>
            <button type="button" onClick={() => setRole("landlord")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${role === "landlord" ? "bg-white text-sky-700 shadow-sm" : "text-gray-500"}`}>
              <Building2 size={17} /> Chủ trọ
            </button>
          </div>
        )}

        {mode === "login" && (
          <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-gray-100 p-1" aria-label="Chọn loại tài khoản đăng nhập">
            <button type="button" onClick={() => setLoginRole("user")} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-sm font-semibold ${loginRole === "user" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}>
              <UserRound size={16} /> Khách
            </button>
            <button type="button" onClick={() => setLoginRole("landlord")} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-sm font-semibold ${loginRole === "landlord" ? "bg-white text-sky-700 shadow-sm" : "text-gray-500"}`}>
              <Building2 size={16} /> Chủ trọ
            </button>
            <button type="button" onClick={() => setLoginRole("admin")} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-sm font-semibold ${loginRole === "admin" ? "bg-white text-slate-800 shadow-sm" : "text-gray-500"}`}>
              <ShieldCheck size={16} /> Admin
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && <>
            <label className="block text-sm font-medium text-gray-700">Họ và tên<input required minLength={1} value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="mt-1.5 w-full rounded-xl border border-gray-200 p-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="Nguyễn Văn An" /></label>
            {role === "landlord" && <label className="block text-sm font-medium text-gray-700">Số điện thoại<input required value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" className="mt-1.5 w-full rounded-xl border border-gray-200 p-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="09xx xxx xxx" /></label>}
          </>}
          <label className="block text-sm font-medium text-gray-700">Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-xl border border-gray-200 p-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="ban@email.com" /></label>
          <label className="block text-sm font-medium text-gray-700">Mật khẩu
            <span className="relative mt-1.5 block">
              <input required minLength={mode === "register" ? 6 : undefined} type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-full rounded-xl border border-gray-200 p-3 pr-12 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder={mode === "register" ? "Ít nhất 6 ký tự" : "Nhập mật khẩu"} />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-500 hover:text-gray-800" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>
          {mode === "register" && <label className="block text-sm font-medium text-gray-700">Xác nhận mật khẩu
            <span className="relative mt-1.5 block">
              <input required minLength={6} type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-gray-200 p-3 pr-12 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="Nhập lại mật khẩu" />
              <button type="button" onClick={() => setShowConfirmPassword(value => !value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-500 hover:text-gray-800" aria-label={showConfirmPassword ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"} aria-pressed={showConfirmPassword}>
                {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3.5 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">
            {mode === "login" && <KeyRound size={18} />}{loading ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : `Đăng ký ${role === "landlord" ? "chủ trọ" : "khách tìm trọ"}`}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="font-bold text-emerald-700 hover:underline">
            {mode === "login" ? "Đăng ký" : "Đăng nhập"}
          </button>
        </p>
      </section>
    </main>
  );
}
