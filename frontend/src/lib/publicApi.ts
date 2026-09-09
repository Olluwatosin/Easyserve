import axios from "axios";

import { API_URL } from "./env";

// Unauthenticated axios client for customer-facing public pages.
// No auth interceptors so a missing/expired owner token never redirects customers to /login.
export const publicApi = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});
