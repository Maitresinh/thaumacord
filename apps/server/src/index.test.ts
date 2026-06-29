import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { app, flushSessionPersistence, loadPersistedSessions, resetRuntimeState } from "./app.js";

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

async function setPhaseTimer(code: string, payload: JsonObject): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/phases/timer`, payload);
}

async function enterZone(code: string, zoneId: string, participantId: string, sourceDeviceId?: string): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/zones/${zoneId}/presence`, {
    participantId,
    sourceDeviceId
  });
}

async function createExchange(code: string, payload: JsonObject): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/exchanges`, payload);
}

async function drawComponent(code: string, payload: JsonObject): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/components/draw`, payload);
}

async function sendMessage(code: string, payload: JsonObject): Promise<JsonObject> {
  return injectJson("POST", `/sessions/${code}/messages`, payload);
}

async function assignGameAuthority(code: string): Promise<JsonObject> {
  const director = await createParticipant(code, "Paquito", "facilitator-capitalist");
  return injectJson("POST", `/sessions/${code}/session-roles/game-authority`, {
    participantId: director.participant.id
  });
}

async function createKingWithAuthority(code: string): Promise<JsonObject> {
  const king = await createParticipant(code, "Le Roi", "king");
  const host = await injectJson("POST", `/sessions/${code}/session-roles/host`, {
    participantId: king.participant.id
  });
  const authority = await injectJson("POST", `/sessions/${code}/session-roles/game-authority`, {
    participantId: king.participant.id
  });
  return { king: king.participant, host, authority };
}

async function assignKingAuthority(code: string): Promise<JsonObject> {
  const assignment = await createKingWithAuthority(code);
  return assignment.authority;
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

test("serves a one-page Putsch core demo dashboard", async () => {
  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Putsch au Panador core/);
  assert.match(response.body, /id="participantLink"/);
  assert.match(response.body, /Copier lien participant/);
  assert.match(response.body, /navigator.clipboard/);
  assert.match(response.body, /Scenario Putsch test/);
  assert.match(response.body, /\/demo\/putsch-lite/);
  assert.match(response.body, /Echanges/);
  assert.match(response.body, /Controles de jeu/);
  assert.match(response.body, /id="gameControls"/);
  assert.match(response.body, /Poste de conduite/);
  assert.match(response.body, /id="mvpPanel"/);
  assert.match(response.body, /renderMvpPanel/);
  assert.match(response.body, /themePanel/);
  assert.match(response.body, /renderThemePanel/);
  assert.match(response.body, /interactionCue/);
  assert.match(response.body, /renderGameControls/);
  assert.match(response.body, /performGameAction/);
  assert.match(response.body, /resourcePushGrid/);
  assert.match(response.body, /Secours dashboard/);
  assert.match(response.body, /Telephones au contact ou joueurs cote a cote/);
  assert.match(response.body, /Corriger/);
  assert.match(response.body, /Attribuer role/);
  assert.match(response.body, /Casquette de session/);
  assert.match(response.body, /assignSessionRole/);
  assert.match(response.body, /renderSessionRoles/);
  assert.match(response.body, /injectionAuthorityNotice/);
  assert.match(response.body, /hasDashboardInjectionAuthority/);
  assert.match(response.body, /Casquette d'injection requise/);
  assert.match(response.body, /Resolutions de phase/);
  assert.match(response.body, /id="phaseResolutions"/);
  assert.match(response.body, /renderPhaseResolutionActions/);
  assert.match(response.body, /collectPhaseResolutionPayload/);
  assert.match(response.body, /recordPhaseResolution/);
  assert.match(response.body, /Valider la resolution/);
  assert.match(response.body, /Resolutions/);
  assert.match(response.body, /recommendedOutcomes/);
  assert.match(response.body, /dashboardResolutionPayloadDetails/);
  assert.match(response.body, /dashboardAutomaticEffectDetails/);
  assert.match(response.body, /councilResolution/);
  assert.match(response.body, /coupResolution/);
  assert.match(response.body, /data-outcome/);
  assert.match(response.body, /renderStatusList/);
  assert.match(response.body, /renderDashboardAggregates/);
  assert.match(response.body, /Debug JSON/);
  assert.doesNotMatch(response.body, /<h2>Etat brut<\/h2>/);
  assert.match(response.body, /collectResolutionPayload/);
  assert.match(response.body, /dashboardOutcomeDetails/);
  assert.match(response.body, /data-resolution-outcome-detail/);
  assert.match(response.body, /data-resolution-resource-delta/);
  assert.match(response.body, /data-resolution-state/);
  assert.match(response.body, /Marquer resolue/);
  assert.match(response.body, /Regler minuteur/);
  assert.match(response.body, /Duree engagements putsch/);
  assert.match(response.body, /setCoupCommitmentDuration/);
});

test("serves a mobile participant app for session join", async () => {
  const response = await app.inject({ method: "GET", url: "/play" });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /App participant/);
  assert.match(response.body, /Code MJ/);
  assert.match(response.body, /URLSearchParams/);
  assert.match(response.body, /switchingSession/);
  assert.match(response.body, /forgetDevice/);
  assert.match(response.body, /Le MJ attribuera/);
  assert.match(response.body, /Entrer dans la partie/);
  assert.match(response.body, /Declencher/);
  assert.match(response.body, /id="roleDetails"/);
  assert.match(response.body, /renderRoleDetails/);
  assert.match(response.body, /themeStrip/);
  assert.match(response.body, /Geste/);
  assert.match(response.body, /id="statuses"/);
  assert.match(response.body, /renderStatuses/);
  assert.match(response.body, /actionInputControl/);
  assert.match(response.body, /actionVerb/);
  assert.match(response.body, /actionHint/);
  assert.match(response.body, /resourcePushTile/);
  assert.match(response.body, /pushResource/);
  assert.match(response.body, /Receveur au contact/);
  assert.match(response.body, /Pousse les jetons au pouce/);
  assert.match(response.body, /pas a distance/);
  assert.match(response.body, /Proposer l'echange/);
  assert.match(response.body, /Ressources engagees/);
  assert.match(response.body, /collectActionPayload/);
  assert.match(response.body, /resetToJoin/);
  assert.match(response.body, /\/heartbeat/);
  assert.match(response.body, /method: "POST", body: JSON.stringify\(\{\}\)/);
  assert.match(response.body, /data-action-input/);
  assert.match(response.body, /Actions de cette phase/);
  assert.match(response.body, /Aucune action disponible dans cette phase/);
  assert.match(response.body, /A traiter/);
  assert.match(response.body, /formatDeadline/);
  assert.match(response.body, /pendingResolutions/);
  assert.doesNotMatch(response.body, /Afficher debug/);
  assert.doesNotMatch(response.body, /id="debugPanel"/);
});

test("creates a ready-to-play Putsch demo session", async () => {
  const demo = await injectJson("POST", "/demo/putsch-lite", {});
  const paquito = demo.participants.find((participant: JsonObject) => participant.name === "Paquito");

  assert.equal(demo.readModel, "dashboard");
  assert.equal(demo.module.id, "putsch-lite");
  assert.equal(demo.participants.length, 5);
  assert.equal(demo.devices.length, 5);
  assert.equal(demo.devices.every((device: JsonObject) => Boolean(device.participantId)), true);
  assert.equal(paquito.roleId, "facilitator-capitalist");
  assert.equal(demo.sessionRoleAssignments["game-authority"].participantId, paquito.id);
  assert.equal(demo.messages[0].text, "Le marche ouvre.");

  const paquitoDevice = demo.devices.find((device: JsonObject) => device.participantId === paquito.id);
  const readModel = await injectJson("GET", `/sessions/${demo.code}/read-models/device/${paquitoDevice.id}`);
  assert.equal(readModel.readModel, "device.participant");
  assert.equal(readModel.participant.id, paquito.id);
  assert.equal(readModel.availableActions.some((action: JsonObject) => action.id === "trade-copper-shares"), true);
});

test("lets a participant join with a chosen role and receive a filtered read model", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const joined = await injectJson("POST", `/sessions/${code}/join`, {
    name: "Ana",
    roleId: "general"
  });
  const other = await createParticipant(code, "Boris", "dealer");

  assert.equal(joined.sessionCode, code);
  assert.equal(joined.participant.name, "Ana");
  assert.equal(joined.participant.roleId, "general");
  assert.equal(joined.participant.resources.money, 8);
  assert.equal(joined.device.participantId, joined.participant.id);
  assert.equal(joined.readModel.readModel, "device.participant");
  assert.equal(joined.readModel.participant.id, joined.participant.id);
  assert.equal(joined.readModel.visibleParticipants.length, 1);
  assert.equal(joined.readModel.module.resources.find((resource: JsonObject) => resource.id === "money").name, "Escudos");
  assert.equal(joined.readModel.module.roles.find((role: JsonObject) => role.id === "general").name, "General");
  assert.equal(joined.readModel.module.roles.find((role: JsonObject) => role.id === "facilitator-capitalist").secretRole, undefined);
  assert.equal(joined.readModel.module.sessionRoles, undefined);
  assert.equal(joined.readModel.sessionRoleAssignments, undefined);
  assert.equal(joined.readModel.aggregates, undefined);
  assert.equal(joined.readModel.ownRole.name, "General");
  assert.equal(joined.readModel.tableStatuses.copperPrice, 1000);

  const refreshed = await injectJson("GET", `/sessions/${code}/read-models/device/${joined.device.id}`);
  assert.equal(refreshed.visibleParticipants.find((participant: JsonObject) => participant.id === joined.participant.id).roleId, "general");
  assert.equal(refreshed.visibleParticipants.find((participant: JsonObject) => participant.id === other.participant.id).roleId, undefined);
});

