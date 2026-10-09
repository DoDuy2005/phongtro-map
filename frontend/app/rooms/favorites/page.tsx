"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Room } from "@/types";
import RoomCard from "@/components/RoomCard";
import { useRouter } from "next/navigation";

export default function FavoritesPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const router = useRouter();

  useEffect(() => {
    api<{items: Room[]}>("/me/favorites").then(x=>setRooms(x.items)).catch(()=>router.push("/auth"));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <button onClick={()=>router.push("/rooms")} className="mb-5 text-sm font-bold">← Quay lại bản đồ</button>
      <h1 className="text-3xl font-black">Phòng đã lưu</h1>
      <div className="mt-6 grid gap-3 md:grid-cols-2">{rooms.map(r=><RoomCard key={r.id} room={r} onClick={()=>{}}/>)}</div>
      {!rooms.length && <p className="mt-8 text-gray-500">Chưa có phòng nào được lưu.</p>}
    </main>
  );
}
