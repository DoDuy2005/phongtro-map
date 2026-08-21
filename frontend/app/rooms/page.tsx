"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LogIn, Search, Heart, UserRound } from "lucide-react";
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
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (district) params.set("district", district);
    if (maxPrice) params.set("max_price", String(Number(maxPrice) * 1000000));
    const data = await getRooms(`?${params.toString()}`);
    setRooms(data.items);
    if (selected) setSelected(data.items.find(r => r.id === selected.id) || null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (localStorage.getItem("token")) getMe().then(setUser).catch(() => {});
  }, []);

  async function saveRoom() {
    if (!selected) return;
    if (!user) {
      alert("Bạn phải đăng nhập tài khoản người dùng mới có thể lưu phòng.");
      router.push("/rooms/login");
      return;
    }
    try {
      const result = await toggleFavorite(selected.id);
      setRooms(prev => prev.map(r => r.id === selected.id ? {...r, is_favorite: result.saved} : r));
      setSelected({...selected, is_favorite: result.saved});
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-gray-100">
      <header className="flex h-16 items-center justify-between border-b bg-white px-4">
        <button onClick={() => router.push("/")} className="text-lg font-black">🏠 Phòng Trọ Map</button>
        <div className="flex items-center gap-2">
          {user ? (
            <button onClick={() => router.push("/rooms/favorites")} className="rounded-lg border px-3 py-2 text-sm font-semibold"><Heart className="mr-1 inline" size={16}/> Đã lưu</button>
          ) : (
            <button onClick={() => router.push("/rooms/login")} className="rounded-lg border px-3 py-2 text-sm font-semibold"><LogIn className="mr-1 inline" size={16}/> Đăng nhập</button>
          )}
          <button onClick={() => router.push("/landlord/login")} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white">Chủ trọ</button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
        <aside className="z-10 w-full overflow-y-auto border-r bg-gray-50 md:w-[420px]">
          <div className="sticky top-0 z-20 border-b bg-gray-50 p-3">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-lg border bg-white px-3"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} className="w-full bg-transparent p-2 outline-none" placeholder="Tìm tên phòng, địa chỉ..."/></div>
              <button onClick={load} className="rounded-lg bg-emerald-600 px-4 font-bold text-white">Tìm</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={district} onChange={e=>setDistrict(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} className="rounded-lg border bg-white p-2 text-sm" placeholder="Quận/Huyện"/>
              <input value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} className="rounded-lg border bg-white p-2 text-sm" placeholder="Giá tối đa (triệu)"/>
            </div>
            <div className="mt-2 text-xs text-gray-500">{loading ? "Đang tải..." : `${rooms.length} phòng đang hiển thị`}</div>
          </div>
          <div className="space-y-2 p-3">
            {rooms.map(room => <RoomCard key={room.id} room={room} selected={selected?.id===room.id} onClick={()=>setSelected(room)}/>)}
          </div>
        </aside>

        <section className="relative min-h-[50vh] flex-1">
          <MapClient rooms={rooms} selected={selected} onSelect={setSelected}/>
          {selected && <div className="absolute right-3 top-3 z-[1000] h-[calc(100%-1.5rem)] w-[390px] max-w-[90vw] overflow-hidden rounded-2xl shadow-2xl"><RoomDetail room={selected} onFavorite={saveRoom}/></div>}
        </section>
      </div>
    </main>
  );
}
