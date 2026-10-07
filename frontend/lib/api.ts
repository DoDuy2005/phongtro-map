import { Room, User } from "@/types";

export const API =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("token")
      : null;

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

export async function api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  // Dùng Headers để xử lý mọi kiểu HeadersInit:
  // object, Headers hoặc array
  const headers = new Headers(init.headers);

  headers.set("Content-Type", "application/json");

  const auth = authHeaders();

  Object.entries(auth).forEach(([key, value]) => {
    headers.set(key, value);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers,
      signal: init.signal || controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("API không phản hồi sau 12 giây. Kiểm tra backend có đang chạy không.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const data = await res
      .json()
      .catch(() => ({ detail: "Có lỗi xảy ra" }));

    throw new Error(data.detail || "Có lỗi xảy ra");
  }

  return res.json();
}

export const getRooms = (params = "") =>
  api<{ items: Room[]; total: number }>(`/rooms${params}`);

export const getMe = () =>
  api<User>("/auth/me");

export const login = (
  email: string,
  password: string
) =>
  api<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });

export const register = (data: any) =>
  api<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const toggleFavorite = (id: string) =>
  api<{ saved: boolean }>(`/rooms/${id}/favorite`, {
    method: "POST",
  });
