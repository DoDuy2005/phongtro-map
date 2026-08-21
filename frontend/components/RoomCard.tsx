"use client";

import { Heart, MapPin } from "lucide-react";
import { Room } from "@/types";

export default function RoomCard({ room, selected, onClick }: { room: Room; selected?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left rounded-xl border bg-white p-3 transition hover:shadow-md ${selected ? "ring-2 ring-emerald-500" : ""}`}>
      <div className="flex gap-3">
        <img
          src={room.images?.[0] || "https://placehold.co/120x90?text=Phong+tro"}
          className="h-20 w-24 rounded-lg object-cover"
          alt=""
        />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-bold">{room.title}</div>
          <div className="mt-1 font-extrabold text-emerald-600">{(room.price / 1000000).toFixed(1)} triệu/tháng</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500"><MapPin size={12}/>{room.district || room.address}</div>
        </div>
        {room.is_favorite && <Heart size={18} className="fill-amber-400 text-amber-500" />}
      </div>
    </button>
  );
}
