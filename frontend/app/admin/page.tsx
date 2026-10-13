"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ChevronLeft, ChevronRight, EyeOff, Pencil, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Room } from "@/types";

const PAGE_SIZE = 100;

function pageWindow(totalPages: number, currentPage: number) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1);
}

function roomStatusLabel(status: string) {
  const labels: Record<string, string> = { ACTIVE: "Đang hiển thị", active: "Đang hiển thị", HIDDEN: "Đã ẩn", hidden: "Đã ẩn", PENDING: "Chờ duyệt", pending: "Chờ duyệt", REJECTED: "Từ chối", rejected: "Từ chối" };
  return labels[status] || status;
}

export default function AdminPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [postedWithin, setPostedWithin] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const [savedRetentionDays, setSavedRetentionDays] = useState("");
  const [savingRetention, setSavingRetention] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (search) params.set("q", search);
    if (postedWithin) params.set("posted_within_days", postedWithin);
    try {
      const result = await api<{ items: Room[]; total: number }>(`/admin/rooms?${params.toString()}`);
      setRooms(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách phòng.");
    } finally {
      setLoading(false);
    }
  }, [page, postedWithin, search]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  useEffect(() => {
    api<{ days: number | null }>("/admin/room-retention").then(result => {
      const days = result.days == null ? "" : String(result.days);
      setRetentionDays(days);
      setSavedRetentionDays(days);
    }).catch(err => setError(err instanceof Error ? err.message : "Không tải được thiết lập tự xóa tin."));
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchDraft.trim();
    setNotice("");
    if (page !== 1) setPage(1);
    if (search !== nextSearch) setSearch(nextSearch);
    else if (page === 1) void loadRooms();
  }

  function clearSearch() {
    setSearchDraft("");
    setNotice("");
    if (page !== 1) setPage(1);
    if (search) setSearch("");
    else if (page === 1) void loadRooms();
  }

  async function saveRetention(nextDays: string) {
    if (savingRetention || nextDays === savedRetentionDays) return;
    const confirmation = nextDays
      ? `Xác nhận đổi thời hạn sang ${nextDays} ngày? Tin Nhà Tốt quá hạn sẽ bị xóa vĩnh viễn ngay khi lưu. Tin chủ trọ tự đăng vẫn được giữ và chủ trọ sẽ nhận email nhắc xác nhận.`
      : "Xác nhận tắt tự động xóa tin Nhà Tốt và dừng nhắc chủ trọ về tin quá hạn?";
    if (!confirm(confirmation)) {
      setRetentionDays(savedRetentionDays);
      return;
    }
    setSavingRetention(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ days: number | null; deleted: number }>("/admin/room-retention", {
        method: "PUT",
        body: JSON.stringify({ days: nextDays ? Number(nextDays) : null }),
      });
      const savedDays = result.days == null ? "" : String(result.days);
      setRetentionDays(savedDays);
      setSavedRetentionDays(savedDays);
      setNotice(result.days ? `Đã bật thời hạn ${result.days} ngày; xóa ${result.deleted} tin Nhà Tốt quá hạn. Tin chủ trọ được giữ và sẽ được nhắc qua email.` : "Đã tắt tự động xóa và nhắc tin quá hạn.");
      if (result.deleted) await loadRooms();
    } catch (err) {
      setRetentionDays(savedRetentionDays);
      setError(err instanceof Error ? err.message : "Không lưu được thời hạn tự xóa.");
    } finally {
      setSavingRetention(false);
    }
  }

  async function changeStatus(room: Room) {
    const nextStatus = room.status.toLowerCase() === "active" ? "hidden" : "active";
    try {
      await api(`/admin/rooms/${room.id}/status?status=${nextStatus}`, { method: "PUT" });
      setNotice(nextStatus === "active" ? "Đã hiển thị lại phòng." : "Đã ẩn phòng.");
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được trạng thái phòng.");
    }
  }

  async function removeRoom(room: Room) {
    if (!confirm(`Xóa vĩnh viễn tin “${room.title}”?`)) return;
    try {
      await api(`/admin/rooms/${room.id}`, { method: "DELETE" });
      setNotice("Đã xóa tin phòng.");
      if (rooms.length === 1 && page > 1) setPage(current => current - 1);
      else await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xóa được phòng.");
    }
  }

  const pages = pageWindow(totalPages, page);

  return <main className="mx-auto max-w-7xl p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Tất cả phòng</h1>
        <p className="mt-1 text-sm text-slate-500">Tra cứu và quản lý tin phòng trên hệ thống.</p>
      </div>
      <div className="rounded-xl bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">Tổng cộng <b className="text-slate-900">{total.toLocaleString("vi-VN")}</b> phòng</div>
    </div>

    <form onSubmit={submitSearch} className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-emerald-500">
        <Search size={17} className="shrink-0 text-slate-400"/>
        <input value={searchDraft} onChange={event => setSearchDraft(event.target.value)} className="w-full min-w-0 py-2.5 text-sm outline-none" placeholder="Tìm theo tiêu đề, địa chỉ, chủ tin, số điện thoại…" aria-label="Tìm phòng"/>
      </label>
      <button className="rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">Tìm kiếm</button>
      {searchDraft && <button type="button" onClick={clearSearch} aria-label="Xóa tìm kiếm" className="rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"><X size={17}/></button>}
      <select aria-label="Lọc theo thời gian đăng" value={postedWithin} onChange={event => { setPostedWithin(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
        <option value="">Tất cả thời gian đăng</option><option value="1">Đăng trong 1 ngày</option><option value="3">Đăng trong 3 ngày</option><option value="5">Đăng trong 5 ngày</option><option value="7">Đăng trong 7 ngày</option>
      </select>
    </form>

    <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex min-w-0 items-start gap-3"><CalendarClock size={20} className="mt-0.5 shrink-0 text-amber-700"/><div><h2 className="text-sm font-black text-amber-950">Tự động xóa tin quá hạn</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-amber-900">Tin đăng sẽ tự động bị xóa sau một khoảng thời gian nhất định nếu không còn hoạt động.</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Thời hạn xóa tin" value={retentionDays} disabled={savingRetention} onChange={event => { const nextDays = event.target.value; setRetentionDays(nextDays); void saveRetention(nextDays); }} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60">
          <option value="">Tắt tự động xóa</option><option value="1">Xóa sau 1 ngày</option><option value="3">Xóa sau 3 ngày</option><option value="5">Xóa sau 5 ngày</option><option value="7">Xóa sau 7 ngày</option>
        </select>
        {savingRetention && <span role="status" className="text-xs text-amber-900">Saving...</span>}
      </div>
    </section>

    {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void loadRooms()} className="shrink-0 font-bold underline">Thử lại</button></div>}

    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
          <th className="p-4">Thông tin phòng</th><th className="p-4">Giá / diện tích</th><th className="p-4">Ngày đăng</th><th className="p-4">Nguồn / trạng thái</th><th className="p-4">Thao tác</th>
        </tr></thead>
        <tbody>
          {rooms.map(room => <tr key={room.id} className="border-b last:border-0 hover:bg-slate-50/70">
            <td className="max-w-md p-4"><p className="line-clamp-2 font-bold text-slate-900">{room.title}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{[room.address, room.street, room.ward, room.district].filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(", ") || "Chưa có địa chỉ"}</p><p className="mt-1 text-[11px] text-slate-400">{room.seller_name || ""}{room.phone ? ` · ${room.phone}` : ""}</p></td>
            <td className="whitespace-nowrap p-4"><b className="text-emerald-700">{(room.price / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu</b><p className="mt-1 text-xs text-slate-500">{room.area ? `${room.area} m²` : "Chưa rõ diện tích"}</p></td>
            <td className="whitespace-nowrap p-4 text-slate-600">{new Date(room.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
            <td className="p-4"><span className="block text-xs text-slate-500">{room.source}</span><span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${room.status.toLowerCase() === "active" ? "bg-emerald-50 text-emerald-700" : room.status.toLowerCase() === "pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{roomStatusLabel(room.status)}</span></td>
            <td className="p-4"><div className="flex items-center gap-1.5">
              <button title="Sửa phòng" onClick={() => router.push(`/admin/rooms/add?edit=${room.id}`)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"><Pencil size={16}/></button>
              {room.status.toLowerCase() === "active" ? <button title="Ẩn phòng" onClick={() => void changeStatus(room)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"><EyeOff size={16}/></button> : <button title="Hiển thị phòng" onClick={() => void changeStatus(room)} className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"><Check size={16}/></button>}
              <button title="Xóa phòng" onClick={() => void removeRoom(room)} className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50"><Trash2 size={16}/></button>
            </div></td>
          </tr>)}
          {!loading && !rooms.length && <tr><td colSpan={5} className="p-12 text-center text-slate-500">{search ? "Không tìm thấy phòng phù hợp." : "Chưa có phòng nào."}</td></tr>}
          {loading && <tr><td colSpan={5} className="p-12 text-center text-slate-500">Đang tải danh sách phòng…</td></tr>}
        </tbody>
      </table>
    </div>

    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{total ? `Trang ${page} / ${totalPages} · ${rooms.length} phòng trên trang` : "Không có kết quả"}</p>
      {totalPages > 1 && <nav aria-label="Phân trang danh sách phòng" className="flex flex-wrap items-center gap-1">
        <button disabled={page <= 1} onClick={() => setPage(current => current - 1)} aria-label="Trang trước" className="rounded-lg border bg-white p-2 text-slate-700 disabled:opacity-40"><ChevronLeft size={17}/></button>
        {pages.map((number, index) => <div key={number} className="flex items-center gap-1">
          {index > 0 && number - pages[index - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
          <button aria-current={number === page ? "page" : undefined} onClick={() => setPage(number)} className={`min-w-9 rounded-lg border px-3 py-2 text-sm font-semibold ${number === page ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{number}</button>
        </div>)}
        <button disabled={page >= totalPages} onClick={() => setPage(current => current + 1)} aria-label="Trang sau" className="rounded-lg border bg-white p-2 text-slate-700 disabled:opacity-40"><ChevronRight size={17}/></button>
      </nav>}
    </footer>
  </main>;
}
