import assert from "node:assert/strict";
import { test } from "node:test";
import { Room } from "colyseus";

class LudoviveVisibilityRoom extends Room {
  constructor() {
    super();
    this.audit = [];
    this.participants = [
      { id: "captain", name: "Capitaine", resources: { intel: 1 }, secret: "ordre scelle" },
      { id: "sonar", name: "Station sonar", resources: { intel: 1 }, secret: "contact nord-est" }
    ];
  }

  connectClient(client, audience) {
    client.audience = audience;
    this.clients.push(client);
    client.send("room.connected", this.readModelFor(audience));
  }

  acceptEvent(event) {
    const entry = {
      sequence: this.audit.length + 1,
      type: event.type,
      participantId: event.participantId,
      payload: event.payload ?? {}
    };
    this.audit.push(entry);
    for (const client of this.clients) {
      client.send("event.accepted", {
        audit: entry,
        readModel: this.readModelFor(client.audience)
      });
    }
  }

  reconnectClient(client, audience, afterSequence = 0) {
    client.audience = audience;
    this.clients.push(client);
    client.send("room.reconnected", {
      readModel: this.readModelFor(audience),
      missedAudit: this.audit.filter((entry) => entry.sequence > afterSequence),
      latestSequence: this.audit.length
    });
  }

  readModelFor(audience) {
    if (audience.kind === "dashboard") {
      return {
        readModel: "dashboard",
        participants: this.participants,
        audit: this.audit
      };
    }

    const participant = this.participants.find((candidate) => candidate.id === audience.participantId);
    if (!participant) {
      return {
        readModel: "device.unbound",
        participants: this.participants.map(({ id, name }) => ({ id, name }))
      };
    }

    return {
      readModel: "device.participant",
      participant,
      visibleParticipants: this.participants.map(({ id, name }) => ({ id, name })),
      recentAudit: this.audit
    };
  }
}

function fakeClient(id) {
  return {
    sessionId: id,
    messages: [],
    send(type, payload) {
      this.messages.push({ type, payload });
    }
  };
}

test("a Colyseus room can send filtered per-client read models without shared schema state", () => {
  const room = new LudoviveVisibilityRoom();
  const dashboard = fakeClient("dashboard");
  const sonar = fakeClient("sonar-device");
  const unbound = fakeClient("unbound-device");

  room.connectClient(dashboard, { kind: "dashboard" });
  room.connectClient(sonar, { kind: "device", participantId: "sonar" });
  room.connectClient(unbound, { kind: "device" });
  room.acceptEvent({ type: "sonar.ping", participantId: "sonar", payload: { bearing: 47 } });

  const dashboardUpdate = dashboard.messages.at(-1).payload.readModel;
  const sonarUpdate = sonar.messages.at(-1).payload.readModel;
  const unboundUpdate = unbound.messages.at(-1).payload.readModel;

  assert.equal(dashboardUpdate.readModel, "dashboard");
  assert.equal(sonarUpdate.readModel, "device.participant");
  assert.equal(unboundUpdate.readModel, "device.unbound");
  assert.equal(dashboardUpdate.participants[1].secret, "contact nord-est");
  assert.equal(sonarUpdate.participant.secret, "contact nord-est");
  assert.equal(unboundUpdate.participants[1].secret, undefined);
  assert.equal(dashboard.messages.at(-1).payload.audit.sequence, 1);
});

test("a Colyseus room still needs Ludovive audit catch-up after reconnect", () => {
  const room = new LudoviveVisibilityRoom();
  const firstConnection = fakeClient("sonar-device-1");
  room.connectClient(firstConnection, { kind: "device", participantId: "sonar" });
  room.acceptEvent({ type: "sonar.ping", participantId: "sonar", payload: { bearing: 47 } });
  room.clients = room.clients.filter((client) => client !== firstConnection);

  room.acceptEvent({ type: "contact.updated", participantId: "sonar", payload: { bearing: 52 } });
  room.acceptEvent({ type: "depth.changed", participantId: "sonar", payload: { depth: "periscope" } });

  const reconnected = fakeClient("sonar-device-2");
  room.reconnectClient(reconnected, { kind: "device", participantId: "sonar" }, 1);

  const reconnectPayload = reconnected.messages.at(-1).payload;
  assert.equal(reconnected.messages.at(-1).type, "room.reconnected");
  assert.equal(reconnectPayload.readModel.readModel, "device.participant");
  assert.equal(reconnectPayload.latestSequence, 3);
  assert.deepEqual(
    reconnectPayload.missedAudit.map((entry) => entry.sequence),
    [2, 3]
  );
  assert.equal(reconnectPayload.readModel.participant.secret, "contact nord-est");
});
