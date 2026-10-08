import { data, redirect } from "react-router";
import { apiResponse, ApiError } from "~/lib/api.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  try {
    const response = await apiResponse(request, "/api/auth/logout", { method: "POST" });
    const headers = new Headers();
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) headers.append("set-cookie", setCookie);
    return redirect("/", { headers });
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    throw error;
  }
}

export function loader() {
  return redirect("/");
}
