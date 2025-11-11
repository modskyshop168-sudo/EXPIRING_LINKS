/**
 * Worker: Short.io Link Generator (with KV metadata storage for Cron cleanup)
 * Domain: my66.short.gy
 *
 * Required Cloudflare Bindings:
 * 1. KV Namespace: EXPIRING_LINKS
 * 2. Environment Variable (Secret): SHORTIO_SECRET_KEY (Value: sk_YPuRTT4pnbTIwgjU)
 */
export default {
  async fetch(request, env, ctx) {
    // === ⚙️ 配置区 ===
    const SHORTIO_DOMAIN = "my66.short.gy"; 
    const FALLBACK_SECRET_KEY = "sk_YPuRTT4pnbTIwgjU";
    const SHORTIO_SECRET_KEY = env.SHORTIO_SECRET_KEY || FALLBACK_SECRET_KEY;
    // =================

    // ✅ CORS 处理
    if (request.method === "OPTIONS") {
      return new Response("", { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    try {
      if (!SHORTIO_SECRET_KEY) throw new Error("Missing Short.io API Key.");
      if (!env.EXPIRING_LINKS) console.warn("KV Namespace 'EXPIRING_LINKS' is not bound. Auto-cleanup functionality will be disabled.");


      // 📦 读取请求体
      const { longURL, redirect } = await request.json();
      if (!longURL) throw new Error("Missing longURL");


      // === 🧠 智能标题生成和 Exp 时间提取 ===
      let title = "link";
      const now = Date.now();
      const expMatch = longURL.match(/exp=(\d+)/);
      const exp = expMatch ? Number(expMatch[1]) : null;
      const uidMatch = longURL.match(/uid=([^&]+)/);
      const uid = uidMatch ? decodeURIComponent(uidMatch[1]) : null;
      
      // 检查过期时间并生成标题
      if (exp) {
        const PERMANENT_THRESHOLD_MS = 35000 * 24 * 60 * 60 * 1000;
        
        if (exp - now > PERMANENT_THRESHOLD_MS) title = "OTT 永久链接";
        else {
          const diffDays = (exp - now) / (1000 * 60 * 60 * 24);
          if (diffDays > 300) title = "OTT 1年链接";
          else if (diffDays > 25) title = "OTT 1个月链接";
          else title = "OTT 短期链接";
        }
      }

      // 🇲🇾 加入当地时间（UTC+8）
      const localOffset = 8 * 60 * 60 * 1000; 
      const localNow = new Date(Date.now() + localOffset);
      const dateLocal = localNow.toISOString().slice(0, 10);
      
      // 组装最终标题
      if (uid) title += ` (${uid} · ${dateLocal})`;
      else title += ` (${dateLocal})`;

      // === 🔁 生成唯一 ID（id + 4-5位数）===
      let id, shortData;
      for (let i = 0; i < 5; i++) {
        // 'id' + 4-5位数字 (1000 到 90999)
        const randomNumber = Math.floor(1000 + Math.random() * 90000); 
        id = "id" + randomNumber.toString();

        const res = await fetch("https://api.short.io/links", {
          method: "POST",
          headers: {
            Authorization: SHORTIO_SECRET_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            domain: SHORTIO_DOMAIN,
            originalURL: longURL,
            path: id,
            title,
          }),
        });

        const data = await res.json();

        if (res.ok && data.shortURL) {
          shortData = data;
          break;
        }

        // 🔁 若冲突自动重试
        if (data.error && data.error.includes("already exists")) continue;
        else throw new Error(data.error || "Short.io API Error");
      }

      if (!shortData) throw new Error("无法生成短链接，请稍后重试。");

      // === 🔗 存储链接元数据到 KV (定时清理准备) ===
      if (exp && env.EXPIRING_LINKS) { 
          const PERMANENT_THRESHOLD_MS = 35000 * 24 * 60 * 60 * 1000;
          
          if (exp - now < PERMANENT_THRESHOLD_MS) {
              await env.EXPIRING_LINKS.put(id, JSON.stringify({
                  shortURL: shortData.shortURL,
                  exp: exp, 
                  uid: uid, 
                  domain: SHORTIO_DOMAIN
              }));
              console.log(`✅ Link metadata stored: ${id}`);
          }
      }

      // === 📺 redirect 模式 ===
      if (redirect === true || redirect === "1") {
        return Response.redirect(shortData.shortURL, 302);
      }

      // === 默认返回 JSON ===
      return new Response(JSON.stringify({ shortURL: shortData.shortURL }), {
        status: 200,
        headers: corsHeaders(),
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  },
};

// === 🌐 CORS 支持 ===
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}
