
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Room } from "@/types";
import { useRouter } from "next/navigation";
import { RefreshCw, Check, EyeOff, Trash2, LayoutDashboard, Pencil, Plus } from "lucide-react";

const blank = {
  title:"",description:"",price:0,room_count:1,available_count:1,area:null,region:"Hà Nội",district:"",ward:"",
  street:"",address:"",lat:null,lon:null,images:[],amenities:[],phone:"",
  seller_name:"",available:true,status:"ACTIVE",source_url:null
};

export default function AdminPage(){
  const [stats,setStats]=useState<any>(null);
  const [rooms,setRooms]=useState<Room[]>([]);
  const [msg,setMsg]=useState("");
  const [form,setForm]=useState<any>(blank);
  const [editing,setEditing]=useState<string|null>(null);
  const [crawlerRunning,setCrawlerRunning]=useState(false);
  const [crawlerProgress,setCrawlerProgress]=useState<any>(null);
  const router=useRouter();

  async function load(){
    try{
      const [s,r]=await Promise.all([api("/admin/stats"),api<{items:Room[]}>("/admin/rooms")]);
      setStats(s);setRooms(r.items);
    }catch{router.push("/auth")}
  }
  useEffect(()=>{load()},[]);

  useEffect(()=>{
    if(!crawlerRunning) return;
    const timer=setInterval(async()=>{
      try{
        const state=await api<any>("/admin/crawler/status");
        setCrawlerProgress(state);
        if(state.status==="completed"){
          setCrawlerRunning(false);
          setMsg(`Đồng bộ xong: ${state.result?.created ?? 0} mới, ${state.result?.updated ?? 0} cập nhật.`);
          await load();
        }else if(state.status==="failed"){
          setCrawlerRunning(false);
          setMsg(`Crawler lỗi: ${state.error || "Không rõ nguyên nhân"}`);
        }
      }catch(e:any){
        setCrawlerRunning(false);
        setMsg(e.message);
      }
    },2000);
    return ()=>clearInterval(timer);
  },[crawlerRunning]);

  async function crawl(){
    setCrawlerRunning(true);
    setCrawlerProgress({status:"running",progress:0,processed:0,target:3,stage:"Đang khởi động"});
    setMsg("Đang cào dữ liệu nền; bạn vẫn có thể dùng các chức năng khác.");
    try{
      const x=await api<any>("/admin/crawler/run",{method:"POST"});
      if(x.status==="running" || x.status==="started") setMsg("Đã nhận yêu cầu. Đang theo dõi tiến độ crawler.");
    }catch(e:any){setCrawlerRunning(false);setCrawlerProgress(null);setMsg(`Không khởi chạy được crawler: ${e.message}`)}
  }

  async function status(id:string,s:string){
    await api(`/admin/rooms/${id}/status?status=${s}`,{method:"PUT"});load();
  }

  async function remove(id:string){
    if(!confirm("Xóa vĩnh viễn tin này?")) return;
    await api(`/admin/rooms/${id}`,{method:"DELETE"});load();
  }

  async function save(e:React.FormEvent){
    e.preventDefault();
    try{
      if(editing) await api(`/admin/rooms/${editing}`,{method:"PUT",body:JSON.stringify(form)});
      else await api("/admin/rooms",{method:"POST",body:JSON.stringify(form)});
      setForm(blank);setEditing(null);setMsg("Đã lưu phòng.");load();
    }catch(e:any){setMsg(e.message)}
  }

  function edit(r:Room){
    setEditing(r.id);
    setForm({
      title:r.title,description:r.description,price:r.price,room_count:r.room_count,available_count:r.available_count,area:r.area,
      region:r.region,district:r.district,ward:r.ward,street:r.street,address:r.address,
      lat:r.lat,lon:r.lon,images:r.images||[],amenities:r.amenities||[],phone:r.phone,
      seller_name:r.seller_name,available:r.available,status:r.status,source_url:r.source_url
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  const update=(k:string,v:any)=>setForm((f:any)=>({...f,[k]:v}));

  return <main className="min-h-screen bg-gray-100">
    <header className="flex items-center justify-between border-b bg-slate-950 px-5 py-4 text-white">
      <h1 className="font-black"><LayoutDashboard className="mr-2 inline"/> Admin Phòng Trọ Map</h1>
      <button onClick={()=>{localStorage.removeItem("token");router.push("/")}}>Đăng xuất</button>
    </header>

    <div className="mx-auto max-w-7xl p-5">
      <div className="grid gap-3 md:grid-cols-5">
        {[["Phòng",stats?.rooms],["Đang hiển thị",stats?.active_rooms],["Chủ trọ",stats?.landlords],["Người dùng",stats?.users],["Tin Nhà Tốt",stats?.nhatot_rooms]].map(([a,b])=>
          <div key={String(a)} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{a}</div><div className="mt-1 text-2xl font-black">{b??"—"}</div>
          </div>
        )}
      </div>

      <form onSubmit={save} className="mt-5 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-black">{editing?"Sửa phòng":"Thêm phòng thủ công"}</h2>
          {editing && <button type="button" onClick={()=>{setEditing(null);setForm(blank)}}>Hủy</button>}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <input required value={form.title} onChange={e=>update("title",e.target.value)} className="rounded border p-2 md:col-span-3" placeholder="Tiêu đề"/>
          <input type="number" value={form.price} onChange={e=>update("price",Number(e.target.value))} className="rounded border p-2" placeholder="Giá VNĐ/tháng"/>
          <label className="text-sm">Số phòng <input type="number" min="1" max="500" value={form.room_count} onChange={e=>update("room_count",Number(e.target.value))} className="mt-1 w-full rounded border p-2"/></label>
          <label className="text-sm">Phòng còn trống <input type="number" min="0" max={form.room_count} value={form.available_count} onChange={e=>update("available_count",Math.min(Number(e.target.value),form.room_count))} className="mt-1 w-full rounded border p-2"/></label>
          <input type="number" value={form.area||""} onChange={e=>update("area",e.target.value?Number(e.target.value):null)} className="rounded border p-2" placeholder="Diện tích m²"/>
          <input value={form.district} onChange={e=>update("district",e.target.value)} className="rounded border p-2" placeholder="Quận/Huyện"/>
          <input value={form.ward} onChange={e=>update("ward",e.target.value)} className="rounded border p-2" placeholder="Phường/Xã"/>
          <input value={form.address} onChange={e=>update("address",e.target.value)} className="rounded border p-2 md:col-span-2" placeholder="Địa chỉ"/>
          <input type="number" step="any" value={form.lat??""} onChange={e=>update("lat",e.target.value?Number(e.target.value):null)} className="rounded border p-2" placeholder="Latitude"/>
          <input type="number" step="any" value={form.lon??""} onChange={e=>update("lon",e.target.value?Number(e.target.value):null)} className="rounded border p-2" placeholder="Longitude"/>
          <input value={(form.images||[]).join(",")} onChange={e=>update("images",e.target.value.split(",").map((x:string)=>x.trim()).filter(Boolean))} className="rounded border p-2 md:col-span-3" placeholder="URL ảnh, cách nhau bằng dấu phẩy"/>
          <input value={(form.amenities||[]).join(",")} onChange={e=>update("amenities",e.target.value.split(",").map((x:string)=>x.trim()).filter(Boolean))} className="rounded border p-2 md:col-span-3" placeholder="Tiện ích"/>
          <textarea value={form.description} onChange={e=>update("description",e.target.value)} className="min-h-24 rounded border p-2 md:col-span-3" placeholder="Mô tả"/>
        </div>
        <button className="mt-3 rounded bg-slate-900 px-4 py-2 font-bold text-white"><Plus className="mr-1 inline" size={16}/>{editing?"Cập nhật":"Thêm phòng"}</button>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={crawl} disabled={crawlerRunning} className="rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`mr-1 inline ${crawlerRunning?"animate-spin":""}`} size={17}/> {crawlerRunning?"Crawler đang chạy…":"Chạy crawler Nhà Tốt (3 tin)"}</button>
        {crawlerRunning && <div className="w-full max-w-sm" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-gray-600"><span>{crawlerProgress?.stage || "Đang khởi động"} ({crawlerProgress?.processed ?? 0}/{crawlerProgress?.target ?? 3})</span><span>{crawlerProgress?.progress ?? 0}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{width:`${crawlerProgress?.progress ?? 0}%`}}/></div>
        </div>}
        <span className="text-sm text-gray-600">{msg}</span>
      </div>

      <div className="mt-7 overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50"><tr><th className="p-3">Phòng</th><th className="p-3">Giá</th><th className="p-3">Nguồn</th><th className="p-3">Trạng thái</th><th className="p-3">CRUD</th></tr></thead>
          <tbody>
            {rooms.map(r=><tr key={r.id} className="border-b">
              <td className="p-3"><b>{r.title}</b><div className="text-xs text-gray-500">{r.address}</div></td>
              <td className="p-3">{(r.price/1000000).toFixed(1)} tr</td>
              <td className="p-3">{r.source}</td>
              <td className="p-3">{r.status}</td>
              <td className="p-3">
                <div className="flex gap-2">
                  <button onClick={()=>edit(r)} className="rounded border p-2"><Pencil size={16}/></button>
                  {r.status!=="ACTIVE"&&<button onClick={()=>status(r.id,"active")} className="rounded border p-2 text-emerald-600"><Check size={16}/></button>}
                  {r.status==="ACTIVE"&&<button onClick={()=>status(r.id,"hidden")} className="rounded border p-2"><EyeOff size={16}/></button>}
                  <button onClick={()=>remove(r.id)} className="rounded border p-2 text-red-600"><Trash2 size={16}/></button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </main>
}