test("lets the facilitator assign a role after participant join", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const joined = await injectJson("POST", `/sessions/${code}/join`, { name: "Ana" });

  assert.equal(joined.participant.roleId, undefined);
  assert.equal(joined.participant.resources.money, 0);

  await injectJson("POST", `/sessions/${code}/players/${joined.participant.id}/role`, { roleId: "dealer" });
  const participantSync = await injectJson("GET", `/sessions/${code}/devices/${joined.device.id}/sync`);

  assert.equal(participantSync.readModel.participant.roleId, "dealer");
  assert.equal(participantSync.readModel.participant.resources.money, 12);
  assert.equal(participantSync.audit.entries.at(-1).type, "role.assigned");
});

test("assigns session roles separately from in-game roles", async () => {
  const putschSession = await createSession("putsch-lite");
  const putschCode = putschSession.code;
  const director = await createParticipant(putschCode, "Paquito", "facilitator-capitalist");

  assert.equal(putschSession.sessionRoleAssignments.host.enabled, true);
  assert.equal(putschSession.sessionRoleAssignments["game-authority"].enabled, false);

  const assignedAuthority = await injectJson("POST", `/sessions/${putschCode}/session-roles/game-authority`, {
    participantId: director.participant.id
  });

  assert.equal(assignedAuthority.sessionRoleAssignments["game-authority"].participantId, director.participant.id);
  assert.equal(assignedAuthority.sessionRoleAssignments["game-authority"].enabled, true);
  assert.equal(assignedAuthority.audit.at(-1).type, "session_role.assigned");

  const wolfpackSession = await createSession("wolfpack-lite");
  const wolfpackCode = wolfpackSession.code;
  const sonar = await createParticipant(wolfpackCode, "Sonar", "sonar");
  const captain = await createParticipant(wolfpackCode, "Capitaine", "captain");

  const rejected = await app.inject({
    method: "POST",
    url: `/sessions/${wolfpackCode}/session-roles/host`,
    payload: { participantId: sonar.participant.id }
  });
  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.json<JsonObject>().error, /not assignable/);

  const assignedHost = await injectJson("POST", `/sessions/${wolfpackCode}/session-roles/host`, {
    participantId: captain.participant.id
  });
  assert.equal(assignedHost.sessionRoleAssignments.host.participantId, captain.participant.id);
  assert.equal(assignedHost.sessionRoleAssignments.host.enabled, true);
});

test("requires injection authority for Putsch resource corrections", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const player = await createParticipant(code, "James", "kgb-agent");

  const rejected = await app.inject({
    method: "POST",
    url: `/sessions/${code}/players/${player.participant.id}/resources`,
    payload: { resourceId: "money", value: 21000 }
  });
  assert.equal(rejected.statusCode, 403);
  assert.match(rejected.json<JsonObject>().error, /Injection authority/);

  await assignGameAuthority(code);
  const accepted = await setResource(code, player.participant.id, "money", 21000);
  const updatedPlayer = accepted.participants.find((candidate: JsonObject) => candidate.id === player.participant.id);
  assert.equal(updatedPlayer.resources.money, 21000);
});

test("sends facilitator phase timers to participant read models", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const joined = await injectJson("POST", `/sessions/${code}/join`, {
    name: "Ana",
    roleId: "general"
  });

  await setPhaseTimer(code, { durationSeconds: 420 });
  const participantSync = await injectJson("GET", `/sessions/${code}/devices/${joined.device.id}/sync`);

  assert.equal(participantSync.readModel.phaseClock.phaseDurationSeconds, 420);
  assert.equal(participantSync.readModel.phaseClock.facilitatorControlled, true);
  assert.equal(typeof participantSync.readModel.phaseClock.phaseEndsAt, "string");
});

