"""
System Status Page — reuses database connections from main.py.
Visit http://localhost:8000/status
"""

import asyncio
import time

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


async def check_fastapi() -> dict:
    return {"name": "FastAPI Backend", "status": "up", "port": 8000, "detail": "Serving requests"}


async def check_neo4j() -> dict:
    from main import neo4j_driver

    try:
        neo4j_driver.verify_connectivity()
        return {
            "name": "Neo4j Graph DB",
            "status": "up",
            "port": 7687,
            "detail": "Bolt connection active",
        }
    except Exception as e:
        return {
            "name": "Neo4j Graph DB",
            "status": "down",
            "port": 7687,
            "detail": str(e).split("\n")[0][:80],
        }


async def check_postgres() -> dict:
    from main import pg_pool

    try:
        async with pg_pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
        short_ver = version.split(",")[0] if version else "Connected"
        return {"name": "PostgreSQL", "status": "up", "port": 5432, "detail": short_ver}
    except Exception as e:
        return {
            "name": "PostgreSQL",
            "status": "down",
            "port": 5432,
            "detail": str(e).split("\n")[0][:80],
        }


async def check_frontend() -> dict:
    for host in ["frontend", "localhost"]:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"http://{host}:3000")
                if r.status_code in (200, 304):
                    return {
                        "name": "Next.js Frontend",
                        "status": "up",
                        "port": 3000,
                        "detail": "Dev server running",
                    }
        except Exception:
            continue
    return {
        "name": "Next.js Frontend",
        "status": "down",
        "port": 3000,
        "detail": "Not started (Sprint 2)",
    }


@router.get("/status/health", summary="JSON health check for status page")
async def status_health():
    start = time.time()
    results = await asyncio.gather(
        check_fastapi(),
        check_neo4j(),
        check_postgres(),
        check_frontend(),
        return_exceptions=True,
    )
    services = []
    for r in results:
        if isinstance(r, Exception):
            services.append({"name": "Unknown", "status": "down", "port": 0, "detail": str(r)[:80]})
        else:
            services.append(r)
    elapsed = round((time.time() - start) * 1000)
    all_up = all(s["status"] == "up" for s in services)
    return {
        "status": "healthy" if all_up else "degraded",
        "services": services,
        "check_ms": elapsed,
    }


