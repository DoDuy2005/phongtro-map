"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Room } from "@/types";
import RoomCard from "@/components/RoomCard";
import RoomDetail from "@/components/RoomDetail";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function FavoritesPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const router = useRouter();

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api<{ items: Room[]; total: number }>("/me/favorites");
      setRooms(data.items);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không tải được danh sách phòng đã lưu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFavorites(); }, [loadFavorites]);

  async function viewRoom(room: Room) {
    setActionError("");
    if (room.is_removed || room.is_unavailable) {
      setSelected(room);
      return;
    }
    setOpeningRoomId(room.id);
    try {
      const freshRoom = await api<Room>(`/rooms/${room.id}`);
      setSelected({ ...freshRoom, favorite_id: room.favorite_id, is_favorite: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không tải được thông tin phòng đã lưu.");
    } finally {
      setOpeningRoomId(null);
    }
  }

  async function removeFavorite() {
    if (!selected?.favorite_id) return;
    setActionError("");
    try {
      await api(`/me/favorites/${selected.favorite_id}`, { method: "DELETE" });
      setRooms(current => current.filter(room => room.favorite_id !== selected.favorite_id));
      setSelected(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể bỏ lưu phòng lúc này.");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button onClick={() => router.push("/rooms")} className="text-sm font-bold">← Quay lại bản đồ</button>
        <button onClick={() => { if (!confirm("Bạn có chắc chắn muốn đăng xuất không?")) return; localStorage.removeItem("token"); router.replace("/"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <LogOut size={16}/>Đăng xuất
        </button>
      </header>
      <h1 className="text-3xl font-black">Phòng đã lưu</h1>

      {loadError && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>{loadError}</p>
        <div className="mt-3 flex gap-4">
          <button onClick={() => void loadFavorites()} className="font-bold underline">Thử tải lại</button>
          <button onClick={() => router.push("/auth")} className="font-bold underline">Đăng nhập lại</button>
        </div>
      </div>}

      {loading && <p className="mt-8 text-sm text-slate-500">Đang tải phòng đã lưu…</p>}
      {!loading && !loadError && !rooms.length && <p className="mt-8 text-slate-500">Bạn chưa lưu phòng nào.</p>}
      {!loadError && <div className="mt-6 grid gap-3 md:grid-cols-2">
        {rooms.map(room => <div key={room.id} className="rounded-2xl">
          <RoomCard room={room} onClick={() => void viewRoom(room)}/>
          <button type="button" disabled={openingRoomId === room.id} onClick={() => void viewRoom(room)} className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            {openingRoomId === room.id ? "Đang tải thông tin phòng…" : "Xem lại tin"}
          </button>
        </div>)}
      </div>}

      {actionError && <p role="alert" className="fixed bottom-4 left-1/2 z-[60] w-[min(90vw,32rem)] -translate-x-1/2 rounded-lg bg-red-50 p-3 text-sm text-red-700 shadow-lg">{actionError}</p>}
      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onClick={() => setSelected(null)} role="dialog" aria-modal="true" aria-label={`Chi tiết ${selected.title}`}>
        <div className="h-[min(90vh,800px)] w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl" onClick={event => event.stopPropagation()}>
          <RoomDetail room={selected} onFavorite={removeFavorite} onClose={() => setSelected(null)}/>
        </div>
      </div>}
    </main>
  );
}
