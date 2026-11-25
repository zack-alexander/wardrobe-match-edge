import worker from "../src/worker";

export const config = {
  runtime: "edge",
};

export default function handler(request: Request): Promise<Response> {
  return worker.fetch(request, {
    DEFAULT_STORE_DOMAIN: process.env.DEFAULT_STORE_DOMAIN,
    ELASTICSEARCH_INDEX: process.env.ELASTICSEARCH_INDEX,
    ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
    ELASTICSEARCH_API_KEY: process.env.ELASTICSEARCH_API_KEY,
    SHOPIFY_APP_SECRET: process.env.SHOPIFY_APP_SECRET,
  });
}
