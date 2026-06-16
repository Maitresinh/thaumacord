import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { app, resetRuntimeState } from "./index.js";

type JsonObject = Record<string, any>;

async function injectJson(method: "GET" | "POST", url: string, payload?: unknown): Promise<JsonObject> {
  const response = await app.inject({
    method,
    url,
    payload
  } as any);
  assert.equal(response.statusCode < 500, true, response.body);
  return response.json<JsonObject>();
}

async function createSession(moduleId = "wolfpack-lite"): Promise<JsonObject> {
  return injectJson("POST", "/sessions", { moduleId });
}

async function createDevice(code: string, name: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/devices`, { name });
}

async function createParticipant(code: string, name: string, roleId = "sonar"): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/participants`, {
    kind: "station",
    name,
    roleId
  });
}

async function bindDevice(code: string, deviceId: string, participantId: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/devices/${deviceId}/bind`, { participantId });
}

function collectLiveMessages(url: string, expectedCount = 2): Promise<{ socket: WebSocket; messages: JsonObject[] }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages: JsonObject[] = [];
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for ${expectedCount} live messages from ${url}`));
    }, 2500);

    socket.addEventListener("message", (event) => {
      messages.push(JSON.parse(event.data.toString()));
      if (messages.length === expectedCount) {
        clearTimeout(timeout);
        resolve({ socket, messages });
      }
    });
    socket.addEventListener("error", reject);
  });
}

before(async () => {
  await app.ready();
});

beforeEach(() => {
  resetRuntimeState();
});

after(async () => {
  await app.close();
});

test("registers devices, creates participants, and binds one device to one participant", async () => {
  const session = await createSession();
  const code = session.code;
  const deviceResult = await createDevice(code, "Telephone sonar");
  const participantResult = await createParticipant(code, "Station sonar");

  const bindResult = await bindDevice(code, deviceResult.device.id, participantResult.participant.id);
  const boundDevice = bindResult.devices.find((device: JsonObject) => device.id === deviceResult.device.id);
  const boundParticipant = bindResult.participants.find((participant: JsonObject) => participant.id === participantResult.participant.id);

  assert.equal(boundDevice.participantId, participantResult.participant.id);
  assert.equal(boundParticipant.id, participantResult.participant.id);
});

test("returns a dashboard read model with the complete live state", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  await createDevice(code, "Table principale");

  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);

  assert.equal(dashboard.readModel, "dashboard");
  assert.equal(dashboard.code, code);
  assert.equal(dashboard.devices.length, 1);
  assert.equal(Array.isArray(dashboard.audit), true);
});

test("filters device read models for unbound and bound devices", async () => {
  const session = await createSession();
  const code = session.code;
  const boundDevice = await createDevice(code, "Telephone sonar");
  const unboundDevice = await createDevice(code, "Telephone reserve");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, boundDevice.device.id, participant.participant.id);

  const unboundModel = await injectJson("GET", `/sessions/${code}/read-models/device/${unboundDevice.device.id}`);
  const boundModel = await injectJson("GET", `/sessions/${code}/read-models/device/${boundDevice.device.id}`);

  assert.equal(unboundModel.readModel, "device.unbound");
  assert.equal(unboundModel.audit, undefined);
  assert.equal(unboundModel.devices.length, 2);
  assert.equal(boundModel.readModel, "device.participant");
  assert.equal(boundModel.participant.name, "Station sonar");
  assert.equal(Array.isArray(boundModel.recentAudit), true);
});

test("rejects structured events from unknown devices or participants", async () => {
  const session = await createSession();
  const code = session.code;

  const unknownDevice = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: { type: "sonar.ping", sourceDeviceId: "missing-device" }
  });
  assert.equal(unknownDevice.statusCode, 400);
  assert.equal(unknownDevice.json<JsonObject>().error, "Unknown source device");

  const device = await createDevice(code, "Telephone sonar");
  const unknownParticipant = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: { type: "sonar.ping", sourceDeviceId: device.device.id, participantId: "missing-participant" }
  });
  assert.equal(unknownParticipant.statusCode, 400);
  assert.equal(unknownParticipant.json<JsonObject>().error, "Unknown participant");
});

test("broadcasts live updates with read models filtered per audience", async () => {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const session = await createSession();
  const code = session.code;
  const boundDevice = await createDevice(code, "Telephone sonar");
  const unboundDevice = await createDevice(code, "Telephone reserve");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, boundDevice.device.id, participant.participant.id);

  const dashboardLive = collectLiveMessages(`${address}/sessions/${code}/live?dashboard=true`);
  const unboundLive = collectLiveMessages(`${address}/sessions/${code}/live?deviceId=${unboundDevice.device.id}`);
  const boundLive = collectLiveMessages(`${address}/sessions/${code}/live?deviceId=${boundDevice.device.id}`);

  await new Promise((resolve) => setTimeout(resolve, 150));
  const eventResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "sonar.ping",
      sourceDeviceId: boundDevice.device.id,
      participantId: participant.participant.id,
      payload: { bearing: 47 }
    }
  });
  assert.equal(eventResponse.statusCode, 202);

  const [dashboard, unbound, bound] = await Promise.all([dashboardLive, unboundLive, boundLive]);
  dashboard.socket.close();
  unbound.socket.close();
  bound.socket.close();

  assert.deepEqual(
    dashboard.messages.map((message) => message.readModel.readModel),
    ["dashboard", "dashboard"]
  );
  assert.deepEqual(
    unbound.messages.map((message) => message.readModel.readModel),
    ["device.unbound", "device.unbound"]
  );
  assert.deepEqual(
    bound.messages.map((message) => message.readModel.readModel),
    ["device.participant", "device.participant"]
  );
});
