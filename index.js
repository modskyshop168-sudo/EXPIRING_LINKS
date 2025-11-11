// [确保这段代码是您 index.js 文件的全部内容]
export default {
    
    async scheduled(controller, env, ctx) {
        // === ⚙️ 配置区 (硬编码 API Key) ===
        const SHORTIO_SECRET_KEY = "sk_YPuRTT4pnbTIwgjU";
        // ===================================
        
        ctx.waitUntil(this.handleCleanup(env, SHORTIO_SECRET_KEY));
    },

    async handleCleanup(env, shortioSecretKey) {
        
        // 1. 检查必要条件
        if (!env.EXPIRING_LINKS) {
            console.error("Cleanup aborted: KV Namespace 'EXPIRING_LINKS' is not bound.");
            return;
        }
        if (!shortioSecretKey) {
            console.error("Cleanup aborted: Short.io API Key is missing.");
            return;
        }

        // 2. 获取当前时间 (UTC+8)
        const localOffset = 8 * 60 * 60 * 1000; 
        const nowLocal = Date.now() + localOffset;

        console.log(`Starting scheduled cleanup job. Current time (UTC+8): ${new Date(nowLocal).toISOString()}`);
        
        // 3. 逐页获取 KV 中的所有链接元数据
        let cursor = null;
        let linksToDelete = [];
        let deletedCount = 0;
        
        try { // 添加 try-catch 确保 KV 列表操作的健壮性
            do {
                const listOptions = {
                    limit: 100,
                    cursor: cursor
                };
                const list = await env.EXPIRING_LINKS.list(listOptions);
                
                for (const key of list.keys) {
                    const linkData = await env.EXPIRING_LINKS.get(key.name, "json");
                    
                    if (linkData && linkData.exp) {
                        if (linkData.exp < nowLocal) {
                            linksToDelete.push({ 
                                path: key.name,
                                shortURL: linkData.shortURL,
                                uid: linkData.uid 
                            });
                        }
                    } else {
                        await env.EXPIRING_LINKS.delete(key.name);
                    }
                }

                cursor = list.cursor;
            } while (list.list_complete === false);
        } catch (e) {
            console.error("Error during KV listing/reading:", e);
            // 如果 KV 操作失败，停止删除任务
            linksToDelete = []; 
        }

        console.log(`Found ${linksToDelete.length} links to process.`);

        // 4. 处理删除任务
        const deletionPromises = linksToDelete.map(async (link) => {
            const shortioDeleteURL = `https://api.short.io/links/${link.shortURL}`;

            try {
                const res = await fetch(shortioDeleteURL, {
                    method: "DELETE",
                    headers: {
                        Authorization: shortioSecretKey,
                    }
                });

                if (res.ok || res.status === 204 || res.status === 404) {
                    await env.EXPIRING_LINKS.delete(link.path);
                    deletedCount++;
                    console.log(`✅ Success: Deleted link ${link.shortURL}`);
                } else {
                    const errorText = await res.text();
                    console.error(`❌ Failed to delete link ${link.shortURL}. Status: ${res.status}. Error: ${errorText}`);
                }
            } catch (e) {
                console.error(`❌ Network/API Error for ${link.shortURL}:`, e.message);
            }
        });

        await Promise.all(deletionPromises);
        
        console.log(`Cleanup job completed. Total links deleted: ${deletedCount}`);
    }
};
        const localOffset = 8 * 60 * 60 * 1000; 
        const nowLocal = Date.now() + localOffset;

        console.log(`Starting scheduled cleanup job. Current time (UTC+8): ${new Date(nowLocal).toISOString()}`);
        
        // 3. 逐页获取 KV 中的所有链接元数据 (支持大量链接)
        let cursor = null;
        let linksToDelete = [];
        let deletedCount = 0;
        
        do {
            const listOptions = {
                limit: 100,
                cursor: cursor
            };
            const list = await env.EXPIRING_LINKS.list(listOptions);
            
            for (const key of list.keys) {
                const linkData = await env.EXPIRING_LINKS.get(key.name, "json");
                
                if (linkData && linkData.exp) {
                    // 如果链接的过期时间戳小于当前时间 (已过期)
                    if (linkData.exp < nowLocal) {
                        linksToDelete.push({ 
                            path: key.name,     // 短链接路径，如 "id12345"
                            shortURL: linkData.shortURL, // 完整的短链接，用于 Short.io API
                            uid: linkData.uid 
                        });
                    }
                } else {
                    // 如果 KV 记录格式损坏，将其从 KV 删除
                    await env.EXPIRING_LINKS.delete(key.name);
                }
            }

            cursor = list.cursor;
        } while (list.list_complete === false);

        console.log(`Found ${linksToDelete.length} links to process.`);

        // 4. 处理删除任务
        const deletionPromises = linksToDelete.map(async (link) => {
            
            // Short.io API 删除链接需要完整的短链接 URL
            const shortioDeleteURL = `https://api.short.io/links/${link.shortURL}`;

            try {
                const res = await fetch(shortioDeleteURL, {
                    method: "DELETE",
                    headers: {
                        Authorization: shortioSecretKey,
                    }
                });

                // Short.io 删除成功是 204 (No Content) 或 404 (Not Found，也视为成功清理)
                if (res.ok || res.status === 204 || res.status === 404) {
                    // 从 KV 中删除记录
                    await env.EXPIRING_LINKS.delete(link.path);
                    deletedCount++;
                    console.log(`✅ Success: Deleted link ${link.shortURL} (UID: ${link.uid || 'N/A'})`);
                } else {
                    const errorText = await res.text();
                    console.error(`❌ Failed to delete link ${link.shortURL}. Status: ${res.status}. Error: ${errorText}`);
                }
            } catch (e) {
                console.error(`❌ Network/API Error for ${link.shortURL}:`, e.message);
            }
        });

        // 等待所有删除任务完成
        await Promise.all(deletionPromises);
        
        console.log(`Cleanup job completed. Total links deleted: ${deletedCount}`);
    }
};


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