test("loads module mechanics and links actions to them", async () => {
  const modules = await injectJson("GET", "/modules");
  const putschSummary = modules.find((module: JsonObject) => module.id === "putsch-lite");
  const wolfpackSummary = modules.find((module: JsonObject) => module.id === "wolfpack-lite");
  const kingSummary = modules.find((module: JsonObject) => module.id === "long-live-the-king-lite");

  assert.equal(putschSummary.mechanics, 4);
  assert.equal(putschSummary.sessionRoles, 2);
  assert.equal(wolfpackSummary.mechanics, 3);
  assert.equal(kingSummary.components, 6);
  assert.equal(kingSummary.sessionRoles, 2);
  assert.equal(kingSummary.setup, true);

  const putsch = await injectJson("GET", "/modules/putsch-lite");
  const directBarter = putsch.mechanics.find((mechanic: JsonObject) => mechanic.id === "direct-barter");
  const sellWeapons = putsch.actions.find((action: JsonObject) => action.id === "sell-weapons");
  assert.equal(directBarter.family, "exchange");
  assert.equal(sellWeapons.mechanicId, "direct-barter");
  assert.deepEqual(putsch.actions.find((action: JsonObject) => action.id === "trade-copper-shares").effect.resources, ["money", "copperShares"]);
  assert.deepEqual(putsch.actions.find((action: JsonObject) => action.id === "trade-arms-caches").effect.resources, ["money", "cf25", "cf50", "cf100", "cm25", "cm50", "cm100"]);
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "sell-drugs").actor, "drug-trafficker");
  assert.equal(putsch.state.copperPrice, 1000);
  assert.equal(putsch.roles.find((role: JsonObject) => role.id === "facilitator-capitalist").name, "Paquito Borrachon");
  assert.equal(putsch.roles.find((role: JsonObject) => role.id === "facilitator-capitalist").officialRole, "President des mines de cuivre d'Alcabal et meneur de jeu.");
  assert.equal(putsch.roles.find((role: JsonObject) => role.id === "facilitator-capitalist").startingResources.copperShares, 50);
  assert.equal(putsch.sessionRoles.find((role: JsonObject) => role.id === "host").canInjectGameElements, false);
  assert.equal(putsch.sessionRoles.find((role: JsonObject) => role.id === "game-authority").defaultRoleId, "facilitator-capitalist");
  assert.equal(putsch.mechanics.find((mechanic: JsonObject) => mechanic.id === "minister-council-record").family, "live-administration");
  assert.equal(putsch.mechanics.find((mechanic: JsonObject) => mechanic.id === "minister-election").family, "vote");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "record-minister-council").mechanicId, "minister-council-record");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "defend-coup").effect.type, "contestResponse");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "vote-minister-council").effect.type, "castVote");
  assert.equal(putsch.uiTheme.template, "political-pulp");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "sell-weapons").gesture, "pour-liquid");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "sell-drugs").gesture, "palm-cover");
  assert.equal(putsch.components.find((component: JsonObject) => component.id === "vote-ballot").count, 80);
  const wolfpack = await injectJson("GET", "/modules/wolfpack-lite");
  assert.equal(wolfpack.sessionRoles.find((role: JsonObject) => role.id === "host").defaultRoleId, "captain");
  assert.equal(wolfpack.sessionRoles.find((role: JsonObject) => role.id === "host").canInjectGameElements, false);
  const king = await injectJson("GET", "/modules/long-live-the-king-lite");
  assert.equal(king.state.healthCardsInLine, 6);
  assert.equal(king.components.find((component: JsonObject) => component.id === "health-card").count, 10);
  assert.equal(king.roles.find((role: JsonObject) => role.id === "king").name, "Roi");
  assert.equal(king.sessionRoles.find((role: JsonObject) => role.id === "game-authority").defaultRoleId, "king");
  assert.equal(king.mechanics.find((mechanic: JsonObject) => mechanic.id === "audience-income").family, "timed-income");
  assert.equal(king.mechanics.find((mechanic: JsonObject) => mechanic.id === "audience-income").resolution.mode, "guidedInApp");
  assert.deepEqual(king.mechanics.find((mechanic: JsonObject) => mechanic.id === "audience-income").resolution.modes, ["guidedInApp", "liveThenRecord"]);
  assert.equal(king.actions.find((action: JsonObject) => action.id === "hold-audience").mechanicId, "audience-income");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "embezzle-council-funds").phase, "first-council");
  assert.equal(putsch.actions.find((action: JsonObject) => action.id === "embezzle-council-funds").effect.delta, 5000);
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
  await createParticipant(code, "General", "general");
  await createParticipant(code, "Marchand", "dealer");

  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);

  assert.equal(dashboard.readModel, "dashboard");
  assert.equal(dashboard.code, code);
  assert.equal(dashboard.devices.length, 1);
  assert.equal(Array.isArray(dashboard.audit), true);
  assert.equal(dashboard.turnPhase.turn, 1);
  assert.equal(dashboard.turnPhase.phase.id, "market");
  assert.equal(dashboard.turnPhase.phase.index, 0);
  assert.equal(dashboard.turnPhase.phase.total, dashboard.module.phases.length);
  assert.equal(dashboard.turnPhase.durationSeconds, dashboard.phaseClock.phaseDurationSeconds);
  assert.equal(dashboard.aggregates.participants.total, 2);
  assert.equal(dashboard.aggregates.participants.byRole.general, 1);
  assert.equal(dashboard.aggregates.resources.money.total, 20);
  assert.equal(dashboard.aggregates.resources.weapons.max, 2);
});

test("persists sessions to local storage and reloads them", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  await createParticipant(code, "General", "general");
  await flushSessionPersistence();

  resetRuntimeState();
  await loadPersistedSessions();

  const restored = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.equal(restored.code, code);
  assert.equal(restored.module.id, "putsch-lite");
  assert.equal(restored.participants[0].name, "General");
  assert.equal(restored.audit.length, 2);
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
  assert.equal(boundSync.readModel.turnPhase.turn, 1);
  assert.equal(boundSync.readModel.turnPhase.phase.id, "briefing");
  assert.equal(boundSync.readModel.turnPhase.phase.index, 0);
  assert.equal(boundSync.audit.latestSequence, 5);
  assert.deepEqual(
    boundSync.audit.entries.map((entry: JsonObject) => entry.sequence),
    [3, 4, 5]
  );

  const unboundSync = await injectJson("GET", `/sessions/${code}/devices/${reserve.device.id}/sync?after=5`);
  assert.equal(unboundSync.readModel.readModel, "device.unbound");
  assert.equal(unboundSync.readModel.turnPhase.phase.id, "briefing");
  assert.equal(unboundSync.readModel.turnPhase.phase.total, 5);
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
  assert.equal(boundModel.recentAudit, undefined);
  assert.equal(boundModel.aggregates, undefined);
  assert.equal(boundModel.sessionRoleAssignments, undefined);
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

test("filters participant actions to the current playable menu", async () => {
  const session = await createSession();
  const code = session.code;
  const device = await createDevice(code, "Telephone machine");
  const participant = await createParticipant(code, "Machiniste", "engineer");
  await bindDevice(code, device.device.id, participant.participant.id);

  const briefingModel = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  const quietInBriefing = briefingModel.availableActions.find((action: JsonObject) => action.id === "quiet-engines");
  assert.equal(quietInBriefing, undefined);

  await setResource(code, participant.participant.id, "battery", 1);
  await advancePhase(code);
  const runningModel = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  const quietRunning = runningModel.availableActions.find((action: JsonObject) => action.id === "quiet-engines");
  const sonarSweep = runningModel.availableActions.find((action: JsonObject) => action.id === "sonar-sweep");

  assert.equal(quietRunning.available, true);
  assert.deepEqual(quietRunning.blockedBy, []);
  assert.equal(quietRunning.gesture, "phone-face-down");
  assert.equal(quietRunning.mechanicId, "station-action");
  assert.equal(sonarSweep, undefined);
});

test("exposes mechanic inputs on participant action read models", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const joined = await injectJson("POST", `/sessions/${code}/join`, {
    name: "Ana",
    roleId: "general"
  });

  const marketModel = await injectJson("GET", `/sessions/${code}/read-models/device/${joined.device.id}`);
  const sellWeapons = marketModel.availableActions.find((action: JsonObject) => action.id === "sell-weapons");
  const tradeCopper = marketModel.availableActions.find((action: JsonObject) => action.id === "trade-copper-shares");
  const tradeArms = marketModel.availableActions.find((action: JsonObject) => action.id === "trade-arms-caches");
  assert.equal(sellWeapons.available, true);
  assert.equal(sellWeapons.mechanicFamily, "exchange");
  assert.deepEqual(sellWeapons.inputs.find((input: JsonObject) => input.id === "resources").allowed, ["money", "weapons"]);
  assert.deepEqual(tradeCopper.inputs.find((input: JsonObject) => input.id === "resources").allowed, ["money", "copperShares"]);
  assert.deepEqual(tradeArms.inputs.find((input: JsonObject) => input.id === "resources").allowed, ["money", "cf25", "cf50", "cf100", "cm25", "cm50", "cm100"]);

  const trafficker = await injectJson("POST", `/sessions/${code}/join`, {
    name: "Vladimir",
    roleId: "drug-trafficker"
  });
  await advancePhase(code);
  const intrigueModel = await injectJson("GET", `/sessions/${code}/read-models/device/${trafficker.device.id}`);
  const sellDrugs = intrigueModel.availableActions.find((action: JsonObject) => action.id === "sell-drugs");
  assert.equal(sellDrugs.available, true);
  assert.deepEqual(sellDrugs.inputs.find((input: JsonObject) => input.id === "resources").allowed, ["money", "drugBags"]);

  await advancePhase(code);
  const model = await injectJson("GET", `/sessions/${code}/read-models/device/${joined.device.id}`);
  const coup = model.availableActions.find((action: JsonObject) => action.id === "attempt-coup");

  assert.equal(coup.available, true);
  assert.equal(coup.mechanicFamily, "contest");
  assert.deepEqual(
    coup.inputs.map((input: JsonObject) => input.id),
    ["defenderId", "leaderIds", "resources"]
  );
  assert.equal(coup.inputs.find((input: JsonObject) => input.id === "leaderIds").count, 2);
  assert.deepEqual(coup.inputs.find((input: JsonObject) => input.id === "resources").allowed, ["weapons", "ammo", "influence"]);
});

