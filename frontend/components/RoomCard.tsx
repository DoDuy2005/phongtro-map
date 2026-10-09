"use client";

import { Heart, MapPin } from "lucide-react";
import { Room } from "@/types";
import { API } from "@/lib/api";

function imageSource(path?: string) {
  if (!path) return "https://placehold.co/160x120?text=Phong+tro";
  return path.startsWith("/") ? `${API}${path}` : path;
}

export default function RoomCard({ room, selected, onClick }: { room: Room; selected?: boolean; onClick: () => void }) {
  const availableCount = room.available_count ?? (room.available ? room.room_count : 0);
  return <button onClick={onClick} className={`w-full rounded-2xl border bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-md ${selected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
    <div className="flex gap-3">
      <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100"><img src={imageSource(room.uploaded_images?.[0] || room.images?.[0])} className="h-full w-full object-cover" alt={room.title}/><span className="absolute bottom-1 left-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">Còn {availableCount}/{room.room_count}</span></div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{room.title}</div>
        <div className="mt-1 font-black text-emerald-700">{(room.price / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu/tháng</div>
        <div className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin size={12} className="shrink-0"/>{room.district || room.street || room.address}</div>
        <div className="mt-1 text-xs text-slate-500">{room.area ? `${room.area} m²` : "Chưa rõ diện tích"}{room.amenities?.length ? ` · ${room.amenities.slice(0, 2).join(", ")}` : ""}</div>
      </div>
      {room.is_favorite && <Heart size={18} className="shrink-0 fill-amber-400 text-amber-500"/>}
    </div>
  </button>;
}
