import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { app, resetRuntimeState } from "./index.js";

type JsonObject = Record<string, any>;
let liveAddress = "";

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

async function heartbeatDevice(code: string, deviceId: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/devices/${deviceId}/heartbeat`, {});
}

async function disconnectDevice(code: string, deviceId: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/devices/${deviceId}/disconnect`, {});
}

async function setResource(code: string, participantId: string, resourceId: string, value: number): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/players/${participantId}/resources`, { resourceId, value });
}

async function advancePhase(code: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/phases/advance`, {});
}

async function enterZone(code: string, zoneId: string, participantId: string, sourceDeviceId?: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/zones/${zoneId}/presence`, {
    participantId,
    sourceDeviceId
  });
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
  liveAddress = await app.listen({ port: 0, host: "127.0.0.1" });
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

test("assigns monotonic audit sequence numbers within a session", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, device.device.id, participant.participant.id);
  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);

  assert.deepEqual(
    dashboard.audit.map((entry: JsonObject) => entry.sequence),
    [1, 2, 3, 4]
  );
  assert.equal(dashboard.audit[0].id, `${code}-1`);
});

test("returns audit catch-up entries after a client sequence", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, device.device.id, participant.participant.id);

  const firstPage = await injectJson("GET", `/sessions/${code}/audit?after=1&limit=2`);
  assert.equal(firstPage.after, 1);
  assert.equal(firstPage.limit, 2);
  assert.equal(firstPage.latestSequence, 4);
  assert.equal(firstPage.hasMore, true);
  assert.deepEqual(
    firstPage.entries.map((entry: JsonObject) => entry.sequence),
    [2, 3]
  );

  const secondPage = await injectJson("GET", `/sessions/${code}/audit?after=3`);
  assert.equal(secondPage.hasMore, false);
  assert.deepEqual(
    secondPage.entries.map((entry: JsonObject) => entry.sequence),
    [4]
  );
});

test("returns device sync package with filtered read model and audit catch-up", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const reserve = await createDevice(code, "Telephone reserve");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, device.device.id, participant.participant.id);

  const boundSync = await injectJson("GET", `/sessions/${code}/devices/${device.device.id}/sync?after=2&limit=10`);
  assert.equal(boundSync.readModel.readModel, "device.participant");
  assert.equal(boundSync.readModel.participant.id, participant.participant.id);
  assert.equal(boundSync.audit.latestSequence, 5);
  assert.deepEqual(
    boundSync.audit.entries.map((entry: JsonObject) => entry.sequence),
    [3, 4, 5]
  );

  const unboundSync = await injectJson("GET", `/sessions/${code}/devices/${reserve.device.id}/sync?after=5`);
  assert.equal(unboundSync.readModel.readModel, "device.unbound");
  assert.deepEqual(unboundSync.audit.entries, []);
});

test("returns structured validation errors for malformed mobile payloads", async () => {
  const session = await createSession();
  const code = session.code;

  const missingDeviceName = await app.inject({
    method: "POST",
    url: `/sessions/${code}/devices`,
    payload: {}
  });
  assert.equal(missingDeviceName.statusCode, 400);
  assert.equal(missingDeviceName.json<JsonObject>().error, "Validation failed");
  assert.equal(missingDeviceName.json<JsonObject>().issues[0].path, "name");

  const invalidEventPayload = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: { type: "gesture.detected", payload: "phone-face-down" }
  });
  assert.equal(invalidEventPayload.statusCode, 400);
  assert.equal(invalidEventPayload.json<JsonObject>().error, "Validation failed");
  assert.equal(invalidEventPayload.json<JsonObject>().issues[0].path, "payload");

  const participant = await createParticipant(code, "Station sonar");
  const invalidResourceValue = await app.inject({
    method: "POST",
    url: `/sessions/${code}/players/${participant.participant.id}/resources`,
    payload: { resourceId: "battery", value: "full" }
  });
  assert.equal(invalidResourceValue.statusCode, 400);
  assert.equal(invalidResourceValue.json<JsonObject>().error, "Validation failed");
  assert.equal(invalidResourceValue.json<JsonObject>().issues[0].path, "value");

  const invalidAuditQuery = await app.inject({
    method: "GET",
    url: `/sessions/${code}/audit?after=-1`
  });
  assert.equal(invalidAuditQuery.statusCode, 400);
  assert.equal(invalidAuditQuery.json<JsonObject>().error, "Validation failed");
  assert.equal(invalidAuditQuery.json<JsonObject>().issues[0].path, "after");

  const missingSyncDevice = await app.inject({
    method: "GET",
    url: `/sessions/${code}/devices/missing-device/sync`
  });
  assert.equal(missingSyncDevice.statusCode, 404);
  assert.equal(missingSyncDevice.json<JsonObject>().error, "Device not found");
});

test("tracks device heartbeat and disconnection state", async () => {
  const session = await createSession();
  const code = session.code;
  const deviceResult = await createDevice(code, "Telephone sonar");

  const disconnect = await disconnectDevice(code, deviceResult.device.id);
  const disconnectedDevice = disconnect.dashboard.devices.find((device: JsonObject) => device.id === deviceResult.device.id);
  assert.equal(disconnectedDevice.connected, false);
  assert.equal(disconnect.disconnect.connected, false);

  const heartbeat = await heartbeatDevice(code, deviceResult.device.id);
  const connectedDevice = heartbeat.readModel.devices.find((device: JsonObject) => device.id === deviceResult.device.id);
  assert.equal(connectedDevice.connected, true);
  assert.equal(heartbeat.heartbeat.connected, true);
  assert.equal(heartbeat.heartbeat.wasConnected, false);
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
  assert.equal(Array.isArray(boundModel.availableActions), true);
  assert.equal(Array.isArray(boundModel.recentAudit), true);
});

test("broadcasts device heartbeat updates to live audiences", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");

  const dashboardLive = collectLiveMessages(`${liveAddress}/sessions/${code}/live?dashboard=true`);
  const deviceLive = collectLiveMessages(`${liveAddress}/sessions/${code}/live?deviceId=${device.device.id}`);
  await new Promise((resolve) => setTimeout(resolve, 150));

  await disconnectDevice(code, device.device.id);

  const [dashboard, deviceAudience] = await Promise.all([dashboardLive, deviceLive]);
  dashboard.socket.close();
  deviceAudience.socket.close();

  assert.deepEqual(
    dashboard.messages.map((message) => message.readModel.readModel),
    ["dashboard", "dashboard"]
  );
  assert.deepEqual(
    deviceAudience.messages.map((message) => message.readModel.readModel),
    ["device.unbound", "device.unbound"]
  );
  assert.equal(dashboard.messages.at(-1)?.payload.sequence, 3);
  assert.equal(dashboard.messages.at(-1)?.payload.payload.connected, false);
  assert.equal(deviceAudience.messages.at(-1)?.payload.payload.connected, false);
});

test("exposes participant actions with availability reasons", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);

  const briefingModel = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  const quietInBriefing = briefingModel.availableActions.find((action: JsonObject) => action.id === "quiet-engines");
  assert.equal(quietInBriefing.available, false);
  assert.deepEqual(quietInBriefing.blockedBy, ["phase", "resource:battery"]);

  await setResource(code, participant.participant.id, "battery", 1);
  await advancePhase(code);
  const runningModel = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  const quietRunning = runningModel.availableActions.find((action: JsonObject) => action.id === "quiet-engines");
  const sonarSweep = runningModel.availableActions.find((action: JsonObject) => action.id === "sonar-sweep");

  assert.equal(quietRunning.available, true);
  assert.deepEqual(quietRunning.blockedBy, []);
  assert.equal(quietRunning.gesture, "phone-face-down");
  assert.equal(sonarSweep.available, false);
  assert.equal(sonarSweep.blockedBy.includes("role"), true);
});

test("maps participant presence to imaginary zones and applies zone effects", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, device.device.id, participant.participant.id);

  const zoneResponse = await enterZone(code, "convoy-route", participant.participant.id, device.device.id);

  const movedParticipant = zoneResponse.dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id);
  assert.equal(zoneResponse.accepted, true);
  assert.equal(movedParticipant.locationId, "convoy-route");
  assert.equal(zoneResponse.dashboard.unlockedPhases.includes("contact"), true);
  assert.equal(zoneResponse.dashboard.risks["escort-detection"], 1);
  assert.equal(zoneResponse.zoneResult.effects.length, 2);
});

test("infers participant from a bound device for zone presence", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, device.device.id, participant.participant.id);

  const zoneResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/zones/open-sea/presence`,
    payload: { sourceDeviceId: device.device.id }
  });

  assert.equal(zoneResponse.statusCode, 202);
  const body = zoneResponse.json<JsonObject>();
  assert.equal(body.zoneResult.participantId, participant.participant.id);
  assert.equal(body.dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id).locationId, "open-sea");
});

