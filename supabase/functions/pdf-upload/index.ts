// QR Forever — isolated PDF upload backend for a dedicated Supabase project.
// Configure QR_PDF_UPLOAD_CODE as a secret in Supabase Edge Functions.
// The service-role key is used ONLY on the server. Never put it in index.html.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGIN = "https://eirchard.github.io";
const BUCKET = "qr-forever-public-pdfs";
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function cors(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin === ORIGIN ? ORIGIN : ORIGIN,
    "Access-Control-Allow-Headers": "content-type, x-upload-code",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function json(body: object, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}
async function hash(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function sameCode(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (origin && origin !== ORIGIN) return json({ error: "Origin not allowed" }, 403, origin);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const code = Deno.env.get("QR_PDF_UPLOAD_CODE");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!code || !serviceKey || !supabaseUrl)
    return json({ error: "ระบบจัดเก็บ PDF ยังไม่ถูกตั้งค่าบนเซิร์ฟเวอร์" }, 503, origin);
  const suppliedCode = req.headers.get("x-upload-code") ?? "";
  if (!suppliedCode || suppliedCode.length > 256 || !await sameCode(suppliedCode, code))
    return json({ error: "รหัสสิทธิ์อัปโหลดไม่ถูกต้อง" }, 401, origin);
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size && size > MAX_PDF_BYTES + 128_000)
    return json({ error: "ไฟล์ PDF ต้องมีขนาดไม่เกิน 5 MB" }, 413, origin);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "ไม่พบไฟล์ PDF" }, 400, origin);
    if (file.size < 5 || file.size > MAX_PDF_BYTES ||
        !/\.pdf$/i.test(file.name) || !["application/pdf", ""].includes(file.type))
      return json({ error: "กรุณาเลือกไฟล์ PDF ไม่เกิน 5 MB" }, 400, origin);
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") return json({ error: "ข้อมูลไฟล์ไม่ใช่ PDF" }, 400, origin);

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Create the dedicated bucket on first successful authorized upload.
    const bucketCheck = await supabase.storage.getBucket(BUCKET);
    if (bucketCheck.error) {
      const created = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_PDF_BYTES,
        allowedMimeTypes: ["application/pdf"],
      });
      if (created.error && !/already exists/i.test(created.error.message))
        return json({ error: "สร้างพื้นที่จัดเก็บ PDF ไม่สำเร็จ: " + created.error.message }, 503, origin);
    }
    const path = new Date().toISOString().slice(0, 7) + "/" + crypto.randomUUID() + ".pdf";
    const uploaded = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploaded.error) return json({ error: "อัปโหลดไม่สำเร็จ: " + uploaded.error.message }, 500, origin);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return json({ error: "สร้างลิงก์ PDF ไม่สำเร็จ" }, 500, origin);
    return json({ ok: true, url: data.publicUrl, fileName: file.name }, 200, origin);
  } catch (error) {
    console.error("PDF upload failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "เซิร์ฟเวอร์รับไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่" }, 500, origin);
  }
});
