/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import './parcel-require';
import Peer from 'peerjs';
import {Chunk, RemoteControlPayload, Transporter, TransporterEventHandler, TransporterEvents,} from '@syncit/core';
import {eventWithTime} from '@rrweb/types';

export type PeerjsTransporterOptions = {
  uid: string;
  role: 'embed' | 'app';
  peerHost: string;
  peerPort: number;
  peerPath: string;
  secure?: boolean;
  debug?: boolean;
  key?: string;
};

const sleep = (ms: number) =>
  new Promise(resolve =>
    setTimeout(() => {
      resolve(undefined);
    }, ms)
  );

export class PeerjsTransporter implements Transporter {
  handlers: Record<TransporterEvents, Array<TransporterEventHandler>> = {
    [TransporterEvents.SourceReady]: [],
    [TransporterEvents.MirrorReady]: [],
    [TransporterEvents.Start]: [],
    [TransporterEvents.SendRecord]: [],
    [TransporterEvents.AckRecord]: [],
    [TransporterEvents.Stop]: [],
    [TransporterEvents.RemoteControl]: [],
    [TransporterEvents.OperatorMouseMove]: [],
  };

  uid: string;
  role: PeerjsTransporterOptions['role'];
  peer: Peer;
  conn?: Peer.DataConnection;
  opened = false;

  constructor(options: PeerjsTransporterOptions) {
    const {uid, role, peerHost, peerPort, peerPath} = options;
    this.uid = uid;
    this.role = role;
    this.peer = new Peer(`${this.uid}-${this.role}`, {
      host: peerHost,
      port: peerPort,
      path: peerPath,
      secure: options.secure,
      key: options.key
    });
    this.peer.on('connection', conn => {
      this.conn = conn;
      conn.on('open', () => {
        this.opened = true;
        console.info('connection opened', Date.now());
      });
      conn.on('data', data => {
        const {event, payload} = data;
        this.handlers[event as TransporterEvents].map(h =>
          h({
            event: event,
            payload: payload,
          })
        );
      });
      conn.on('close', () => {
        console.info('connection closed');
        delete this.conn;
      });
      conn.on('error', e => {
        console.error(e);
      });
    });
  }

  get embedUid() {
    return `${this.uid}-embed`;
  }

  get appUid() {
    return `${this.uid}-app`;
  }

  connect() {
    return new Promise(resolve => {
      const targetId = `${this.uid}-${this.role === 'app' ? 'embed' : 'app'}`;
      const conn = this.peer.connect(targetId, {
        serialization: 'json',
      });
      conn.on('open', () => {
        console.info('connection opened', Date.now());
        this.conn = conn;
        resolve(undefined);
      });
      conn.on('data', data => {
        const {event, payload} = data;
        this.handlers[event as TransporterEvents].map(h =>
          h({
            event: event,
            payload: payload,
          })
        );
      });
      conn.on('close', () => {
        console.info('connection closed');
        delete this.conn;
      });
      conn.on('error', e => {
        console.error(e);
      });
    });
  }

  async send<T>(data: T) {
    if (!this.conn) {
      await this.connect();
    }
    while (this.role === 'embed' && !this.opened) {
      // a spin lock to wait connection open
      await sleep(50);
    }
    this.conn?.send(data);
  }

  login(): Promise<boolean> {
    return Promise.resolve(true);
  }

  sendSourceReady() {
    return this.send({
      event: TransporterEvents.SourceReady,
    });
  }

  sendMirrorReady() {
    return this.send({
      event: TransporterEvents.MirrorReady,
    });
  }

  sendStart() {
    return this.send({
      event: TransporterEvents.Start,
    });
  }

  sendRecord(record: Chunk<eventWithTime>) {
    return this.send({
      event: TransporterEvents.SendRecord,
      payload: record,
    });
  }

  ackRecord(id: number) {
    return this.send({
      event: TransporterEvents.AckRecord,
      payload: id,
    });
  }

  sendStop() {
    return this.send({
      event: TransporterEvents.Stop,
    });
  }

  sendRemoteControl(payload: RemoteControlPayload) {
    return this.send({
      event: TransporterEvents.RemoteControl,
      payload,
    });
  }

  on(event: TransporterEvents, handler: TransporterEventHandler) {
    this.handlers[event].push(handler);
  }
}
