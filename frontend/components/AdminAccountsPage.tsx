"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";

type AccountRole = "user" | "landlord";
type Account = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: AccountRole;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
};
type ActiveFilter = "all" | "active" | "disabled";

const PAGE_SIZE = 25;

function pageWindow(totalPages: number, currentPage: number) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1);
}

export default function AdminAccountsPage({ role }: { role: AccountRole }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ role, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (search) params.set("q", search);
    if (activeFilter !== "all") params.set("active", String(activeFilter === "active"));
    try {
      const result = await api<{ items: Account[]; total: number }>(`/admin/accounts?${params.toString()}`);
      setAccounts(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách tài khoản.");
    } finally {
      setLoading(false);
    }
  }, [activeFilter, page, role, search]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const nextSearch = searchDraft.trim();
    if (page !== 1) setPage(1);
    if (search !== nextSearch) setSearch(nextSearch);
    else if (page === 1) void loadAccounts();
  }

  function changeFilter(value: ActiveFilter) {
    setNotice("");
    if (page !== 1) setPage(1);
    setActiveFilter(value);
  }

  async function toggleAccount(account: Account) {
    const nextActive = !account.is_active;
    if (!nextActive && !confirm(`Khóa tài khoản ${account.email}? Tài khoản sẽ không thể đăng nhập cho đến khi được mở khóa.`)) return;
    setChangingId(account.id);
    setError("");
    setNotice("");
    try {
      await api(`/admin/accounts/${account.id}/active?active=${nextActive}`, { method: "PUT" });
      setNotice(nextActive ? `Đã mở khóa ${account.email}.` : `Đã khóa ${account.email}.`);
      if (activeFilter !== "all" && accounts.length === 1 && page > 1) setPage(current => current - 1);
      else await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được tài khoản.");
    } finally {
      setChangingId(null);
    }
  }

  const pages = pageWindow(totalPages, page);
  const heading = role === "landlord" ? "Quản lý chủ trọ" : "Quản lý người dùng";

  return <main className="mx-auto max-w-7xl p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black text-slate-900">{heading}</h1><p className="mt-1 text-sm text-slate-500">Tìm kiếm tài khoản và kiểm soát quyền đăng nhập.</p></div>
      <div className="rounded-xl bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">Tổng cộng <b className="text-slate-900">{total.toLocaleString("vi-VN")}</b> tài khoản</div>
    </div>

    <form onSubmit={submitSearch} className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-emerald-500">
        <Search size={17} className="shrink-0 text-slate-400"/><input value={searchDraft} onChange={event => setSearchDraft(event.target.value)} className="w-full min-w-0 py-2.5 text-sm outline-none" placeholder="Tìm theo tên, email hoặc điện thoại…" aria-label="Tìm tài khoản"/>
      </label>
      <select aria-label="Lọc trạng thái tài khoản" value={activeFilter} onChange={event => changeFilter(event.target.value as ActiveFilter)} className="rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
        <option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="disabled">Đã khóa</option>
      </select>
      <button className="rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">Tìm kiếm</button>
      {searchDraft && <button type="button" onClick={() => { setSearchDraft(""); if (search) { setSearch(""); setPage(1); } }} aria-label="Xóa tìm kiếm" className="rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"><X size={17}/></button>}
    </form>

    {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void loadAccounts()} className="shrink-0 font-bold underline">Thử lại</button></div>}

    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Tài khoản</th><th className="p-4">Điện thoại</th><th className="p-4">Ngày tạo</th><th className="p-4">Trạng thái</th><th className="p-4">Thao tác</th></tr></thead>
        <tbody>
          {accounts.map(account => <tr key={account.id} className="border-b last:border-0 hover:bg-slate-50/70">
            <td className="p-4"><p className="font-bold text-slate-900">{account.full_name || "Chưa cập nhật tên"}</p><p className="mt-1 text-xs text-slate-500">{account.email}</p><p className="mt-1 text-[11px] text-slate-400">{account.is_email_verified ? "Email đã xác minh" : "Email chưa xác minh"}</p></td>
            <td className="p-4 text-slate-600">{account.phone || "—"}</td>
            <td className="whitespace-nowrap p-4 text-slate-600">{new Date(account.created_at).toLocaleDateString("vi-VN")}</td>
            <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${account.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{account.is_active ? "Đang hoạt động" : "Đã khóa"}</span></td>
            <td className="p-4"><button disabled={changingId === account.id} onClick={() => void toggleAccount(account)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50 ${account.is_active ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
              {account.is_active ? <><ShieldAlert size={15}/>{changingId === account.id ? "Đang khóa…" : "Khóa tài khoản"}</> : <><ShieldCheck size={15}/>{changingId === account.id ? "Đang mở…" : "Mở khóa"}</>}
            </button></td>
          </tr>)}
          {!loading && !accounts.length && <tr><td colSpan={5} className="p-12 text-center text-slate-500">{search ? "Không tìm thấy tài khoản phù hợp." : "Chưa có tài khoản nào."}</td></tr>}
          {loading && <tr><td colSpan={5} className="p-12 text-center text-slate-500">Đang tải danh sách tài khoản…</td></tr>}
        </tbody>
      </table>
    </div>

    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{total ? `Trang ${page} / ${totalPages} · ${accounts.length} tài khoản trên trang` : "Không có kết quả"}</p>
      {totalPages > 1 && <nav aria-label="Phân trang tài khoản" className="flex flex-wrap items-center gap-1">
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