@router.get("/status", response_class=HTMLResponse, summary="System status page")
async def status_page():
    return HTML_PAGE


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>System Status</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 48px 24px; }
  .wrap { max-width: 680px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 48px; }
  .header h1 { font-size: 44px; font-weight: 800; color: #fff; letter-spacing: -1px; }
  .header p { font-size: 14px; color: #94a3b8; margin-top: 8px; }
  .header .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
  .section-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .services { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 40px; }
  .card { background: #1e293b; border-radius: 10px; padding: 16px 20px; border: 1px solid #334155; transition: border-color 0.3s; }
  .card.up { border-color: #22c55e33; }
  .card.down { border-color: #ef444433; }
  .card.checking { border-color: #f59e0b33; }
  .card-top { display: flex; justify-content: space-between; align-items: center; }
  .card-left { display: flex; align-items: center; gap: 10px; }
  .card-name { font-size: 14px; font-weight: 600; }
  .card-desc { font-size: 11px; color: #94a3b8; }
  .card-status { display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot.up { background: #22c55e; box-shadow: 0 0 8px #22c55e88; animation: pulse 2s infinite; }
  .dot.down { background: #ef4444; box-shadow: 0 0 8px #ef444488; }
  .dot.checking { background: #f59e0b; box-shadow: 0 0 8px #f59e0b88; animation: pulse 1s infinite; }
  .status-text { font-size: 11px; font-weight: 600; }
  .status-text.up { color: #22c55e; }
  .status-text.down { color: #ef4444; }
  .status-text.checking { color: #f59e0b; }
  .card-detail { font-size: 11px; color: #64748b; margin-top: 8px; font-family: 'Cascadia Code', 'Fira Code', monospace; word-break: break-all; }
  .tags { background: #1e293b; border-radius: 10px; padding: 20px 24px; border: 1px solid #334155; margin-bottom: 40px; display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; background: #334155; color: #cbd5e1; }
  .team { background: #1e293b; border-radius: 10px; border: 1px solid #334155; overflow: hidden; margin-bottom: 40px; }
  .team-row { padding: 12px 24px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
  .team-row:last-child { border-bottom: none; }
  .team-name { font-size: 13px; font-weight: 500; }
  .team-role { font-size: 12px; color: #94a3b8; }
  .footer { text-align: center; font-size: 12px; color: #475569; }
  .refresh-bar { text-align: center; margin-bottom: 32px; font-size: 12px; color: #475569; }
  .refresh-bar span { color: #94a3b8; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>System Status</h1>
    <p>AI-Enabled SoW Automation &middot; Microsoft Consulting Services</p>
    <div class="sub">Sprint 1 &middot; Feb 3&ndash;10, 2026 &middot; Baylor University Capstone</div>
  </div>

  <div class="refresh-bar">Auto-refreshing every 5s &middot; Last check: <span id="last-check">...</span></div>

  <div class="section-label">Docker Services</div>
  <div class="services" id="services"></div>

  <div class="section-label">Tech Stack</div>
  <div class="tags" id="tags"></div>

  <div class="section-label">Team</div>
  <div class="team" id="team"></div>

  <div class="footer">
    Industry Mentor: Shyam (Microsoft AI Architect) &middot; Faculty: Professor Kirk Carver
  </div>
</div>

<script>
const DESCS = { "FastAPI Backend": "Python REST API", "Neo4j Graph DB": "Knowledge graph / GraphRAG", "PostgreSQL": "Relational SoW data", "Next.js Frontend": "Web UI" };
const TECH = ["Python","FastAPI","Neo4j","PostgreSQL","Docker","Next.js","Azure","GitHub Actions","GraphRAG","Jira"];
const TEAM = [
  ["Samuel Fries","Product Owner / Tech Lead"],
  ["Zhan Su","Infrastructure / QA Engineer"],
  ["Eugene Pak","DevOps / Security"],
  ["Nate Dorsey","Scrum Master / AI-ML"],
  ["Jayden Ferguson","AI-ML / Data Engineer"],
  ["Phuong Thai","AI-ML / Data"],
];

document.getElementById("tags").innerHTML = TECH.map(t => `<span class="tag">${t}</span>`).join("");
document.getElementById("team").innerHTML = TEAM.map(([n,r]) =>
  `<div class="team-row"><span class="team-name">${n}</span><span class="team-role">${r}</span></div>`
).join("");

function renderServices(services) {
  document.getElementById("services").innerHTML = services.map(s => {
    const desc = DESCS[s.name] || "";
    const st = s.status;
    const label = st === "up" ? "Running" : st === "checking" ? "Checking..." : "Offline";
    return `<div class="card ${st}">
      <div class="card-top">
        <div class="card-left">
          <div><div class="card-name">${s.name}</div><div class="card-desc">${desc}</div></div>
        </div>
        <div class="card-status">
          <div class="dot ${st}"></div>
          <span class="status-text ${st}">${label}</span>
        </div>
      </div>
      <div class="card-detail">${st === "up" ? "localhost:" + s.port + " - " + s.detail : s.detail || "Service unreachable"}</div>
    </div>`;
  }).join("");
}

const defaultServices = [
  { name: "FastAPI Backend", status: "checking", port: 8000, detail: "" },
  { name: "Neo4j Graph DB", status: "checking", port: 7687, detail: "" },
  { name: "PostgreSQL", status: "checking", port: 5432, detail: "" },
  { name: "Next.js Frontend", status: "checking", port: 3000, detail: "" },
];
renderServices(defaultServices);

async function refresh() {
  try {
    const r = await fetch("/status/health");
    const data = await r.json();
    renderServices(data.services);
    document.getElementById("last-check").textContent = new Date().toLocaleTimeString() + ` (${data.check_ms}ms)`;
  } catch (e) {
    renderServices(defaultServices.map(s => ({ ...s, status: "down", detail: "Cannot reach /status/health" })));
    document.getElementById("last-check").textContent = "Failed - " + new Date().toLocaleTimeString();
  }
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>"""
