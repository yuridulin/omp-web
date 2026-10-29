import createClient from "openapi-fetch";
import type { paths } from "./schema";

/** Typed HTTP client generated from `contract/open-api.yaml`. */
export const api = createClient<paths>({ baseUrl: "" });