test("rejects invalid zone presence updates", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const participant = await createParticipant(code, "Station sonar");

  const unknownZone = await app.inject({
    method: "POST",
    url: `/sessions/${code}/zones/missing-zone/presence`,
    payload: { participantId: participant.participant.id, sourceDeviceId: device.device.id }
  });
  assert.equal(unknownZone.statusCode, 400);
  assert.match(unknownZone.json<JsonObject>().error, /Unknown zone/);

  const unknownParticipant = await app.inject({
    method: "POST",
    url: `/sessions/${code}/zones/convoy-route/presence`,
    payload: { participantId: "missing-participant", sourceDeviceId: device.device.id }
  });
  assert.equal(unknownParticipant.statusCode, 400);
  assert.equal(unknownParticipant.json<JsonObject>().error, "Unknown participant");

  const unknownDevice = await app.inject({
    method: "POST",
    url: `/sessions/${code}/zones/convoy-route/presence`,
    payload: { participantId: participant.participant.id, sourceDeviceId: "missing-device" }
  });
  assert.equal(unknownDevice.statusCode, 400);
  assert.equal(unknownDevice.json<JsonObject>().error, "Unknown source device");

  const unboundDevice = await createDevice(code, "Telephone reserve");
  const missingParticipant = await app.inject({
    method: "POST",
    url: `/sessions/${code}/zones/convoy-route/presence`,
    payload: { sourceDeviceId: unboundDevice.device.id }
  });
  assert.equal(missingParticipant.statusCode, 400);
  assert.equal(missingParticipant.json<JsonObject>().error, "Participant required");
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

test("applies configured action costs and resource effects", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);
  await setResource(code, participant.participant.id, "battery", 2);
  await setResource(code, participant.participant.id, "noise", 4);
  await advancePhase(code);

  const actionResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.perform",
      actionId: "quiet-engines",
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id
    }
  });

  assert.equal(actionResponse.statusCode, 202);
  const body = actionResponse.json<JsonObject>();
  const updatedParticipant = body.dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id);
  assert.equal(updatedParticipant.resources.battery, 1);
  assert.equal(updatedParticipant.resources.noise, 2);
  assert.equal(body.actionResult.effect.type, "adjustResource");
});