test("tracks facilitator-controlled phase timing and turn cycles", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;

  assert.equal(session.phase.id, "setup");
  assert.equal(session.phaseClock.turn, 1);
  assert.equal(session.phaseClock.phaseId, "setup");
  assert.equal(session.phaseClock.phaseDurationSeconds, 300);
  assert.equal(typeof session.phaseClock.phaseEndsAt, "string");
  assert.equal(session.module.timeline.setupPhaseId, "setup");
  assert.equal(session.module.timeline.convergencePhaseId, "council");

  const customTimer = await setPhaseTimer(code, { durationSeconds: 600 });
  assert.equal(customTimer.phaseClock.phaseId, "setup");
  assert.equal(customTimer.phaseClock.phaseDurationSeconds, 600);
  assert.equal(customTimer.phaseClock.facilitatorControlled, true);

  const audience = await advancePhase(code);
  assert.equal(audience.phase.id, "audience");
  assert.equal(audience.phaseClock.turn, 1);
  assert.equal(audience.phaseClock.phaseDurationSeconds, 180);
  assert.equal(audience.turnPhase.turn, 1);
  assert.equal(audience.turnPhase.phase.id, "audience");
  assert.equal(audience.turnPhase.phase.index, 1);
  assert.equal(audience.turnPhase.phase.total, 4);
  assert.equal(audience.turnPhase.durationSeconds, 180);

  const diplomacy = await advancePhase(code);
  assert.equal(diplomacy.phase.id, "diplomacy");
  assert.equal(diplomacy.phaseClock.turn, 1);
  assert.equal(diplomacy.phaseClock.phaseDurationSeconds, 900);

  const council = await advancePhase(code);
  assert.equal(council.phase.id, "council");
  assert.equal(council.phaseClock.turn, 1);
  assert.equal(council.phaseClock.phaseDurationSeconds, 420);

  const nextSetup = await advancePhase(code);
  assert.equal(nextSetup.phase.id, "setup");
  assert.equal(nextSetup.phaseClock.turn, 2);
  assert.equal(nextSetup.turnPhase.turn, 2);
  assert.equal(nextSetup.turnPhase.phase.id, "setup");
  assert.equal(nextSetup.turnPhase.phase.index, 0);
});

test("sends facilitator messages with participant-filtered visibility", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  const queenDevice = await createDevice(code, "Telephone reine");
  const baronDevice = await createDevice(code, "Telephone baron");
  const queen = await createParticipant(code, "Reine", "queen");
  const baron = await createParticipant(code, "Baron", "baron");
  await bindDevice(code, queenDevice.device.id, queen.participant.id);
  await bindDevice(code, baronDevice.device.id, baron.participant.id);

  const privateMessage = await sendMessage(code, {
    target: "participant",
    participantId: queen.participant.id,
    text: "Le roi vous convoque en prive.",
    channel: "audience"
  });
  const publicMessage = await sendMessage(code, {
    target: "allParticipants",
    text: "Le conseil commence.",
    channel: "announcement"
  });

  assert.equal(privateMessage.accepted, true);
  assert.equal(publicMessage.accepted, true);
  assert.equal(publicMessage.dashboard.messages.length, 2);

  const queenModel = await injectJson("GET", `/sessions/${code}/read-models/device/${queenDevice.device.id}`);
  const baronModel = await injectJson("GET", `/sessions/${code}/read-models/device/${baronDevice.device.id}`);
  assert.deepEqual(
    queenModel.messages.map((message: JsonObject) => message.text),
    ["Le roi vous convoque en prive.", "Le conseil commence."]
  );
  assert.deepEqual(
    baronModel.messages.map((message: JsonObject) => message.text),
    ["Le conseil commence."]
  );
});

test("rejects malformed facilitator messages", async () => {
  const session = await createSession();
  const code = session.code;

  const missingParticipant = await app.inject({
    method: "POST",
    url: `/sessions/${code}/messages`,
    payload: {
      target: "participant",
      text: "Message sans cible."
    }
  });
  assert.equal(missingParticipant.statusCode, 400);
  assert.equal(missingParticipant.json<JsonObject>().error, "participantId is required for participant messages");

  const unknownParticipant = await app.inject({
    method: "POST",
    url: `/sessions/${code}/messages`,
    payload: {
      target: "participant",
      participantId: "missing-participant",
      text: "Message vers inconnu."
    }
  });
  assert.equal(unknownParticipant.statusCode, 400);
  assert.equal(unknownParticipant.json<JsonObject>().error, "Unknown participant");
});

test("runs module setup distributions into participant inventories", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  const queenDevice = await createDevice(code, "Telephone reine");
  const baronDevice = await createDevice(code, "Telephone baron");
  const queen = await createParticipant(code, "Reine", "queen");
  const baron = await createParticipant(code, "Baron", "baron");
  await bindDevice(code, queenDevice.device.id, queen.participant.id);
  await bindDevice(code, baronDevice.device.id, baron.participant.id);

  const setup = await app.inject({
    method: "POST",
    url: `/sessions/${code}/setup/distribute`,
    payload: {}
  });

  assert.equal(setup.statusCode, 202);
  const body = setup.json<JsonObject>();
  assert.equal(body.accepted, true);
  assert.equal(body.setupResult.applied, true);
  assert.equal(body.setupResult.phaseId, "setup");
  assert.equal(body.setupResult.distributions.length, 2);
  assert.equal(body.setupResult.distributions.find((distribution: JsonObject) => distribution.id === "initial-status").countResource, "status");
  assert.equal(body.dashboard.componentPools["intrigue-card"].remaining, 76);
  assert.equal(body.dashboard.componentPools["status-card"].remaining, 25);
  assert.equal(body.dashboard.aggregates.inventory["intrigue-card"], 4);
  assert.equal(body.dashboard.aggregates.inventory["status-card"], 7);
  assert.equal(body.dashboard.aggregates.componentPools["intrigue-card"].remaining, 76);

  const queenModel = await injectJson("GET", `/sessions/${code}/read-models/device/${queenDevice.device.id}`);
  const baronModel = await injectJson("GET", `/sessions/${code}/read-models/device/${baronDevice.device.id}`);
  assert.equal(queenModel.participant.inventory["intrigue-card"], 2);
  assert.equal(queenModel.participant.inventory["status-card"], 4);
  assert.equal(queenModel.aggregates, undefined);
  assert.equal(baronModel.participant.inventory["intrigue-card"], 2);
  assert.equal(baronModel.participant.inventory["status-card"], 3);
});

