"use client";

import { Building2, Map, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg"><Map size={34}/></div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">Phòng Trọ Map</h1>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">Tìm phòng theo vị trí trên bản đồ, xem thông tin và lưu những căn phù hợp.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <button onClick={() => router.push("/rooms")} className="group rounded-3xl border bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><UserRound/></div>
            <h2 className="text-2xl font-black">Tôi đang tìm phòng</h2>
            <p className="mt-2 text-gray-500">Mở bản đồ, lọc theo giá/diện tích/khu vực, xem chi tiết và lưu phòng.</p>
            <div className="mt-6 font-bold text-emerald-700">Khám phá phòng →</div>
          </button>

          <button onClick={() => router.push("/auth")} className="group rounded-3xl border bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Building2/></div>
            <h2 className="text-2xl font-black">Tôi là chủ trọ</h2>
            <p className="mt-2 text-gray-500">Đăng nhập để đăng phòng, sửa thông tin, quản lý tình trạng phòng và tin đã đăng.</p>
            <div className="mt-6 font-bold text-sky-700">Khu vực chủ trọ →</div>
          </button>
        </div>

        <div className="mt-8 text-center text-xs text-gray-400"><ShieldCheck className="mr-1 inline" size={14}/> Hệ thống demo phục vụ đồ án môn Phát triển phần mềm mã nguồn mở.</div>
      </div>
    </main>
  );
}
