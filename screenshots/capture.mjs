import puppeteer from "puppeteer";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "captures");
await mkdir(OUT, { recursive: true });

const BASE = "http://localhost:5173";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

async function capture(name, url, opts = {}) {
  const { width = 1440, height = 900, waitMs = 2000, actions } = opts;
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });

  // Clear sessionStorage before each page to get fresh state
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  if (actions) await actions(page);
  await new Promise(r => setTimeout(r, waitMs));

  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`✓ ${name} (${width}x${height})`);
  await page.close();
  return path;
}

console.log("\n=== Capturing ling-platform screenshots ===\n");

// 1. Landing/Overture — Phase 0 (particles + void)
await capture("01-overture-phase0", BASE, {
  waitMs: 500,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
  }
});

// 2. Landing/Overture — Phase 1 (silhouette)
await capture("02-overture-phase1-silhouette", BASE, {
  waitMs: 2000,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
  }
});

// 3. Landing/Overture — Phase 4 (statement + CTA)
await capture("03-overture-phase4-cta", BASE, {
  waitMs: 5500,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
  }
});

// 4. Witness Mode (after overture, unauthenticated)
await capture("04-witness-mode", BASE, {
  waitMs: 7000,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
  }
});

// 5. Witness Mode — OAuth Modal open
await capture("05-oauth-modal", BASE, {
  waitMs: 7500,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
    // Wait for CTA to appear then click it
    await new Promise(r => setTimeout(r, 7000));
    try {
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const btn of btns) {
          if (btn.textContent?.includes("Talk to Ling")) {
            btn.click();
            break;
          }
        }
      });
    } catch(e) { console.log("  (could not click CTA)"); }
  }
});

// 6. Auth Page (/auth)
await capture("06-auth-page", `${BASE}/auth`, { waitMs: 1500 });

// 7. Witness Mode — Mobile (iPhone 14 Pro)
await capture("07-witness-mobile", BASE, {
  width: 393,
  height: 852,
  waitMs: 7000,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
  }
});

// 8. Overture — Mobile Phase 4
await capture("08-overture-mobile-cta", BASE, {
  width: 393,
  height: 852,
  waitMs: 5500,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.removeItem("ling-overture-seen"));
  }
});

// 9. Console Mode — skip overture, simulate authenticated view
// (This will show whatever the app shows when overture is skipped and no auth)
await capture("09-console-skip-overture", BASE, {
  waitMs: 2000,
  actions: async (page) => {
    await page.evaluate(() => sessionStorage.setItem("ling-overture-seen", "true"));
    await page.reload({ waitUntil: "networkidle2" });
  }
});

// 10. Auth page — Mobile
await capture("10-auth-mobile", `${BASE}/auth`, {
  width: 393,
  height: 852,
  waitMs: 1500,
});

console.log("\n=== All screenshots captured! ===\n");
await browser.close();
