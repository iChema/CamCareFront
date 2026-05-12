import mqtt, { type MqttClient } from "mqtt";
import type { TuyaWebrtcSession } from "./types";

type StatusCallback = (status: string) => void;

type TuyaSignal = {
  protocol: number;
  pv: string;
  t: number;
  data: {
    header: {
      from: string;
      to: string;
      sub_dev_id: string;
      sessionid: string;
      moto_id: string;
      seq?: number;
      rtx?: number;
      type: "offer" | "answer" | "candidate";
    };
    msg: Record<string, unknown>;
  };
};

export type TuyaWebrtcHandle = {
  stop: () => void;
};

export async function startTuyaWebrtc(
  session: TuyaWebrtcSession,
  video: HTMLVideoElement,
  onStatus: StatusCallback,
): Promise<TuyaWebrtcHandle> {
  const mqttSession = session.mqtt.result;
  const config = session.config.result;
  const msid = mqttSession.msid;
  const mqttId = `web_${msid}`;
  const deviceId = config.id;
  const motoId = config.motoId || config.p2pConfig.motoId;
  const sessionId = session.clientTraceId || crypto.randomUUID().replace(/-/g, "");
  const subscribeTopic = `3/av/u/${msid}`;
  const publishTopic = `0/av/moto/${motoId}/u/${deviceId}`;

  const pc = new RTCPeerConnection({ iceServers: config.p2pConfig.ices });
  let client: MqttClient | null = null;
  let stopped = false;

  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "recvonly" });

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) {
      video.srcObject = stream;
      void video.play().catch((err) => onStatus(`play blocked: ${err.message}`));
      onStatus("WebRTC stream recibido");
    }
  };

  pc.onconnectionstatechange = () => onStatus(`WebRTC ${pc.connectionState}`);
  pc.oniceconnectionstatechange = () => onStatus(`ICE ${pc.iceConnectionState}`);
  pc.onicecandidate = (event) => {
    if (!client?.connected) return;
    if (event.candidate?.candidate.includes(".local")) return;
    publishSignal(client, publishTopic, buildSignal("candidate", msid, deviceId, motoId, sessionId, {
      candidate: event.candidate ? `a=${event.candidate.candidate}` : "",
      mode: "webrtc",
    }));
  };

  client = mqtt.connect("wss://m1.tuyaus.com/mqtt", {
    protocolVersion: 4,
    clientId: mqttId,
    username: mqttId,
    password: mqttSession.password,
    clean: true,
    keepalive: 60,
    reconnectPeriod: 0,
    connectTimeout: 15_000,
  });

  client.on("connect", async () => {
    if (!client || stopped) return;
    onStatus("MQTT conectado");
    client.subscribe(subscribeTopic, { qos: 1 }, async (err, granted) => {
      if (!client || stopped) {
        onStatus("MQTT subscribe cancelado");
        return;
      }
      if (err && (!granted || granted.length === 0)) {
        onStatus(`MQTT subscribe error: ${err?.message ?? "stopped"}`);
        return;
      }

      onStatus(err ? "MQTT suscrito con warning; enviando offer" : "MQTT suscrito; enviando offer");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      publishSignal(client, publishTopic, buildSignal("offer", msid, deviceId, motoId, sessionId, {
        sdp: offer.sdp,
        auth: config.auth,
        mode: "webrtc",
        datachannel_enable: false,
        token: config.p2pConfig.ices,
        stream_type: 1,
        replay: { is_replay: 0 },
      }));
    });
  });

  client.on("message", async (_topic, payload) => {
    try {
      const signal = JSON.parse(payload.toString()) as TuyaSignal;
      const type = signal.data?.header?.type;
      const msg = signal.data?.msg ?? {};

      if (type === "answer" && typeof msg.sdp === "string" && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        onStatus("SDP answer aplicado");
      }

      if (type === "candidate" && typeof msg.candidate === "string" && msg.candidate) {
        await pc.addIceCandidate({
          candidate: msg.candidate.replace(/^a=/, ""),
          sdpMid: "0",
          sdpMLineIndex: 0,
        });
      }
    } catch (err) {
      onStatus(`signal parse error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  });

  client.on("error", (err) => onStatus(`MQTT error: ${err.message}`));
  client.on("close", () => {
    if (!stopped) onStatus("MQTT cerrado");
  });

  return {
    stop: () => {
      stopped = true;
      client?.end(true);
      pc.close();
      video.pause();
      video.srcObject = null;
    },
  };
}

function buildSignal(
  type: "offer" | "candidate",
  from: string,
  to: string,
  motoId: string,
  sessionId: string,
  msg: Record<string, unknown>,
): TuyaSignal {
  return {
    protocol: 302,
    pv: "2.2",
    t: Date.now(),
    data: {
      header: {
        from,
        to,
        sub_dev_id: "",
        sessionid: sessionId,
        moto_id: motoId,
        seq: 0,
        rtx: 0,
        type,
      },
      msg,
    },
  };
}

function publishSignal(client: MqttClient, topic: string, signal: TuyaSignal) {
  client.publish(topic, JSON.stringify(signal), { qos: 1 });
}
