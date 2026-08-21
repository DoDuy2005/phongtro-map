"use client";

import { Heart, ExternalLink, MapPin, Ruler, Phone } from "lucide-react";
import { Room } from "@/types";

export default function RoomDetail({ room, onFavorite }: { room: Room; onFavorite: () => void }) {
  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="grid grid-cols-2 gap-1">
        {(room.images?.slice(0,4) || []).map((src, i) => (
          <img key={i} src={src} className="h-32 w-full object-cover" alt="" />
        ))}
      </div>
      <div className="p-5">
        <div className="text-2xl font-black text-emerald-600">{(room.price / 1000000).toFixed(1)} triệu/tháng</div>
        <h2 className="mt-1 text-xl font-bold">{room.title}</h2>
        <div className="mt-3 space-y-2 text-sm text-gray-600">
          <div className="flex gap-2"><MapPin size={17}/>{room.address || `${room.ward}, ${room.district}`}</div>
          {room.area && <div className="flex gap-2"><Ruler size={17}/>{room.area} m²</div>}
          {room.phone && <div className="flex gap-2"><Phone size={17}/>{room.phone}</div>}
        </div>
        {room.amenities?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {room.amenities.map(a => <span key={a} className="rounded-full bg-gray-100 px-3 py-1 text-xs">{a}</span>)}
          </div>
        )}
        <p className="mt-5 whitespace-pre-line text-sm leading-6 text-gray-700">{room.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onFavorite} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-3 font-semibold hover:bg-amber-50">
            <Heart size={18} className={room.is_favorite ? "fill-amber-400 text-amber-500" : ""}/>
            {room.is_favorite ? "Đã lưu" : "Lưu phòng"}
          </button>
          {room.source_url && (
            <a href={room.source_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-3 font-semibold text-white">
              Nhà Tốt <ExternalLink size={17}/>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