test("infers participant from a bound device for action events", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);
  await setResource(code, participant.participant.id, "battery", 2);
  await setResource(code, participant.participant.id, "noise", 4);
  await advancePhase(code);

  const actionResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.perform",
      actionId: "quiet-engines",
      sourceDeviceId: device.device.id
    }
  });

  assert.equal(actionResponse.statusCode, 202);
  const body = actionResponse.json<JsonObject>();
  assert.equal(body.actionResult.participantId, participant.participant.id);
  assert.equal(body.audit.payload.participantId, participant.participant.id);
});

test("applies configured action state effects from payload", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone pilote");
  const participant = await createParticipant(code, "Pilote", "helmsman");
  await bindDevice(code, device.device.id, participant.participant.id);
  await setResource(code, participant.participant.id, "battery", 2);
  await advancePhase(code);

  const actionResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.perform",
      actionId: "change-depth",
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id,
      payload: { value: "periscope-depth" }
    }
  });

  assert.equal(actionResponse.statusCode, 202);
  const body = actionResponse.json<JsonObject>();
  const updatedParticipant = body.dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id);
  assert.equal(updatedParticipant.resources.battery, 1);
  assert.equal(updatedParticipant.statuses.depth, "periscope-depth");
});

test("resolves available gestures to module actions", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);
  await setResource(code, participant.participant.id, "battery", 2);
  await setResource(code, participant.participant.id, "noise", 4);
  await advancePhase(code);

  const actionResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "gesture.detected",
      gesture: "phone-face-down",
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id
    }
  });

  assert.equal(actionResponse.statusCode, 202);
  const body = actionResponse.json<JsonObject>();
  const updatedParticipant = body.dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id);
  assert.equal(body.actionResult.actionId, "quiet-engines");
  assert.equal(body.actionResult.gesture, "phone-face-down");
  assert.equal(updatedParticipant.resources.battery, 1);
  assert.equal(updatedParticipant.resources.noise, 2);
});

