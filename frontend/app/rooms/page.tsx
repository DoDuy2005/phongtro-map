"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, LogIn, Search, SlidersHorizontal, X } from "lucide-react";
import { getRooms, getMe, toggleFavorite } from "@/lib/api";
import { Room, User } from "@/types";
import RoomCard from "@/components/RoomCard";
import RoomDetail from "@/components/RoomDetail";
import { useRouter } from "next/navigation";

const MapClient = dynamic(() => import("@/components/MapClient"), { ssr: false });

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [sort, setSort] = useState("recent");
  const [advanced, setAdvanced] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const router = useRouter();

  async function load() {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (district.trim()) params.set("district", district.trim());
    if (minPrice) params.set("min_price", String(Number(minPrice) * 1_000_000));
    if (maxPrice) params.set("max_price", String(Number(maxPrice) * 1_000_000));
    if (minArea) params.set("min_area", minArea);
    if (maxArea) params.set("max_area", maxArea);
    try {
      const data = await getRooms(`?${params.toString()}`);
      setRooms(data.items);
      setSelected(current => current ? data.items.find(room => room.id === current.id) || null : null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không tải được danh sách phòng.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (localStorage.getItem("token")) getMe().then(setUser).catch(() => {});
  }, []);

  const sortedRooms = useMemo(() => [...rooms].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "area-desc") return (b.area || 0) - (a.area || 0);
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }), [rooms, sort]);

  async function saveRoom() {
    if (!selected) return;
    if (!user) {
      alert("Vui lòng đăng nhập tài khoản khách để lưu phòng.");
      router.push("/auth");
      return;
    }
    try {
      const result = await toggleFavorite(selected.id);
      setRooms(previous => previous.map(room => room.id === selected.id ? { ...room, is_favorite: result.saved } : room));
      setSelected(current => current ? { ...current, is_favorite: result.saved } : null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không lưu được phòng.");
    }
  }

  function clearFilters() {
    setQ(""); setDistrict(""); setMinPrice(""); setMaxPrice(""); setMinArea(""); setMaxArea("");
    setLoading(true);
    setLoadError("");
    getRooms().then(data => { setRooms(data.items); setSelected(null); }).catch(error => setLoadError(error instanceof Error ? error.message : "Không tải được danh sách phòng.")).finally(() => setLoading(false));
  }

  return (
    <main className="h-screen overflow-hidden bg-slate-100">
      <header className="relative z-20 flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm">
        <button onClick={() => router.push("/")} className="text-lg font-black tracking-tight text-slate-900">🏠 Phòng Trọ Map</button>
        <div className="flex items-center gap-2">
          {user ? <button onClick={() => router.push("/rooms/favorites")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Heart className="mr-1 inline" size={16}/>Đã lưu</button> : <button onClick={() => router.push("/auth")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><LogIn className="mr-1 inline" size={16}/>Đăng nhập</button>}
          <button onClick={() => router.push("/auth")} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">Chủ trọ</button>
        </div>
      </header>

      <div className="relative flex h-[calc(100vh-4rem)]">
        {sidebarOpen && <aside className="absolute inset-x-0 top-0 z-[1001] flex max-h-[52vh] w-full flex-col border-b bg-slate-50 shadow-xl md:static md:z-auto md:max-h-none md:w-[400px] md:shrink-0 md:border-b-0 md:border-r md:shadow-none">
          <div className="border-b bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div><h1 className="text-lg font-black text-slate-900">Tìm phòng trọ</h1><p className="text-xs text-slate-500">Lọc tin phù hợp với nhu cầu của bạn</p></div>
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Thu gọn danh sách"><ChevronLeft size={20}/></button>
            </div>
            <form onSubmit={event => { event.preventDefault(); void load(); }} className="flex gap-2">
              <label className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-emerald-500"><Search size={17} className="shrink-0 text-slate-400"/><input value={q} onChange={event => setQ(event.target.value)} className="w-full bg-transparent p-2.5 text-sm outline-none" placeholder="Tên phòng, tiện ích, địa chỉ…"/></label>
              <button className="rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">Tìm</button>
            </form>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={district} onChange={event => setDistrict(event.target.value)} onKeyDown={event => event.key === "Enter" && void load()} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-500" placeholder="Quận / huyện"/>
              <button type="button" onClick={() => setAdvanced(value => !value)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${advanced ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700"}`}><SlidersHorizontal size={16}/>Bộ lọc nâng cao</button>
            </div>
            {advanced && <div className="mt-3 rounded-xl bg-slate-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Giá thuê (triệu/tháng)</p>
              <div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={minPrice} onChange={event => setMinPrice(event.target.value)} className="w-full rounded-lg border bg-white p-2 text-sm" placeholder="Từ"/><input type="number" min="0" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} className="w-full rounded-lg border bg-white p-2 text-sm" placeholder="Đến"/></div>
              <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Diện tích (m²)</p>
              <div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={minArea} onChange={event => setMinArea(event.target.value)} className="w-full rounded-lg border bg-white p-2 text-sm" placeholder="Tối thiểu"/><input type="number" min="0" value={maxArea} onChange={event => setMaxArea(event.target.value)} className="w-full rounded-lg border bg-white p-2 text-sm" placeholder="Tối đa"/></div>
              <div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={clearFilters} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Xóa bộ lọc</button><button type="button" onClick={() => void load()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Áp dụng bộ lọc</button></div>
            </div>}
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{loading ? "Đang tải…" : `${rooms.length} kết quả`}</span>
              <select aria-label="Sắp xếp kết quả" value={sort} onChange={event => setSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"><option value="recent">Mới cập nhật</option><option value="price-asc">Giá thấp trước</option><option value="price-desc">Giá cao trước</option><option value="area-desc">Diện tích lớn</option></select>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {loadError && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}<button onClick={() => void load()} className="ml-2 font-bold underline">Thử lại</button></div>}
            {!loading && !rooms.length && !loadError && <div className="rounded-2xl bg-white p-8 text-center"><Search className="mx-auto text-slate-300" size={28}/><p className="mt-3 font-bold text-slate-700">Chưa có phòng phù hợp</p><p className="mt-1 text-sm text-slate-500">Thử đổi khu vực hoặc nới khoảng giá/diện tích.</p></div>}
            {sortedRooms.map(room => <RoomCard key={room.id} room={room} selected={selected?.id === room.id} onClick={() => setSelected(room)}/>)}
          </div>
        </aside>}

        <section className="relative min-w-0 flex-1">
          <MapClient rooms={rooms} selected={selected} onSelect={setSelected}/>
          {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-slate-800 shadow-lg" aria-label="Mở danh sách phòng"><ChevronRight size={18}/>Danh sách phòng</button>}
          {selected && <div className={`absolute inset-x-2 bottom-2 z-[1000] overflow-hidden rounded-2xl shadow-2xl ${sidebarOpen ? "top-[53vh]" : "top-2"} md:inset-x-auto md:left-auto md:right-3 md:top-3 md:h-[calc(100%-1.5rem)] md:w-[420px]`}><RoomDetail room={selected} onFavorite={saveRoom} onClose={() => setSelected(null)}/></div>}
        </section>
      </div>
    </main>
  );
}
