import axios from "axios";

// Unauthenticated axios client for customer-facing public pages.
// No auth interceptors so a missing/expired owner token never redirects customers to /login.
export const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
  timeout: 15000,
});