test("infers participant from a bound device for gesture events", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);
  await setResource(code, participant.participant.id, "battery", 2);
  await setResource(code, participant.participant.id, "noise", 4);
  await advancePhase(code);

  const actionResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "gesture.detected",
      gesture: "phone-face-down",
      sourceDeviceId: device.device.id
    }
  });

  assert.equal(actionResponse.statusCode, 202);
  const body = actionResponse.json<JsonObject>();
  assert.equal(body.actionResult.actionId, "quiet-engines");
  assert.equal(body.actionResult.participantId, participant.participant.id);
});

test("rejects gestures when no matching action is currently available", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);

  const blockedGesture = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "gesture.detected",
      payload: { gesture: "phone-face-down" },
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id
    }
  });

  assert.equal(blockedGesture.statusCode, 400);
  assert.match(blockedGesture.json<JsonObject>().error, /no available action/);

  const unknownGesture = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "gesture.detected",
      gesture: "pour-liquid",
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id
    }
  });

  assert.equal(unknownGesture.statusCode, 400);
  assert.match(unknownGesture.json<JsonObject>().error, /Unknown gesture/);
});

test("rejects configured actions when role, phase, or resources do not allow them", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone sonar");
  const participant = await createParticipant(code, "Station sonar", "sonar");
  await bindDevice(code, device.device.id, participant.participant.id);

  const wrongPhase = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.perform",
      actionId: "sonar-sweep",
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id
    }
  });
  assert.equal(wrongPhase.statusCode, 400);
  assert.match(wrongPhase.json<JsonObject>().error, /current phase/);

  await advancePhase(code);
  await advancePhase(code);
  const noBattery = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.perform",
      actionId: "sonar-sweep",
      sourceDeviceId: device.device.id,
      participantId: participant.participant.id
    }
  });
  assert.equal(noBattery.statusCode, 400);
  assert.match(noBattery.json<JsonObject>().error, /outside bounds/);

  const captain = await createParticipant(code, "Capitaine", "captain");
  const wrongRole = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.perform",
      actionId: "sonar-sweep",
      sourceDeviceId: device.device.id,
      participantId: captain.participant.id
    }
  });
  assert.equal(wrongRole.statusCode, 400);
  assert.match(wrongRole.json<JsonObject>().error, /not allowed for participant role/);
});

test("broadcasts live updates with read models filtered per audience", async () => {
  const session = await createSession();
  const code = session.code;
  const boundDevice = await createDevice(code, "Telephone sonar");
  const unboundDevice = await createDevice(code, "Telephone reserve");
  const participant = await createParticipant(code, "Station sonar");
  await bindDevice(code, boundDevice.device.id, participant.participant.id);

  const dashboardLive = collectLiveMessages(`${liveAddress}/sessions/${code}/live?dashboard=true`);
  const unboundLive = collectLiveMessages(`${liveAddress}/sessions/${code}/live?deviceId=${unboundDevice.device.id}`);
  const boundLive = collectLiveMessages(`${liveAddress}/sessions/${code}/live?deviceId=${boundDevice.device.id}`);

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
  assert.equal(dashboard.messages.at(-1)?.payload.sequence, 6);
  assert.deepEqual(
    unbound.messages.map((message) => message.readModel.readModel),
    ["device.unbound", "device.unbound"]
  );
  assert.deepEqual(
    bound.messages.map((message) => message.readModel.readModel),
    ["device.participant", "device.participant"]
  );
});