test("runs Long Live audience income and intrigue draws through a module action", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  const authority = await createKingWithAuthority(code);
  const queen = await createParticipant(code, "Reine", "queen");
  const baron = await createParticipant(code, "Baron", "baron");
  const treasurer = await createParticipant(code, "Tresorier", "treasurer");
  await setResource(code, queen.participant.id, "income", 4);
  await setResource(code, baron.participant.id, "income", 6);
  await setResource(code, treasurer.participant.id, "income", 5);
  await advancePhase(code);

  const audience = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "hold-audience",
    participantId: authority.king.id
  });

  assert.equal(audience.accepted, true);
  assert.equal(audience.actionResult.effect.type, "runTimedIncome");
  assert.equal(audience.actionResult.effect.turn, 1);
  assert.deepEqual(audience.actionResult.effect.participants, [
    queen.participant.id,
    baron.participant.id,
    treasurer.participant.id
  ]);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === queen.participant.id).resources.gold, 9);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === baron.participant.id).resources.gold, 9);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === treasurer.participant.id).resources.gold, 9);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === authority.king.id).inventory["intrigue-card"], undefined);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === queen.participant.id).inventory["intrigue-card"], 2);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === baron.participant.id).inventory["intrigue-card"], 1);
  assert.equal(audience.dashboard.participants.find((candidate: JsonObject) => candidate.id === treasurer.participant.id).inventory["intrigue-card"], 1);
  assert.equal(audience.dashboard.componentPools["intrigue-card"].remaining, 76);
});

test("rejects Long Live audience income without game authority", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  const king = await createParticipant(code, "Le Roi", "king");
  await advancePhase(code);

  const audience = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.requested",
      actionId: "hold-audience",
      participantId: king.participant.id
    }
  });

  assert.equal(audience.statusCode, 400);
  assert.equal(audience.json<JsonObject>().error, "Injection authority is required for timed income");
});

test("draws components from pools into participant inventories", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  await assignKingAuthority(code);
  const device = await createDevice(code, "Telephone reine");
  const queen = await createParticipant(code, "Reine", "queen");
  await bindDevice(code, device.device.id, queen.participant.id);

  const draw = await drawComponent(code, {
    sourceDeviceId: device.device.id,
    componentId: "intrigue-card",
    count: 2,
    reason: "audience-income"
  });

  assert.equal(draw.accepted, true);
  assert.equal(draw.drawResult.participantId, queen.participant.id);
  assert.equal(draw.drawResult.draw.before, 80);
  assert.equal(draw.drawResult.draw.after, 78);
  assert.equal(draw.drawResult.inventory.before, 0);
  assert.equal(draw.drawResult.inventory.after, 2);
  assert.equal(draw.dashboard.componentPools["intrigue-card"].remaining, 78);
  assert.equal(draw.dashboard.aggregates.inventory["intrigue-card"], 2);

  const model = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  assert.equal(model.participant.inventory["intrigue-card"], 2);
  assert.equal(model.aggregates, undefined);
});

test("rejects component draws that exceed the pool", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  await assignKingAuthority(code);
  const participant = await createParticipant(code, "Baron", "baron");

  const draw = await app.inject({
    method: "POST",
    url: `/sessions/${code}/components/draw`,
    payload: {
      participantId: participant.participant.id,
      componentId: "health-card",
      count: 11
    }
  });

  assert.equal(draw.statusCode, 400);
  assert.match(draw.json<JsonObject>().error, /only 10 remaining/);
  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.equal(dashboard.componentPools["health-card"].remaining, 10);
  assert.deepEqual(dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id).inventory, {});
});

test("transfers resources between participants and filters exchange read models", async () => {
  const session = await createSession();
  const code = session.code;
  const sonarDevice = await createDevice(code, "Telephone sonar");
  const engineerDevice = await createDevice(code, "Telephone machines");
  const captainDevice = await createDevice(code, "Telephone capitaine");
  const sonar = await createParticipant(code, "Station sonar", "sonar");
  const engineer = await createParticipant(code, "Station machines", "engineer");
  const captain = await createParticipant(code, "Capitaine", "captain");
  await bindDevice(code, sonarDevice.device.id, sonar.participant.id);
  await bindDevice(code, engineerDevice.device.id, engineer.participant.id);
  await bindDevice(code, captainDevice.device.id, captain.participant.id);
  await setResource(code, sonar.participant.id, "battery", 3);

  const exchange = await createExchange(code, {
    sourceDeviceId: sonarDevice.device.id,
    toParticipantId: engineer.participant.id,
    resources: { battery: 2 }
  });

  assert.equal(exchange.accepted, true);
  assert.equal(exchange.exchangeResult.exchange.fromParticipantId, sonar.participant.id);
  assert.equal(exchange.exchangeResult.exchange.toParticipantId, engineer.participant.id);
  assert.deepEqual(exchange.exchangeResult.exchange.resources, { battery: 2 });
  assert.equal(exchange.dashboard.participants.find((candidate: JsonObject) => candidate.id === sonar.participant.id).resources.battery, 1);
  assert.equal(exchange.dashboard.participants.find((candidate: JsonObject) => candidate.id === engineer.participant.id).resources.battery, 2);
  assert.equal(exchange.dashboard.exchanges.length, 1);

  const sonarModel = await injectJson("GET", `/sessions/${code}/read-models/device/${sonarDevice.device.id}`);
  const engineerModel = await injectJson("GET", `/sessions/${code}/read-models/device/${engineerDevice.device.id}`);
  const captainModel = await injectJson("GET", `/sessions/${code}/read-models/device/${captainDevice.device.id}`);
  assert.equal(sonarModel.exchanges.length, 1);
  assert.equal(engineerModel.exchanges.length, 1);
  assert.deepEqual(captainModel.exchanges, []);
});

test("rejects invalid participant exchanges without partially applying resources", async () => {
  const session = await createSession();
  const code = session.code;
  const source = await createParticipant(code, "Station sonar", "sonar");
  const target = await createParticipant(code, "Station machines", "engineer");
  await setResource(code, source.participant.id, "battery", 1);

  const insufficient = await app.inject({
    method: "POST",
    url: `/sessions/${code}/exchanges`,
    payload: {
      fromParticipantId: source.participant.id,
      toParticipantId: target.participant.id,
      resources: { battery: 2 }
    }
  });
  assert.equal(insufficient.statusCode, 400);
  assert.match(insufficient.json<JsonObject>().error, /outside bounds/);

  const unknownResource = await app.inject({
    method: "POST",
    url: `/sessions/${code}/exchanges`,
    payload: {
      fromParticipantId: source.participant.id,
      toParticipantId: target.participant.id,
      resources: { relic: 1 }
    }
  });
  assert.equal(unknownResource.statusCode, 400);
  assert.equal(unknownResource.json<JsonObject>().error, "Unknown resource: relic");

  const selfExchange = await app.inject({
    method: "POST",
    url: `/sessions/${code}/exchanges`,
    payload: {
      fromParticipantId: source.participant.id,
      toParticipantId: source.participant.id,
      resources: { battery: 1 }
    }
  });
  assert.equal(selfExchange.statusCode, 400);
  assert.equal(selfExchange.json<JsonObject>().error, "Exchange requires two different participants");

  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.equal(dashboard.participants.find((candidate: JsonObject) => candidate.id === source.participant.id).resources.battery, 1);
  assert.equal(dashboard.participants.find((candidate: JsonObject) => candidate.id === target.participant.id).resources.battery, 0);
  assert.deepEqual(dashboard.exchanges, []);
});

