"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Room } from "@/types";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, LogOut } from "lucide-react";

const blank = {title:"",description:"",price:0,area:null,region:"Hà Nội",district:"",ward:"",street:"",address:"",lat:null,lon:null,images:[],amenities:[],phone:"",seller_name:"",available:true,status:"ACTIVE",source_url:null};

export default function LandlordPage() {
  const [rooms,setRooms]=useState<Room[]>([]);
  const [form,setForm]=useState<any>(blank);
  const [editing,setEditing]=useState<string|null>(null);
  const [error,setError]=useState("");
  const router=useRouter();

  async function load() {
    try { const x=await api<{items:Room[]}>("/landlord/rooms"); setRooms(x.items); }
    catch { router.push("/landlord/login"); }
  }
  useEffect(()=>{load()},[]);

  function update(k:string,v:any){setForm((f:any)=>({...f,[k]:v}))}

  async function save(e:React.FormEvent){
    e.preventDefault(); setError("");
    try {
      if(editing) await api(`/landlord/rooms/${editing}`,{method:"PUT",body:JSON.stringify(form)});
      else await api("/landlord/rooms",{method:"POST",body:JSON.stringify(form)});
      setForm(blank);setEditing(null);load();
    } catch(e:any){setError(e.message)}
  }

  async function remove(id:string){
    if(!confirm("Xóa tin này?"))return;
    await api(`/landlord/rooms/${id}`,{method:"DELETE"});load();
  }

  function edit(r:Room){
    setEditing(r.id);
    setForm({...r,images:r.images||[],amenities:r.amenities||[]});
    window.scrollTo({top:0,behavior:"smooth"});
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="flex items-center justify-between border-b bg-white px-5 py-4">
        <h1 className="text-xl font-black">🏠 Khu vực chủ trọ</h1>
        <button onClick={()=>{localStorage.removeItem("token");router.push("/")}} className="text-sm"><LogOut className="mr-1 inline" size={16}/>Đăng xuất</button>
      </header>
      <div className="mx-auto max-w-6xl p-5">
        <form onSubmit={save} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{editing?"Sửa phòng":"Đăng phòng mới"}</h2>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(blank)}}>Hủy sửa</button>}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input required value={form.title} onChange={e=>update("title",e.target.value)} className="rounded-lg border p-3 md:col-span-2" placeholder="Tiêu đề"/>
            <input type="number" value={form.price} onChange={e=>update("price",Number(e.target.value))} className="rounded-lg border p-3" placeholder="Giá/tháng (VNĐ)"/>
            <input type="number" value={form.area||""} onChange={e=>update("area",e.target.value?Number(e.target.value):null)} className="rounded-lg border p-3" placeholder="Diện tích m²"/>
            <input value={form.district} onChange={e=>update("district",e.target.value)} className="rounded-lg border p-3" placeholder="Quận/Huyện"/>
            <input value={form.ward} onChange={e=>update("ward",e.target.value)} className="rounded-lg border p-3" placeholder="Phường/Xã"/>
            <input value={form.address} onChange={e=>update("address",e.target.value)} className="rounded-lg border p-3 md:col-span-2" placeholder="Địa chỉ"/>
            <input type="number" step="any" value={form.lat??""} onChange={e=>update("lat",e.target.value?Number(e.target.value):null)} className="rounded-lg border p-3" placeholder="Latitude"/>
            <input type="number" step="any" value={form.lon??""} onChange={e=>update("lon",e.target.value?Number(e.target.value):null)} className="rounded-lg border p-3" placeholder="Longitude"/>
            <textarea value={form.description} onChange={e=>update("description",e.target.value)} className="min-h-32 rounded-lg border p-3 md:col-span-2" placeholder="Mô tả phòng"/>
            <input value={(form.images||[]).join(", ")} onChange={e=>update("images",e.target.value.split(",").map((x:string)=>x.trim()).filter(Boolean))} className="rounded-lg border p-3 md:col-span-2" placeholder="URL ảnh, cách nhau bằng dấu phẩy"/>
            <input value={(form.amenities||[]).join(", ")} onChange={e=>update("amenities",e.target.value.split(",").map((x:string)=>x.trim()).filter(Boolean))} className="rounded-lg border p-3 md:col-span-2" placeholder="Tiện ích: điều hòa, nóng lạnh, máy giặt..."/>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.available} onChange={e=>update("available",e.target.checked)}/> Còn phòng</label>
          </div>
          {error&&<p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-4 rounded-lg bg-sky-600 px-5 py-3 font-bold text-white"><Plus className="mr-1 inline" size={17}/>{editing?"Cập nhật":"Đăng phòng"}</button>
        </form>

        <h2 className="mt-8 text-2xl font-black">Phòng của tôi ({rooms.length})</h2>
        <div className="mt-4 space-y-3">
          {rooms.map(r=><div key={r.id} className="rounded-xl bg-white p-4 shadow-sm"><div className="flex justify-between gap-4"><div><h3 className="font-bold">{r.title}</h3><p className="mt-1 text-sm text-gray-500">{(r.price/1000000).toFixed(1)} triệu · {r.area||"?"} m² · {r.address}</p><p className="mt-2 text-xs">{r.available?"🟢 Còn phòng":"🔴 Đã cho thuê"} · {r.status}</p></div><div className="flex gap-2"><button onClick={()=>edit(r)} className="rounded-lg border p-2"><Pencil size={17}/></button><button onClick={()=>remove(r.id)} className="rounded-lg border p-2 text-red-600"><Trash2 size={17}/></button></div></div></div>)}
        </div>
      </div>
    </main>
  );
}
