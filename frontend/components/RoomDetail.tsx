"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Heart, MapPin, Maximize2, Phone, Ruler, X } from "lucide-react";
import { Room } from "@/types";
import { API } from "@/lib/api";

function imageSource(path: string) {
  return path.startsWith("/") ? `${API}${path}` : path;
}

export default function RoomDetail({ room, onFavorite, onClose }: { room: Room; onFavorite: () => void; onClose: () => void }) {
  const images = [...(room.uploaded_images || []), ...(room.images || [])];
  const [activeImage, setActiveImage] = useState<number | null>(null);
  const availableCount = room.available_count ?? (room.available ? room.room_count : 0);

  useEffect(() => {
    if (activeImage === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
      if (event.key === "ArrowRight") setActiveImage(index => index === null ? null : (index + 1) % images.length);
      if (event.key === "ArrowLeft") setActiveImage(index => index === null ? null : (index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImage, images.length]);

  return <>
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="relative shrink-0 bg-slate-100">
        <div className="grid h-52 grid-cols-2 gap-1 overflow-hidden sm:h-60">
          {images.slice(0, 4).map((src, index) => <button key={`${src}-${index}`} onClick={() => setActiveImage(index)} className={`group relative min-h-0 overflow-hidden ${index === 0 && images.length === 1 ? "col-span-2" : ""}`} aria-label={`Mở ảnh ${index + 1}`}>
            <img src={imageSource(src)} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" alt={`${room.title} - ảnh ${index + 1}`}/>
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100"><Maximize2 size={22}/></span>
            {index === 3 && images.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">+{images.length - 4} ảnh</span>}
          </button>)}
          {!images.length && <div className="col-span-2 flex items-center justify-center text-sm text-slate-400">Chưa có ảnh phòng</div>}
        </div>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-white/95 p-2 text-slate-700 shadow hover:bg-white" aria-label="Đóng thông tin phòng"><X size={18}/></button>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow"><Check size={14}/>Còn {availableCount}/{room.room_count} phòng</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-black leading-snug text-slate-900">{room.title}</h2><button onClick={onFavorite} className="shrink-0 rounded-full border border-slate-200 p-2.5 text-slate-600 hover:border-amber-300 hover:bg-amber-50" aria-label={room.is_favorite ? "Bỏ lưu phòng" : "Lưu phòng"}><Heart size={19} className={room.is_favorite ? "fill-amber-400 text-amber-500" : ""}/></button></div>
          <div className="mt-2 text-2xl font-black text-emerald-700">{(room.price / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}<span className="ml-1 text-base font-bold">triệu/tháng</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">Diện tích</span><span className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-800"><Ruler size={15}/>{room.area ? `${room.area} m²` : "Chưa cập nhật"}</span></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">Số phòng</span><span className="mt-1 block text-sm font-bold text-slate-800">Còn {availableCount}/{room.room_count} phòng</span></div>
          </div>
          <div className="mt-4 flex gap-2 text-sm leading-6 text-slate-600"><MapPin size={17} className="mt-1 shrink-0 text-emerald-600"/><span>{[room.address, room.street, room.ward, room.district, room.region].filter(Boolean).filter((item, index, list) => list.indexOf(item) === index).join(", ")}</span></div>
          {room.phone && <a href={`tel:${room.phone.replace(/[^+\d]/g, "")}`} className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-emerald-700"><Phone size={16} className="text-emerald-600"/>{room.phone}</a>}
          {!!room.amenities?.length && <div className="mt-5"><h3 className="text-sm font-bold text-slate-900">Tiện nghi</h3><div className="mt-2 flex flex-wrap gap-2">{room.amenities.map(item => <span key={item} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">{item}</span>)}</div></div>}
          {room.description && <div className="mt-5"><h3 className="text-sm font-bold text-slate-900">Mô tả</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{room.description}</p></div>}
          <div className={`mt-6 grid gap-2 ${room.phone && room.source_url ? "grid-cols-2" : "grid-cols-1"}`}>
            {room.phone && <a href={`tel:${room.phone.replace(/[^+\d]/g, "")}`} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white hover:bg-emerald-700"><Phone size={17}/>Gọi chủ trọ</a>}
            {room.source_url && <a href={room.source_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white hover:bg-slate-700">Tin gốc<ExternalLink size={16}/></a>}
          </div>
        </div>
      </div>
    </div>

    {activeImage !== null && images.length > 0 && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/95 p-4" onClick={() => setActiveImage(null)} role="dialog" aria-modal="true" aria-label="Xem ảnh phòng">
      <button onClick={() => setActiveImage(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Đóng ảnh"><X/></button>
      {images.length > 1 && <button onClick={event => { event.stopPropagation(); setActiveImage(index => index === null ? null : (index - 1 + images.length) % images.length); }} className="absolute left-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Ảnh trước"><ChevronLeft/></button>}
      <img src={imageSource(images[activeImage])} alt={`${room.title} - ảnh ${activeImage + 1}`} className="max-h-[86vh] max-w-[88vw] object-contain" onClick={event => event.stopPropagation()}/>
      {images.length > 1 && <button onClick={event => { event.stopPropagation(); setActiveImage(index => index === null ? null : (index + 1) % images.length); }} className="absolute right-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Ảnh tiếp theo"><ChevronRight/></button>}
      <span className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-sm text-white">{activeImage + 1} / {images.length}</span>
    </div>}
  </>;
}