test("applies immediate exchange actions from participant payloads", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const generalDevice = await createDevice(code, "Telephone general");
  const general = await createParticipant(code, "General", "general");
  const dealer = await createParticipant(code, "Marchand", "dealer");
  await bindDevice(code, generalDevice.device.id, general.participant.id);

  const transfer = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "sell-weapons",
    sourceDeviceId: generalDevice.device.id,
    payload: {
      toParticipantId: dealer.participant.id,
      contactConfirmed: true,
      resources: { weapons: 1 }
    }
  });

  assert.equal(transfer.accepted, true);
  assert.equal(transfer.actionResult.effect.type, "exchange");
  assert.equal(transfer.actionResult.effect.mechanicId, "direct-barter");
  assert.equal(transfer.actionResult.effect.exchangeResult.exchange.fromParticipantId, general.participant.id);
  assert.equal(transfer.actionResult.effect.exchangeResult.exchange.toParticipantId, dealer.participant.id);
  assert.deepEqual(transfer.actionResult.effect.exchangeResult.exchange.resources, { weapons: 1 });
  assert.equal(transfer.dashboard.participants.find((candidate: JsonObject) => candidate.id === general.participant.id).resources.weapons, 1);
  assert.equal(transfer.dashboard.participants.find((candidate: JsonObject) => candidate.id === dealer.participant.id).resources.weapons, 2);
  assert.equal(transfer.dashboard.exchanges.length, 1);

  const generalModel = await injectJson("GET", `/sessions/${code}/read-models/device/${generalDevice.device.id}`);
  assert.equal(generalModel.exchanges.length, 1);
});

test("lets the dashboard trigger phase game controls on behalf of an actor", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const general = await createParticipant(code, "General", "general");
  const dealer = await createParticipant(code, "Marchand", "dealer");

  const transfer = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.triggered",
    actionId: "sell-weapons",
    participantId: general.participant.id,
    payload: {
      toParticipantId: dealer.participant.id,
      contactConfirmed: true,
      resources: { weapons: 1 }
    }
  });

  assert.equal(transfer.accepted, true);
  assert.equal(transfer.actionResult.effect.type, "exchange");
  assert.equal(transfer.dashboard.participants.find((candidate: JsonObject) => candidate.id === general.participant.id).resources.weapons, 1);
  assert.equal(transfer.dashboard.participants.find((candidate: JsonObject) => candidate.id === dealer.participant.id).resources.weapons, 2);
});

test("rejects immediate exchange actions with invalid payloads", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const generalDevice = await createDevice(code, "Telephone general");
  const general = await createParticipant(code, "General", "general");
  const dealer = await createParticipant(code, "Marchand", "dealer");
  await bindDevice(code, generalDevice.device.id, general.participant.id);

  const rejected = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.requested",
      actionId: "sell-weapons",
      sourceDeviceId: generalDevice.device.id,
      payload: {
        toParticipantId: dealer.participant.id,
        contactConfirmed: true,
        resources: { influence: 1 }
      }
    }
  });

  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.json<JsonObject>().error, /not allowed/);
  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.equal(dashboard.participants.find((candidate: JsonObject) => candidate.id === general.participant.id).resources.influence, 2);
  assert.deepEqual(dashboard.exchanges, []);
});

test("rejects player exchanges without close phone contact confirmation", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const generalDevice = await createDevice(code, "Telephone general");
  const general = await createParticipant(code, "General", "general");
  const dealer = await createParticipant(code, "Marchand", "dealer");
  await bindDevice(code, generalDevice.device.id, general.participant.id);

  const rejected = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.requested",
      actionId: "sell-weapons",
      sourceDeviceId: generalDevice.device.id,
      payload: {
        toParticipantId: dealer.participant.id,
        resources: { weapons: 1 }
      }
    }
  });

  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.json<JsonObject>().error, /proximity/);
  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.deepEqual(dashboard.exchanges, []);
});

test("opens pending petition resolutions from module mechanics", async () => {
  const session = await createSession("long-live-the-king-lite");
  const code = session.code;
  const device = await createDevice(code, "Telephone reine");
  const participant = await createParticipant(code, "Reine", "queen");
  await bindDevice(code, device.device.id, participant.participant.id);
  await advancePhase(code);
  await advancePhase(code);
  await advancePhase(code);

  const petition = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.requested",
      actionId: "submit-petition",
      sourceDeviceId: device.device.id,
      payload: { petitionText: "Demander une levee exceptionnelle" }
    }
  });

  assert.equal(petition.statusCode, 202);
  const body = petition.json<JsonObject>();
  assert.equal(body.actionResult.effect.type, "pendingResolution");
  assert.equal(body.actionResult.effect.mechanicId, "petition-vote");
  assert.equal(body.actionResult.effect.mechanicFamily, "petition");
  assert.equal(body.dashboard.pendingResolutions.length, 1);
  assert.equal(body.dashboard.pendingResolutions[0].id, body.actionResult.effect.resolutionId);
  assert.equal(body.dashboard.pendingResolutions[0].actionId, "submit-petition");
  assert.equal(body.dashboard.pendingResolutions[0].payload.petitionText, "Demander une levee exceptionnelle");
  assert.equal(body.dashboard.pendingResolutions[0].summary, "Reine: Demander une levee exceptionnelle");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.kind, "petition");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.title, "Deposer une petition");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.participants[0].role, "actor");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.participants[0].name, "Reine");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.inputHints.some((input: JsonObject) => input.id === "petitionText"), true);
  assert.deepEqual(
    body.dashboard.pendingResolutions[0].recommendedOutcomes.map((outcome: JsonObject) => outcome.id),
    ["accepted", "rejected", "deferred"]
  );

  const deviceModel = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  assert.equal(deviceModel.pendingResolutions[0].mechanicId, "petition-vote");
  assert.equal(deviceModel.pendingResolutions[0].phaseResolution.kind, "petition");
});

test("opens pending contest resolutions from module mechanics", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const device = await createDevice(code, "Telephone general");
  const participant = await createParticipant(code, "General", "general");
  await bindDevice(code, device.device.id, participant.participant.id);
  await advancePhase(code);
  await advancePhase(code);

  const coup = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "action.requested",
      actionId: "attempt-coup",
      sourceDeviceId: device.device.id,
      payload: { defenderId: "pending-defender", leaderIds: ["leader-a", "leader-b"], resources: { weapons: 1, ammo: 1 } }
    }
  });

  assert.equal(coup.statusCode, 202);
  const body = coup.json<JsonObject>();
  assert.equal(body.actionResult.effect.type, "pendingResolution");
  assert.equal(body.actionResult.effect.mechanicId, "contested-coup");
  assert.equal(body.actionResult.effect.mechanicFamily, "contest");
  assert.equal(body.actionResult.effect.resourceChanges.length, 2);
  assert.equal(body.dashboard.pendingResolutions[0].type, "contestedBid");
  assert.equal(body.dashboard.pendingResolutions[0].resolution.type, "sealedCommitment");
  assert.equal(body.dashboard.pendingResolutions[0].participantId, participant.participant.id);
  assert.deepEqual(body.dashboard.pendingResolutions[0].payload.leaderIds, ["leader-a", "leader-b"]);
  assert.equal(body.dashboard.pendingResolutions[0].payload.commitments.attacker.total, 2);
  assert.equal(body.dashboard.pendingResolutions[0].payload.commitmentDeadline.durationSeconds, 120);
  assert.equal(typeof body.dashboard.pendingResolutions[0].payload.commitmentDeadline.endsAt, "string");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.kind, "contest");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.title, "Tenter un coup d'Etat");
  assert.equal(body.dashboard.pendingResolutions[0].phaseResolution.deadline.durationSeconds, 120);
  assert.deepEqual(
    body.dashboard.pendingResolutions[0].phaseResolution.inputHints.find((input: JsonObject) => input.id === "resources").allowed,
    ["weapons", "ammo", "influence"]
  );
  assert.deepEqual(
    body.dashboard.pendingResolutions[0].recommendedOutcomes.map((outcome: JsonObject) => outcome.id),
    ["attacker-wins", "defender-wins", "tie-facilitator"]
  );
  assert.deepEqual(body.dashboard.pendingResolutions[0].recommendedOutcomes[0].effects[0], {
    type: "setState",
    state: "coupOutcome",
    value: "attacker-wins"
  });
  assert.equal(body.dashboard.pendingResolutions[0].recommendedOutcomes[0].effects[1].type, "scaleSessionCounter");
  assert.equal(body.dashboard.pendingResolutions[0].recommendedOutcomes[0].effects[1].state, "copperPrice");
  assert.equal(body.dashboard.pendingResolutions[0].recommendedOutcomes[0].effects[1].factor, 0.5);
});

