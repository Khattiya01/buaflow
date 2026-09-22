import { BASE_URL } from "./global-setup";

// Minimal single-cookie jar: this app only ever sets one cookie (the session), so a full
// cookie-jar library would be more machinery than the problem needs.
export class TestClient {
  private cookie: string | undefined;

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, redirect: "manual" });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  async login(email: string, password: string) {
    const res = await this.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res;
  }

  get json() {
    return async (path: string, init?: RequestInit) => {
      const res = await this.request(path, init);
      const body = await res.json().catch(() => undefined);
      return { status: res.status, body };
    };
  }
}
