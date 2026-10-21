"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ImagePlus, LoaderCircle, MapPin, Plus, RefreshCw, Search, X } from "lucide-react";
import { API, api } from "@/lib/api";
import { Room } from "@/types";

type AddressSuggestion = { label: string; lat: number; lon: number; district: string; ward: string; region: string };

function blankForm() {
  return {
    title: "", description: "", price: "", room_count: "1", available_count: "1", area: "",
    region: "Hà Nội", district: "", ward: "", street: "", address: "", lat: "", lon: "",
    images: "", amenities: "", phone: "", seller_name: "", source_url: "",
  };
}

function csv(value: string) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

export default function AdminAddRoomPage() {
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [existingUploads, setExistingUploads] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [crawlerRunning, setCrawlerRunning] = useState(false);
  const [crawlerProgress, setCrawlerProgress] = useState<any>(null);
  const [crawlerMessage, setCrawlerMessage] = useState("");
  const searchSequence = useRef(0);
  const router = useRouter();

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

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    setEditingId(editId);
    setLoadingRoom(true);
    api<Room>(`/rooms/${editId}`).then(room => {
      setForm({
      title: room.title,
      description: room.description || "",
      price: String(room.price),
      room_count: String(room.room_count),
      available_count: String(room.available_count ?? (room.available ? room.room_count : 0)),
      area: room.area == null ? "" : String(room.area),
      region: room.region || "",
      district: room.district || "",
      ward: room.ward || "",
      street: room.street || "",
      address: room.address || "",
      lat: room.lat == null ? "" : String(room.lat),
      lon: room.lon == null ? "" : String(room.lon),
      images: (room.images || []).join(", "),
      amenities: (room.amenities || []).join(", "),
      phone: room.phone || "",
      seller_name: room.seller_name || "",
      source_url: room.source_url || "",
      });
      setAddressQuery(room.street || room.address || "");
      if (room.lat != null && room.lon != null) {
        setSelectedAddress({ label: room.street || room.address, lat: room.lat, lon: room.lon, district: room.district, ward: room.ward, region: room.region });
      }
      setExistingUploads([...(room.uploaded_images || []), ...(room.images || [])]);
    }).catch(err => setError(err instanceof Error ? err.message : "Không tải được thông tin phòng."))
      .finally(() => setLoadingRoom(false));
  }, []);

  useEffect(() => {
    let active = true;
    const refreshCrawlerStatus = async () => {
      try {
        const state = await api<any>("/admin/crawler/status");
        if (!active) return;
        setCrawlerProgress(state);
        const running = state.status === "queued" || state.status === "running";
        setCrawlerRunning(running);
        if (state.source === "automatic" && running) {
          setCrawlerMessage(`Backend đang tự động cào dữ liệu (${state.job || "crawler"}).`);
        } else if (state.source === "automatic" && state.status === "completed") {
          setCrawlerMessage(`Lượt cào tự động hoàn tất: ${state.result?.created ?? 0} tin mới, ${state.result?.updated ?? 0} tin cập nhật.`);
        } else if (state.source === "manual" && state.status === "completed") {
          setCrawlerMessage(`Crawler demo hoàn tất: ${state.result?.created ?? 0} tin mới, ${state.result?.updated ?? 0} tin cập nhật.`);
        } else if (state.status === "failed") {
          setCrawlerMessage(`Crawler lỗi: ${state.error || "Không rõ nguyên nhân"}`);
        }
      } catch {
        // Keep polling through temporary API errors so an active automatic run remains visible.
      }
    };
    void refreshCrawlerStatus();
    const timer = window.setInterval(() => void refreshCrawlerStatus(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function update<K extends keyof ReturnType<typeof blankForm>>(key: K, value: ReturnType<typeof blankForm>[K]) {
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
      lat: String(suggestion.lat),
      lon: String(suggestion.lon),
      district: suggestion.district || current.district,
      ward: suggestion.ward || current.ward,
      region: suggestion.region || current.region,
    }));
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
      setError("Tối đa 8 ảnh tải mới cho mỗi lần lưu.");
      return;
    }
    setError("");
    setFiles(current => [...current, ...chosen]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    if (!selectedAddress) {
      setError("Hãy nhập địa chỉ và chọn một gợi ý chính xác trước khi lưu phòng.");
      setSaving(false);
      return;
    }
    const availableCount = Math.max(0, Math.min(Number(form.available_count), Number(form.room_count)));
    const payload = {
      ...form,
      price: Number(form.price),
      room_count: Number(form.room_count),
      available_count: availableCount,
      area: form.area ? Number(form.area) : null,
      lat: form.lat ? Number(form.lat) : null,
      lon: form.lon ? Number(form.lon) : null,
      images: csv(form.images),
      amenities: csv(form.amenities),
      available: availableCount > 0,
      status: "ACTIVE",
      source_url: form.source_url || null,
    };
    try {
      let room = editingId
        ? await api<Room>(`/admin/rooms/${editingId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Room>("/admin/rooms", { method: "POST", body: JSON.stringify(payload) });
      if (files.length) {
        const data = new FormData();
        files.forEach(file => data.append("files", file));
        room = await api<Room>(`/admin/rooms/${room.id}/images`, { method: "POST", body: data });
      }
      setNotice(editingId ? "Đã cập nhật phòng." : "Đã thêm phòng mới.");
      setForm(blankForm());
      setEditingId(null);
      setFiles([]);
      setExistingUploads([]);
      setAddressQuery("");
      setSelectedAddress(null);
      if (new URLSearchParams(window.location.search).has("edit")) router.replace("/admin/rooms/add");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được thông tin phòng.");
    } finally {
      setSaving(false);
    }
  }

  async function runCrawler() {
    setCrawlerMessage("Đang gửi yêu cầu chạy crawler…");
    setCrawlerProgress({ status: "running", progress: 0, processed: 0, target: 10, stage: "Đang khởi động" });
    try {
      const state = await api<any>("/admin/crawler/run", { method: "POST" });
      if (state && typeof state === "object") {
        setCrawlerProgress({ status: "running", progress: 0, processed: 0, target: 10, stage: "Đang khởi động", ...state });
      }
      setCrawlerRunning(true);
      setCrawlerMessage(state?.status === "queued"
        ? "Crawler demo đang chờ lượt tự động hoàn tất; tiến độ sẽ tự cập nhật tại đây."
        : "Crawler đang chạy. Tiến độ sẽ tự cập nhật tại đây.");
    } catch (err) {
      setCrawlerProgress(null);
      setCrawlerMessage(err instanceof Error ? err.message : "Không chạy được crawler.");
    }
  }

  const progress = Math.max(0, Math.min(100, Number(crawlerProgress?.progress) || 0));

  return <main className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] sm:p-6">
    <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5"><h1 className="text-2xl font-black text-slate-900">{editingId ? "Sửa phòng" : "Thêm phòng của admin"}</h1><p className="mt-1 text-sm text-slate-500">Nhập thông tin phòng; các trường ảnh và tiện nghi nhận danh sách phân cách bằng dấu phẩy.</p></div>
      {loadingRoom && <p className="mb-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16}/>Đang tải thông tin phòng…</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Tiêu đề
          <input required maxLength={300} value={form.title} onChange={event => update("title", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Giá thuê (VNĐ/tháng)
          <input required type="number" min="0" step="1000" value={form.price} onChange={event => update("price", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Diện tích (m²)
          <input type="number" min="0" step="0.1" value={form.area} onChange={event => update("area", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Tổng số phòng
          <input required type="number" min="1" max="500" value={form.room_count} onChange={event => update("room_count", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Số phòng còn trống
          <input required type="number" min="0" max={form.room_count} value={form.available_count} onChange={event => update("available_count", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/>
        </label>
        <div className="relative md:col-span-2">
          <label htmlFor="admin-address" className="block text-sm font-semibold text-slate-700">Tìm địa chỉ thực tế</label>
          <div className="relative mt-1.5">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input id="admin-address" required minLength={3} autoComplete="off" value={addressQuery} onChange={event => {
              const value = event.target.value;
              setAddressQuery(value);
              setSelectedAddress(null);
              setAddressSearchError("");
              setForm(current => ({ ...current, street: "", lat: "", lon: "" }));
            }} className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-11 outline-none focus:border-emerald-500" placeholder="Nhập tên đường, số nhà, phường hoặc địa điểm…"/>
            {searchingAddress && <LoaderCircle size={18} className="absolute right-3 top-1/2 animate-spin text-emerald-600"/>}
          </div>
          {suggestions.length > 0 && <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {suggestions.map((suggestion, index) => <li key={`${suggestion.lat}-${suggestion.lon}-${index}`}><button type="button" onClick={() => chooseAddress(suggestion)} className="flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-emerald-50"><MapPin size={17} className="mt-0.5 shrink-0 text-emerald-600"/><span>{suggestion.label}</span></button></li>)}
          </ul>}
          {selectedAddress && <p className="mt-2 flex items-start gap-2 text-xs text-emerald-700"><Check size={15} className="shrink-0"/>Đã chọn vị trí: {selectedAddress.label}</p>}
          {addressSearchError && <p role="status" className="mt-2 text-xs text-amber-700">{addressSearchError}</p>}
          <p className="mt-1 text-xs text-slate-400">Chọn một kết quả gợi ý để lưu tọa độ chính xác trên bản đồ.</p>
        </div>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Địa chỉ chi tiết (số nhà, ngõ, tầng…)
          <input maxLength={500} value={form.address} onChange={event => update("address", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Số điện thoại<input value={form.phone} onChange={event => update("phone", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/></label>
        <label className="text-sm font-semibold text-slate-700">Tên người đăng<input value={form.seller_name} onChange={event => update("seller_name", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/></label>
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-slate-700">Ảnh phòng <span className="font-normal text-slate-400">(JPG, PNG, WebP; tối đa 8 ảnh mới, mỗi ảnh 5 MB)</span></label>
          <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50">
            <ImagePlus size={20}/>Chọn ảnh từ thiết bị<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={selectFiles}/>
          </label>
          {(existingUploads.length > 0 || previews.length > 0) && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {existingUploads.map((src, index) => <div key={`existing-${src}-${index}`} className="relative overflow-hidden rounded-xl border"><img src={src.startsWith("/") ? `${API}${src}` : src} alt={`Ảnh phòng ${index + 1}`} className="h-28 w-full object-cover"/><span className="absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Đã lưu</span></div>)}
            {previews.map((src, index) => <div key={src} className="relative overflow-hidden rounded-xl border"><img src={src} alt={`Ảnh mới ${index + 1}`} className="h-28 w-full object-cover"/><button type="button" onClick={() => setFiles(current => current.filter((_, fileIndex) => fileIndex !== index))} className="absolute right-1 top-1 rounded-full bg-white p-1 text-slate-700 shadow" aria-label="Bỏ ảnh"><X size={15}/></button></div>)}
          </div>}
        </div>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">URL ảnh, phân cách bằng dấu phẩy<input value={form.images} onChange={event => update("images", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/></label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Tiện nghi, phân cách bằng dấu phẩy<input value={form.amenities} onChange={event => update("amenities", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/></label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Liên kết tin gốc<input type="url" value={form.source_url} onChange={event => update("source_url", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/></label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Mô tả<textarea rows={5} value={form.description} onChange={event => update("description", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-emerald-500"/></label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button disabled={saving || loadingRoom} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"><Plus size={17}/>{saving ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm phòng"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(blankForm()); router.replace("/admin/rooms/add"); }} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Hủy sửa</button>}
        </div>
      </form>
    </section>

    <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm lg:sticky lg:top-5">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><RefreshCw size={20}/></div><div><h2 className="font-black text-slate-900">Đồng bộ crawler</h2><p className="mt-1 text-sm leading-5 text-slate-500">Lấy thêm tin mới từ nguồn đã cấu hình.</p></div></div>
      <div className={`mt-4 rounded-xl p-3 text-sm ${crawlerProgress?.enabled === false ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
        {crawlerProgress?.enabled === false
          ? "Crawler tự động đang tắt trong cấu hình backend."
          : `Crawler tự động đang bật; cào tin mới mỗi ${crawlerProgress?.interval_minutes ?? 120} phút. Backfill mỗi ${crawlerProgress?.backfill_interval_hours ?? 6} giờ, làm mới dữ liệu mỗi ${crawlerProgress?.refresh_interval_hours ?? 24} giờ.`}
      </div>
      <button disabled={crawlerRunning} onClick={() => void runCrawler()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"><RefreshCw size={17} className={crawlerRunning ? "animate-spin" : ""}/>{crawlerRunning ? (crawlerProgress?.status === "queued" ? "Crawler đang chờ…" : "Crawler đang chạy…") : "Chạy crawler"}</button>
      {crawlerProgress && crawlerProgress.status !== "idle" && <div className="mt-4" aria-live="polite">
        <div className="mb-1 flex justify-between gap-2 text-xs text-slate-600"><span>{crawlerProgress.stage || (crawlerRunning ? "Đang xử lý" : "Hoàn tất")}</span><span>{progress}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }}/></div>
        <p className="mt-1 text-xs text-slate-500">{crawlerProgress.processed ?? 0}/{crawlerProgress.target ?? 10} tin</p>
      </div>}
      {crawlerMessage && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${crawlerMessage.toLowerCase().includes("lỗi") || crawlerMessage.toLowerCase().includes("không") ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
        {!crawlerRunning && crawlerProgress?.status === "completed" && <CheckCircle2 className="mr-1 inline" size={16}/>} {crawlerMessage}
      </p>}
    </aside>
  </main>;
}
