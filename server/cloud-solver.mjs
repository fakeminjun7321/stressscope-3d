import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT || 8787);
const solverMode = process.env.SOLVER_MODE || "mock";

const server = createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "stressscope-cloud-solver",
      mode: solverMode,
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/solve") {
    try {
      const job = await readJson(request);
      const jobId = `ss-${randomUUID()}`;
      sendJson(response, 202, {
        jobId,
        status: solverMode === "real" ? "queued" : "mock-queued",
        mode: solverMode,
        receivedAt: new Date().toISOString(),
        model: job.model?.name || "unknown",
        estimatedElements: job.solver?.estimatedElements || null,
        nextSteps:
          solverMode === "real"
            ? ["cad-repair", "volume-mesh", "static-solve", "result-parse", "report"]
            : ["mock-accept", "install-gmsh-calculix-on-cloud-worker", "switch-SOLVER_MODE-real"],
        note:
          solverMode === "real"
            ? "Job accepted. A production worker should now run Gmsh/CalculiX or Code_Aster."
            : "Mock cloud endpoint is working. Deploy this service with solver binaries for real FEA.",
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid solver job payload",
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`StressScope cloud solver listening on http://localhost:${port}`);
});

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        request.destroy();
        reject(new Error("Payload too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}
