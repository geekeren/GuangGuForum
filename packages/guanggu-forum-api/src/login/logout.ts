import { request, getCacheService } from "../client";

export async function logout() {
  return request("/logout", {
    method: "GET",
  }).then(() => {
    const cs = getCacheService();
    cs.remove("cookies", true);
    cs.remove("current_username", true);
  });
}