test("uses facilitator-configured coup countdown for hidden commitments", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const director = await createParticipant(code, "Paquito", "facilitator-capitalist");
  const attacker = await createParticipant(code, "General", "general");
  const defender = await createParticipant(code, "Marchand", "dealer");
  await injectJson("POST", `/sessions/${code}/session-roles/game-authority`, {
    participantId: director.participant.id
  });
  await injectJson("POST", `/sessions/${code}/state`, {
    state: "coupCommitmentSeconds",
    value: 45
  });
  await advancePhase(code);
  await advancePhase(code);

  const coup = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "attempt-coup",
    participantId: attacker.participant.id,
    payload: {
      defenderId: defender.participant.id,
      leaderIds: [attacker.participant.id, defender.participant.id],
      resources: { weapons: 1, ammo: 1 }
    }
  });

  assert.equal(coup.dashboard.pendingResolutions[0].payload.commitmentDeadline.durationSeconds, 45);
  const defenderModel = await injectJson("GET", `/sessions/${code}/read-models/participant/${defender.participant.id}`);
  assert.equal(defenderModel.pendingResolutions[0].payload.commitmentDeadline.durationSeconds, 45);
  assert.equal(defenderModel.availableActions.some((action: JsonObject) => action.id === "defend-coup"), true);
});

test("opens pending live administration records for Putsch council results", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const director = await createParticipant(code, "Paquito", "facilitator-capitalist");
  const minister = await createParticipant(code, "General", "general");
  await injectJson("POST", `/sessions/${code}/session-roles/game-authority`, {
    participantId: director.participant.id
  });
  await advancePhase(code);
  await advancePhase(code);
  await advancePhase(code);
  await advancePhase(code);

  const council = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "record-minister-council",
    participantId: director.participant.id,
    payload: {
      attendeeIds: [director.participant.id, minister.participant.id],
      embezzlement: { money: 5000 },
      decisions: "Le conseil valide un detournement et ajourne le prochain tour."
    }
  });

  assert.equal(council.accepted, true);
  assert.equal(council.actionResult.effect.type, "autoResolvedLiveAdministration");
  assert.equal(council.actionResult.effect.mechanicId, "minister-council-record");
  assert.equal(council.actionResult.effect.resolveResult.outcome, "facilitator-resolved");
  assert.deepEqual(
    council.actionResult.effect.resolveResult.effects.map((effect: JsonObject) => effect.type),
    ["setSessionState", "adjustResource"]
  );
  assert.equal(council.dashboard.statuses.firstCouncilDue, false);
  assert.equal(council.dashboard.pendingResolutions.length, 0);
  assert.equal(council.dashboard.participants.find((candidate: JsonObject) => candidate.id === director.participant.id).resources.money, 5000);
  assert.equal(council.dashboard.messages.at(-1).target, "allParticipants");
});

test("runs Putsch minister election votes end to end", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const voter = await createParticipant(code, "James", "kgb-agent");
  const candidate = await createParticipant(code, "Raul", "fun-agent");
  await advancePhase(code);
  await advancePhase(code);
  await advancePhase(code);
  await advancePhase(code);

  const vote = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "vote-minister-council",
    participantId: voter.participant.id,
    payload: {
      promotionCandidateId: candidate.participant.id,
      eliminationCandidateId: voter.participant.id,
      votes: 3
    }
  });

  assert.equal(vote.accepted, true);
  assert.equal(vote.actionResult.effect.type, "castVote");
  assert.equal(vote.actionResult.effect.tally.promotion[candidate.participant.id], 3);
  assert.equal(vote.actionResult.effect.tally.elimination[voter.participant.id], 3);
  assert.equal(vote.actionResult.effect.leader.participantId, candidate.participant.id);
  assert.equal(vote.dashboard.statuses.ministerElectionTally.promotion[candidate.participant.id], 3);
  assert.equal(vote.dashboard.participants.find((participant: JsonObject) => participant.id === voter.participant.id).resources.voteBallots, 5);
});

test("runs the stripped Putsch operational demo path", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const director = await createParticipant(code, "Paquito", "facilitator-capitalist");
  const general = await createParticipant(code, "General", "general");
  const dealer = await createParticipant(code, "Marchand", "dealer");
  const fun = await createParticipant(code, "Raul", "fun-agent");
  await injectJson("POST", `/sessions/${code}/session-roles/game-authority`, {
    participantId: director.participant.id
  });

  const marketTrade = await createExchange(code, {
    fromParticipantId: general.participant.id,
    toParticipantId: dealer.participant.id,
    resources: { weapons: 1 }
  });
  assert.equal(marketTrade.exchangeResult.transfers[0].from.after, 1);

  await advancePhase(code);
  await advancePhase(code);
  const coup = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "attempt-coup",
    participantId: general.participant.id,
    payload: {
      defenderId: dealer.participant.id,
      leaderIds: [general.participant.id, dealer.participant.id],
      resources: { weapons: 1, ammo: 1 }
    }
  });
  assert.equal(coup.dashboard.pendingResolutions[0].payload.commitments.attacker.total, 2);
  const defenderModel = await injectJson("GET", `/sessions/${code}/read-models/participant/${dealer.participant.id}`);
  assert.equal(defenderModel.pendingResolutions[0].payload.commitmentDeadline.durationSeconds, 120);
  assert.equal(defenderModel.availableActions.some((action: JsonObject) => action.id === "defend-coup"), true);

  const resolvedCoup = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "defend-coup",
    participantId: dealer.participant.id,
    payload: {
      resources: { ammo: 1 }
    }
  });
  assert.equal(resolvedCoup.actionResult.effect.type, "autoResolvedContest");
  assert.equal(resolvedCoup.actionResult.effect.outcome, "attacker-wins");
  assert.equal(resolvedCoup.dashboard.statuses.copperPrice, 500);
  assert.equal(resolvedCoup.dashboard.statuses.firstCouncilDue, true);

  await advancePhase(code);
  await advancePhase(code);
  const council = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "record-minister-council",
    participantId: director.participant.id,
    payload: {
      attendeeIds: [director.participant.id, general.participant.id],
      embezzlement: { money: 5000 },
      decisions: "Le conseil clot la crise apres le coup."
    }
  });
  assert.equal(council.actionResult.effect.type, "autoResolvedLiveAdministration");
  assert.equal(council.dashboard.statuses.firstCouncilDue, false);
  assert.equal(council.dashboard.participants.find((candidate: JsonObject) => candidate.id === director.participant.id).resources.money, 5000);
  assert.equal(council.dashboard.messages.at(-1).target, "allParticipants");
  assert.equal(council.dashboard.pendingResolutions.length, 0);
});

