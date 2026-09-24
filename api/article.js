const ARTICLE_SLUG = "outlier-reid";
const MAX_CONTENT_LENGTH = 2_000_000;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getSupabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

function isSafeArticleHtml(value) {
  return !/(<\s*script\b|<\s*(iframe|object|embed|form)\b|javascript\s*:|\bon[a-z]+\s*=)/i.test(value);
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    const error = new Error("Supabase API environment variables are missing");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || "Supabase request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  const requestedSlug = typeof req.query?.slug === "string" ? req.query.slug : ARTICLE_SLUG;
  if (requestedSlug !== ARTICLE_SLUG) return json(res, 400, { error: "Slug không hợp lệ" });

  try {
    if (req.method === "GET") {
      const rows = await supabaseRequest(
        `article_documents?select=slug,content_html,notes,updated_at&slug=eq.${encodeURIComponent(ARTICLE_SLUG)}&limit=1`,
      );
      return json(res, 200, { document: rows?.[0] || null });
    }

    if (req.method === "DELETE") {
      await supabaseRequest(`article_documents?slug=eq.${encodeURIComponent(ARTICLE_SLUG)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      return json(res, 200, { document: null });
    }

    if (req.method !== "PUT") return json(res, 405, { error: "Method không được hỗ trợ" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const contentHtml = typeof body.content_html === "string" ? body.content_html : "";
    const notes = Array.isArray(body.notes) ? body.notes : [];

    if (!contentHtml || contentHtml.length > MAX_CONTENT_LENGTH) {
      return json(res, 400, { error: "Nội dung bài viết không hợp lệ hoặc quá lớn" });
    }
    if (!isSafeArticleHtml(contentHtml)) {
      return json(res, 400, { error: "Nội dung chứa thẻ hoặc thuộc tính không an toàn" });
    }

    const rows = await supabaseRequest("article_documents?on_conflict=slug", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        slug: ARTICLE_SLUG,
        content_html: contentHtml,
        notes,
        updated_at: new Date().toISOString(),
      }),
    });

    return json(res, 200, { document: rows?.[0] || null });
  } catch (error) {
    console.error("Article API error:", error);
    return json(res, error.status || 500, { error: "Không thể xử lý dữ liệu bài viết" });
  }
};
