"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ImagePlus, List, LoaderCircle, LogOut, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { API, api } from "@/lib/api";
import { Room } from "@/types";

type Tab = "create" | "rooms";
type AddressSuggestion = {
  label: string;
  lat: number;
  lon: number;
  district: string;
  ward: string;
  region: string;
};

const emptyForm = () => ({
  title: "",
  description: "",
  price: "",
  room_count: "",
  available_count: "",
  area: "",
  region: "Hà Nội",
  district: "",
  ward: "",
  street: "",
  address: "",
  lat: null as number | null,
  lon: null as number | null,
  images: [] as string[],
  amenities: [] as string[],
  phone: "",
  seller_name: "",
  available: true,
  status: "ACTIVE",
  source_url: null as string | null,
});

function imageSource(path?: string) {
  if (!path) return "https://placehold.co/120x90?text=Phong+tro";
  return path.startsWith("/") ? `${API}${path}` : path;
}

export default function LandlordPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState<Tab>("rooms");
  const [editing, setEditing] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [existingUploads, setExistingUploads] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatingAvailability, setUpdatingAvailability] = useState<string | null>(null);
  const searchSequence = useRef(0);
  const router = useRouter();

  async function load() {
    setLoadingRooms(true);
    try {
      const result = await api<{ items: Room[] }>("/landlord/rooms");
      setRooms(result.items);
    } catch {
      router.push("/auth");
    } finally {
      setLoadingRooms(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);

  useEffect(() => {
    const query = addressQuery.trim();
    const sequence = ++searchSequence.current;
    if (query.length < 3 || selectedAddress?.label === query) {
      setSuggestions([]);
      setSearchingAddress(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const result = await api<AddressSuggestion[]>(`/geocode/search?q=${encodeURIComponent(query)}`);
        if (sequence === searchSequence.current) setSuggestions(result);
      } catch {
        if (sequence === searchSequence.current) {
          setSuggestions([]);
          setAddressSearchError("Không tìm được gợi ý địa chỉ. Kiểm tra kết nối rồi thử lại.");
        }
      } finally {
        if (sequence === searchSequence.current) setSearchingAddress(false);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [addressQuery, selectedAddress]);

  function update<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function chooseAddress(suggestion: AddressSuggestion) {
    setSelectedAddress(suggestion);
    setAddressSearchError("");
    setAddressQuery(suggestion.label);
    setSuggestions([]);
    setForm(current => ({
      ...current,
      street: suggestion.label,
      lat: suggestion.lat,
      lon: suggestion.lon,
      district: suggestion.district || current.district,
      ward: suggestion.ward || current.ward,
      region: suggestion.region || current.region,
    }));
  }

  function resetForm() {
    setForm(emptyForm());
    setEditing(null);
    setFiles([]);
    setExistingUploads([]);
    setAddressQuery("");
    setSelectedAddress(null);
    setSuggestions([]);
    setError("");
    setNotice("");
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files || []);
    event.target.value = "";
    if (!chosen.length) return;
    if (chosen.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (chosen.some(file => file.size > 5 * 1024 * 1024)) {
      setError("Mỗi ảnh phải nhỏ hơn 5 MB.");
      return;
    }
    if (files.length + chosen.length > 8) {
      setError("Mỗi lần đăng có thể tải tối đa 8 ảnh mới.");
      return;
    }
    setError("");
    setFiles(current => [...current, ...chosen]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selectedAddress) {
      setError("Hãy tìm và chọn một địa chỉ trên bản đồ trước khi đăng phòng.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        room_count: Number(form.room_count),
        available_count: Math.min(form.available_count === "" ? Number(form.room_count) : Number(form.available_count), Number(form.room_count)),
        available: (form.available_count === "" ? Number(form.room_count) : Number(form.available_count)) > 0,
        area: form.area ? Number(form.area) : null,
        amenities: form.amenities,
      };
      const room = editing
        ? await api<Room>(`/landlord/rooms/${editing}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Room>("/landlord/rooms", { method: "POST", body: JSON.stringify(payload) });
      setEditing(room.id);

      let savedRoom = room;
      if (files.length) {
        const data = new FormData();
        files.forEach(file => data.append("files", file));
        savedRoom = await api<Room>(`/landlord/rooms/${room.id}/images`, { method: "POST", body: data });
      }
      setRooms(current => [savedRoom, ...current.filter(item => item.id !== savedRoom.id)]);
      resetForm();
      setTab("rooms");
      setNotice(editing ? "Đã cập nhật phòng." : "Đã đăng phòng mới.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được thông tin phòng.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Bạn có chắc muốn xóa tin phòng này?")) return;
    try {
      await api(`/landlord/rooms/${id}`, { method: "DELETE" });
      setRooms(current => current.filter(room => room.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xóa được phòng.");
    }
  }

  async function toggleAvailability(room: Room) {
    if (updatingAvailability) return;
    setUpdatingAvailability(room.id);
    setError("");
    try {
      const currentCount = room.available_count ?? (room.available ? room.room_count : 0);
      const nextCount = currentCount > 0 ? 0 : room.room_count;
      const updated = await api<Room>(`/landlord/rooms/${room.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...room, available_count: nextCount, available: nextCount > 0 }),
      });
      setRooms(current => current.map(item => item.id === updated.id ? updated : item));
      setNotice(updated.available_count > 0 ? `Còn ${updated.available_count}/${updated.room_count} phòng trống.` : "Đã cập nhật: tất cả phòng đã cho thuê.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được trạng thái phòng.");
    } finally {
      setUpdatingAvailability(null);
    }
  }

  async function updateAvailableCount(room: Room, nextCount: number) {
    if (updatingAvailability) return;
    const count = Math.max(0, Math.min(room.room_count, nextCount));
    setUpdatingAvailability(room.id);
    setError("");
    try {
      const updated = await api<Room>(`/landlord/rooms/${room.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...room, available_count: count, available: count > 0 }),
      });
      setRooms(current => current.map(item => item.id === updated.id ? updated : item));
      setNotice(`Đã cập nhật: còn ${updated.available_count}/${updated.room_count} phòng trống.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được số phòng trống.");
    } finally {
      setUpdatingAvailability(null);
    }
  }

  function edit(room: Room) {
    setEditing(room.id);
    setForm({
      title: room.title,
      description: room.description,
      price: String(room.price),
      room_count: String(room.room_count || 1),
      available_count: String(room.available_count ?? (room.available ? room.room_count : 0)),
      area: room.area ? String(room.area) : "",
      region: room.region,
      district: room.district,
      ward: room.ward,
      street: room.street,
      address: room.address,
      lat: room.lat ?? null,
      lon: room.lon ?? null,
      images: room.images || [],
      amenities: room.amenities || [],
      phone: room.phone,
      seller_name: room.seller_name,
      available: room.available,
      status: room.status,
      source_url: room.source_url || null,
    });
    setSelectedAddress(room.lat != null && room.lon != null ? {
      label: room.street,
      lat: room.lat,
      lon: room.lon,
      district: room.district,
      ward: room.ward,
      region: room.region,
    } : null);
    setAddressQuery(room.street || "");
    setExistingUploads([...(room.uploaded_images || []), ...(room.images || [])]);
    setFiles([]);
    setError("");
    setNotice("");
    setTab("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const photoCount = useMemo(() => existingUploads.length + files.length, [existingUploads, files]);
  const roomStats = useMemo(() => ({
    listings: rooms.length,
    units: rooms.reduce((sum, room) => sum + (Number(room.room_count) || 0), 0),
    available: rooms.reduce((sum, room) => sum + (Number(room.available_count) || 0), 0),
    rented: rooms.reduce((sum, room) => sum + Math.max(0, (Number(room.room_count) || 0) - (Number(room.available_count) || 0)), 0),
  }), [rooms]);
  const [roomQuery, setRoomQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState<"all" | "available" | "rented">("all");
  const visibleRooms = useMemo(() => rooms.filter(room => {
    const availableCount = Number(room.available_count ?? (room.available ? room.room_count : 0));
    const matchesStatus = roomFilter === "all" || (roomFilter === "available" ? availableCount > 0 : availableCount === 0);
    const query = roomQuery.trim().toLocaleLowerCase("vi-VN");
    const matchesQuery = !query || `${room.title} ${room.street} ${room.address} ${room.district} ${room.ward}`.toLocaleLowerCase("vi-VN").includes(query);
    return matchesStatus && matchesQuery;
  }), [rooms, roomFilter, roomQuery]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-5 py-4">
        <h1 className="text-xl font-black text-slate-900"><Building2 className="mr-2 inline text-sky-600" size={22} />Khu vực chủ trọ</h1>
        <button onClick={() => { localStorage.removeItem("token"); router.push("/"); }} className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          <LogOut className="mr-1 inline" size={16} />Đăng xuất
        </button>
      </header>

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div role="tablist" aria-label="Quản lý phòng trọ" className="mb-5 flex gap-2 rounded-2xl bg-white p-2 shadow-sm">
          <button role="tab" aria-selected={tab === "rooms"} onClick={() => { setTab("rooms"); setNotice(""); }} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${tab === "rooms" ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <List size={18} />Quản lý phòng <span className="rounded-full bg-white/20 px-2 py-0.5">{rooms.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "create"} onClick={() => { setTab("create"); setNotice(""); }} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${tab === "create" ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <Plus size={18} />{editing ? "Sửa phòng" : "Thêm phòng"}
          </button>
        </div>

        {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</p>}
        {tab === "create" ? (
          <form onSubmit={save} className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-lg font-black text-slate-900">{editing ? "Sửa thông tin phòng" : "Đăng phòng mới"}</h2><p className="mt-1 text-sm text-slate-500">Nhập thông tin phòng và chọn địa chỉ để ghim trên bản đồ.</p></div>
              {editing && <button type="button" onClick={resetForm} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Hủy sửa</button>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input required maxLength={300} value={form.title} onChange={e => update("title", e.target.value)} className="rounded-xl border border-slate-200 p-3 outline-none focus:border-sky-500 md:col-span-2" placeholder="Tiêu đề tin, ví dụ: Phòng trọ gần Đại học Bách Khoa" />
              <label className="text-sm font-semibold text-slate-700">Giá thuê mỗi tháng (VNĐ)
                <input required type="number" min="0" step="1000" value={form.price} onChange={e => update("price", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Ví dụ: 2500000" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Số lượng phòng
                <input required type="number" min="1" max="500" value={form.room_count} onChange={e => update("room_count", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Ví dụ: 1 phòng" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Diện tích (m²)
                <input type="number" min="0" step="0.1" value={form.area} onChange={e => update("area", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Ví dụ: 25" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Số điện thoại liên hệ
                <input value={form.phone} onChange={e => update("phone", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Ví dụ: 0901 234 567" />
              </label>

              <div className="relative md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="address-search">Tìm địa chỉ thực tế</label>
                <div className="relative mt-1.5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input id="address-search" required minLength={3} value={addressQuery} onChange={e => {
                    const value = e.target.value;
                    setAddressQuery(value);
                    setSelectedAddress(null);
                    setAddressSearchError("");
                    setForm(current => ({ ...current, street: "", lat: null, lon: null }));
                  }} className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-11 outline-none focus:border-sky-500" placeholder="Nhập tên đường, số nhà, phường hoặc địa điểm…" autoComplete="off" />
                  {searchingAddress && <LoaderCircle className="absolute right-3 top-1/2 animate-spin text-sky-600" size={18} />}
                </div>
                {suggestions.length > 0 && <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                  {suggestions.map((suggestion, index) => <li key={`${suggestion.lat}-${suggestion.lon}-${index}`}>
                    <button type="button" onClick={() => chooseAddress(suggestion)} className="flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-sky-50">
                      <MapPin size={17} className="mt-0.5 shrink-0 text-sky-600" /><span>{suggestion.label}</span>
                    </button>
                  </li>)}
                </ul>}
                {selectedAddress && <p className="mt-2 flex items-start gap-2 text-xs text-emerald-700"><Check size={15} className="shrink-0" />Đã chọn vị trí trên bản đồ: {selectedAddress.label}</p>}
                {addressSearchError && <p role="status" className="mt-2 text-xs text-amber-700">{addressSearchError}</p>}
                <p className="mt-1 text-xs text-slate-400">Gợi ý từ OpenStreetMap qua Photon.</p>
              </div>

              <label className="text-sm font-semibold text-slate-700 md:col-span-2">Địa chỉ chi tiết
                <input required maxLength={500} value={form.address} onChange={e => update("address", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Số nhà, ngõ/ngách, tầng, tên khu trọ…" />
              </label>

              <label className="text-sm font-semibold text-slate-700 md:col-span-2">Mô tả phòng
                <textarea value={form.description} onChange={e => update("description", e.target.value)} className="mt-1.5 min-h-32 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Mô tả tiện nghi, giờ giấc, tiền đặt cọc…" />
              </label>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Ảnh phòng <span className="font-normal text-slate-400">(JPG, PNG, WebP; tối đa 8 ảnh mới, mỗi ảnh 5 MB)</span></label>
                <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-sky-700 hover:border-sky-400 hover:bg-sky-50">
                  <ImagePlus size={20} />Chọn ảnh từ thiết bị
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={selectFiles} />
                </label>
                {photoCount > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {existingUploads.map((src, index) => <div key={`old-${src}-${index}`} className="relative overflow-hidden rounded-xl border">
                    <img src={imageSource(src)} alt={`Ảnh phòng ${index + 1}`} className="h-28 w-full object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Đã lưu</span>
                  </div>)}
                  {previews.map((src, index) => <div key={`new-${src}`} className="relative overflow-hidden rounded-xl border">
                    <img src={src} alt={`Ảnh mới ${index + 1}`} className="h-28 w-full object-cover" />
                    <button type="button" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded-full bg-white p-1 text-slate-700 shadow" aria-label="Bỏ ảnh"><X size={15} /></button>
                  </div>)}
                </div>}
              </div>

              <label className="text-sm font-semibold text-slate-700 md:col-span-2">Tiện ích
                <input value={form.amenities.join(", ")} onChange={e => update("amenities", e.target.value.split(",").map(value => value.trim()).filter(Boolean))} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Ví dụ: điều hòa, nóng lạnh, máy giặt" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Số phòng còn trống
                <input type="number" min="0" max={form.room_count || 500} value={form.available_count} onChange={e => { update("available_count", e.target.value); update("available", Number(e.target.value) > 0); }} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-sky-500" placeholder="Nhập số phòng còn trống" />
              </label>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-bold text-white hover:bg-sky-700 disabled:opacity-60">
              {saving ? <LoaderCircle className="animate-spin" size={18} /> : editing ? <Check size={18} /> : <Plus size={18} />}
              {saving ? "Đang lưu…" : editing ? "Cập nhật phòng" : "Đăng phòng"}
            </button>
          </form>
        ) : (
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-900">Quản lý phòng trọ</h2>
              <p className="mt-1 text-sm text-slate-500">Theo dõi tin đăng, số phòng trống và tình trạng cho thuê.</p>
            </div>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Tin đang quản lý", value: roomStats.listings, suffix: "tin" },
                { label: "Tổng số phòng", value: roomStats.units, suffix: "phòng" },
                { label: "Còn trống", value: roomStats.available, suffix: "phòng" },
                { label: "Đã cho thuê", value: roomStats.rented, suffix: "phòng" },
              ].map(stat => <div key={stat.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{stat.value} <span className="text-sm font-semibold text-slate-500">{stat.suffix}</span></p>
              </div>)}
            </div>
            {loadingRooms ? <div className="rounded-xl bg-white p-8 text-center text-slate-500">Đang tải danh sách phòng…</div> : rooms.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><Building2 className="mx-auto text-slate-300" size={36} /><p className="mt-3 font-bold text-slate-700">Bạn chưa thêm phòng nào</p><button onClick={() => setTab("create")} className="mt-3 text-sm font-bold text-sky-700">Đăng phòng đầu tiên</button></div> : <>
              <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm sm:flex-row">
                <label className="relative flex-1">
                  <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={roomQuery} onChange={event => setRoomQuery(event.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500" placeholder="Tìm theo tên tin hoặc địa chỉ" aria-label="Tìm phòng" />
                </label>
                <div className="flex gap-2" aria-label="Lọc theo tình trạng phòng">
                  {([ ["all", "Tất cả"], ["available", "Còn trống"], ["rented", "Đã cho thuê"] ] as const).map(([value, label]) => <button key={value} onClick={() => setRoomFilter(value)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${roomFilter === value ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
                </div>
              </div>
              {visibleRooms.length === 0 ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Không tìm thấy phòng phù hợp với bộ lọc.</div> : <div className="space-y-3">
                {visibleRooms.map(room => <article key={room.id} className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                  {(room.uploaded_images?.[0] || room.images?.[0]) ? <img src={imageSource(room.uploaded_images?.[0] || room.images[0])} alt="Ảnh phòng" className="h-28 w-full rounded-xl object-cover sm:w-36" /> : <div className="flex h-28 w-full items-center justify-center rounded-xl bg-slate-100 text-slate-300 sm:w-36"><ImagePlus size={28} /></div>}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900">{room.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-sky-700">{(room.price / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu/tháng <span className="font-normal text-slate-500">· {room.room_count} phòng · {room.area || "Chưa rõ"} m²</span></p>
                    <p className="mt-1 truncate text-sm text-slate-500">{room.street}{room.address ? `, ${room.address}` : ""}</p>
                    <p className="mt-2 text-xs text-slate-500">Còn {room.available_count ?? (room.available ? room.room_count : 0)}/{room.room_count} phòng trống{room.phone ? ` · Liên hệ: ${room.phone}` : ""} · {room.status}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-1 py-1">
                      <button disabled={updatingAvailability === room.id || (room.available_count ?? 0) <= 0} onClick={() => void updateAvailableCount(room, (room.available_count ?? 0) - 1)} className="h-8 w-8 rounded-md text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40" aria-label="Đánh dấu thêm một phòng đã thuê">−</button>
                      <span className="min-w-16 text-center text-xs font-bold text-slate-700">{room.available_count ?? (room.available ? room.room_count : 0)}/{room.room_count} trống</span>
                      <button disabled={updatingAvailability === room.id || (room.available_count ?? 0) >= room.room_count} onClick={() => void updateAvailableCount(room, (room.available_count ?? 0) + 1)} className="h-8 w-8 rounded-md text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40" aria-label="Đánh dấu thêm một phòng còn trống">+</button>
                    </div>
                    <button disabled={updatingAvailability === room.id} onClick={() => void toggleAvailability(room)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${room.available_count > 0 ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`} aria-label={room.available_count > 0 ? "Đánh dấu đã cho thuê" : "Đánh dấu còn trống"}>
                      {updatingAvailability === room.id ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}
                      {room.available_count > 0 ? "Cho thuê hết" : "Mở lại tất cả"}
                    </button>
                    <button onClick={() => edit(room)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={16} />Sửa</button>
                    <button onClick={() => void remove(room.id)} className="rounded-lg border p-2 text-red-600 hover:bg-red-50" aria-label="Xóa phòng"><Trash2 size={17} /></button>
                  </div>
                </article>)}
              </div>}
            </>}
          </section>
        )}
      </div>
    </main>
  );
}