test("lets the facilitator resolve a pending resolution", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  await assignGameAuthority(code);
  const device = await createDevice(code, "Telephone general");
  const otherDevice = await createDevice(code, "Telephone marchand");
  const participant = await createParticipant(code, "General", "general");
  const other = await createParticipant(code, "Marchand", "dealer");
  await bindDevice(code, device.device.id, participant.participant.id);
  await bindDevice(code, otherDevice.device.id, other.participant.id);
  await advancePhase(code);
  await advancePhase(code);

  const coup = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "attempt-coup",
    sourceDeviceId: device.device.id,
    payload: { defenderId: "pending-defender", leaderIds: ["leader-a", "leader-b"], resources: { weapons: 1, ammo: 1 } }
  });
  assert.equal(coup.dashboard.pendingResolutions.length, 1);
  const resolutionId = coup.dashboard.pendingResolutions[0].id;

  const resolved = await injectJson("POST", `/sessions/${code}/resolutions/${resolutionId}/resolve`, {
    outcome: "attacker-wins",
    note: "MJ resolved at table",
    payload: {
      effects: [
        { type: "adjustResource", resource: "influence", delta: 1 }
      ]
    }
  });

  assert.equal(resolved.accepted, true);
  assert.equal(resolved.resolveResult.resolutionId, resolutionId);
  assert.equal(resolved.resolveResult.outcome, "attacker-wins");
  assert.deepEqual(
    resolved.resolveResult.effects.map((effect: JsonObject) => effect.type),
    ["setState", "scaleSessionCounter", "setSessionState", "adjustResource"]
  );
  assert.equal(resolved.resolveResult.message.channel, "resolution");
  assert.equal(resolved.resolveResult.message.target, "participant");
  assert.equal(resolved.resolveResult.message.participantId, participant.participant.id);
  assert.match(resolved.resolveResult.message.text, /Attaquant gagne/);
  const resolvedParticipant = resolved.dashboard.participants.find((candidate: JsonObject) => candidate.id === participant.participant.id);
  assert.equal(resolvedParticipant.resources.influence, 3);
  assert.equal(resolvedParticipant.statuses.coupOutcome, "attacker-wins");
  assert.equal(resolved.dashboard.statuses.copperPrice, 500);
  assert.equal(resolved.dashboard.statuses.firstCouncilDue, true);
  assert.equal(resolved.dashboard.pendingResolutions.length, 0);
  assert.equal(resolved.dashboard.messages.at(-1).channel, "resolution");
  assert.equal(resolved.dashboard.audit.at(-1).type, "resolution.resolved");

  const deviceModel = await injectJson("GET", `/sessions/${code}/read-models/device/${device.device.id}`);
  const otherModel = await injectJson("GET", `/sessions/${code}/read-models/device/${otherDevice.device.id}`);
  assert.deepEqual(deviceModel.pendingResolutions, []);
  assert.equal(deviceModel.participant.resources.influence, 3);
  assert.equal(deviceModel.participant.statuses.coupOutcome, "attacker-wins");
  assert.equal(deviceModel.tableStatuses.copperPrice, 500);
  assert.equal(deviceModel.tableStatuses.firstCouncilDue, true);
  assert.equal(deviceModel.messages.at(-1).channel, "resolution");
  assert.equal(otherModel.messages.some((message: JsonObject) => message.channel === "resolution"), false);
});

test("requires injection authority before resolving Putsch table state", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const device = await createDevice(code, "Telephone general");
  const participant = await createParticipant(code, "General", "general");
  await bindDevice(code, device.device.id, participant.participant.id);
  await advancePhase(code);
  await advancePhase(code);

  const coup = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "attempt-coup",
    sourceDeviceId: device.device.id,
    payload: { defenderId: "pending-defender", leaderIds: ["leader-a", "leader-b"], resources: { weapons: 1, ammo: 1 } }
  });
  const resolutionId = coup.dashboard.pendingResolutions[0].id;

  const rejected = await app.inject({
    method: "POST",
    url: `/sessions/${code}/resolutions/${resolutionId}/resolve`,
    payload: { outcome: "attacker-wins" }
  });

  assert.equal(rejected.statusCode, 403);
  assert.match(rejected.json<JsonObject>().error, /Injection authority/);
  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.equal(dashboard.pendingResolutions.length, 1);
});

test("rejects invalid resolution effects without closing the resolution", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  await assignGameAuthority(code);
  const device = await createDevice(code, "Telephone general");
  const participant = await createParticipant(code, "General", "general");
  await bindDevice(code, device.device.id, participant.participant.id);
  await advancePhase(code);
  await advancePhase(code);

  const coup = await injectJson("POST", `/sessions/${code}/events`, {
    type: "action.requested",
    actionId: "attempt-coup",
    sourceDeviceId: device.device.id,
    payload: { defenderId: "pending-defender", leaderIds: ["leader-a", "leader-b"], resources: { weapons: 1, ammo: 1 } }
  });
  const resolutionId = coup.dashboard.pendingResolutions[0].id;

  const rejected = await app.inject({
    method: "POST",
    url: `/sessions/${code}/resolutions/${resolutionId}/resolve`,
    payload: {
      outcome: "attacker-wins",
      payload: {
        effects: [{ type: "adjustResource", resource: "relic", delta: 1 }]
      }
    }
  });

  assert.equal(rejected.statusCode >= 400, true);
  assert.match(rejected.json<JsonObject>().error, /Unknown resource/);
  const dashboard = await injectJson("GET", `/sessions/${code}/read-models/dashboard`);
  assert.equal(dashboard.pendingResolutions.length, 1);
  assert.equal(dashboard.pendingResolutions[0].id, resolutionId);
  assert.equal(dashboard.messages.some((message: JsonObject) => message.channel === "resolution"), false);
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

test("records pending zone resolutions and filters them for bound devices", async () => {
  const session = await createSession();
  const code = session.code;
  const sonarDevice = await createDevice(code, "Telephone sonar");
  const engineerDevice = await createDevice(code, "Telephone machines");
  const sonar = await createParticipant(code, "Station sonar", "sonar");
  const engineer = await createParticipant(code, "Station machines", "engineer");
  await bindDevice(code, sonarDevice.device.id, sonar.participant.id);
  await bindDevice(code, engineerDevice.device.id, engineer.participant.id);

  const zoneResponse = await enterZone(code, "depth-charge-field", sonar.participant.id, sonarDevice.device.id);

  const pendingEffect = zoneResponse.zoneResult.effects.find((effect: JsonObject) => effect.type === "periodicDamageCheck");
  assert.equal(pendingEffect.pending, true);
  assert.equal(pendingEffect.resource, "hull");
  assert.equal(zoneResponse.dashboard.pendingResolutions.length, 1);
  assert.equal(zoneResponse.dashboard.pendingResolutions[0].id, pendingEffect.resolutionId);
  assert.equal(zoneResponse.dashboard.pendingResolutions[0].type, "periodicDamageCheck");
  assert.equal(zoneResponse.dashboard.pendingResolutions[0].participantId, sonar.participant.id);
  assert.equal(zoneResponse.dashboard.pendingResolutions[0].zoneId, "depth-charge-field");

  const sonarModel = await injectJson("GET", `/sessions/${code}/read-models/device/${sonarDevice.device.id}`);
  const engineerModel = await injectJson("GET", `/sessions/${code}/read-models/device/${engineerDevice.device.id}`);
  assert.equal(sonarModel.pendingResolutions.length, 1);
  assert.equal(sonarModel.pendingResolutions[0].resourceId, "hull");
  assert.deepEqual(engineerModel.pendingResolutions, []);
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

test("resolves module gestures declared for any actor", async () => {
  const session = await createSession("putsch-lite");
  const code = session.code;
  const device = await createDevice(code, "Telephone marchand");
  const participant = await createParticipant(code, "Marchand", "dealer");
  await bindDevice(code, device.device.id, participant.participant.id);

  const actionResponse = await app.inject({
    method: "POST",
    url: `/sessions/${code}/events`,
    payload: {
      type: "gesture.detected",
      gesture: "touch-phones",
      sourceDeviceId: device.device.id
    }
  });

  assert.equal(actionResponse.statusCode, 202);
  const body = actionResponse.json<JsonObject>();
  assert.equal(body.actionResult.actionId, "trade-copper-shares");
  assert.equal(body.actionResult.effect.type, "unsupported");
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
