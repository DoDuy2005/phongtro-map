"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, PlusCircle, Users } from "lucide-react";
import { getMe } from "@/lib/api";

const navigation = [
  { href: "/admin", label: "Danh sách phòng", icon: Building2 },
  { href: "/admin/rooms/add", label: "Thêm phòng & crawler", icon: PlusCircle },
  { href: "/admin/landlords", label: "Chủ trọ", icon: Users },
  { href: "/admin/users", label: "Người dùng", icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    getMe().then(account => {
      if (!active) return;
      if (account.role !== "admin") {
        localStorage.removeItem("token");
        router.replace("/auth");
        return;
      }
      setAuthorized(true);
    }).catch(() => {
      if (!active) return;
      localStorage.removeItem("token");
      router.replace("/auth");
    });
    return () => { active = false; };
  }, [router]);

  if (!authorized) return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">Đang kiểm tra quyền quản trị…</main>;

  return <div className="min-h-screen bg-slate-100">
    <header className="flex items-center justify-between gap-4 bg-slate-950 px-4 py-4 text-white sm:px-6">
      <Link href="/admin" className="font-black"><LayoutDashboard className="mr-2 inline" size={20}/>Admin Phòng Trọ Map</Link>
      <button onClick={() => { if (!confirm("Bạn có chắc chắn muốn đăng xuất không?")) return; localStorage.removeItem("token"); router.replace("/"); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10"><LogOut size={16}/>Đăng xuất</button>
    </header>
    <nav aria-label="Các trang quản trị" className="overflow-x-auto border-b bg-white px-3 shadow-sm sm:px-6">
      <div className="mx-auto flex min-w-max max-w-7xl gap-1">
        {navigation.map(({ href, label, icon: Icon }) => {
          const selected = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} aria-current={selected ? "page" : undefined} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${selected ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
            <Icon size={17}/>{label}
          </Link>;
        })}
      </div>
    </nav>
    {children}
  </div>;
}
