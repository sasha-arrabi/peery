/**
 * A simple WebRTC peer connection wrapper for data and media channels.
 * 
 * This class simplifies the process of creating and managing a WebRTC peer connection,
 * including handling signaling, data channels, and media streams.
 * It supports both polite and impolite peers, allowing for flexible connection setups.
 * @see https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
 * @example
 * ```javascript
 * // Create a polite WebRTC connection
 * const politeConnection = WebRTC.createPoliteConnection();
 * ```
 * @example
 * ```javascript
 * // Create an impolite WebRTC connection
 * const impoliteConnection = WebRTC.createImpoliteConnection();
 * ```
 * @example
 * ```javascript
 * // Add a data channel and send a message
 * politeConnection.addDataChannel('chat');
 * politeConnection.send('chat', { message: 'Hello, World!' });
 * ```
 * @example
 * ```javascript
 * // Handle incoming messages on a data channel
 * politeConnection.onMessage('chat', (message) => {
 *   console.log('Received message:', message);
 * });
 * ```
 * @example
 * ```javascript
 * // Add a media stream to the connection
 * politeConnection.addStream(localStream);
 * ```
 * @example
 * ```javascript
 * // Handle incoming media streams
 * politeConnection.onStreamAdded((track, streams) => {
 *   track.onunmute = () => {
 *     // don't set srcObject again if it is already set.
 *     if (videoElement.srcObject) return;
 *     videoElement.srcObject = streams[0];
 *   };
 * });
 * ```
 * @example
 * ```javascript
 * // Listen for connection state changes
 * politeConnection.onConnectionEvent('connectionstatechange', (event) => {
 *   console.log('Connection state changed:', event);
 * });
 * ```
 * @example
 * ```javascript
 * // Close the WebRTC connection
 * politeConnection.stop();
 * ```
 */
export class WebRTC {
  /** @type { RTCConfiguration } */
  #configuration;
  /** @type { RTCPeerConnection } */
  #pc;
  /** @type { boolean } */
  #polite = true;
  /** @type { { signaling: { ready: Promise<void>; channel: RTCDataChannel }, [key: string]: { ready: Promise<void>; channel: RTCDataChannel }} } */
  #dataChannels = {};
  #makingOffer = false;
  #ignoreOffer = false;
  #isSettingRemoteAnswerPending = false;
  #SIGNALING_CHANNEL = 'signaling';

  /**
   * Creates a polite WebRTC peer connection instance.
   * @returns {WebRTC} A polite WebRTC peer connection instance.
   */
  static createPoliteConnection() {
    return new WebRTC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }, true);
  }

  /**
   * Creates an impolite WebRTC peer connection instance.
   * @returns {WebRTC} An impolite WebRTC peer connection instance.
   */
  static createImpoliteConnection() {
    return new WebRTC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }, false);
  }

  /**
   * @param {RTCPeerConnection} configuration - The `RTCPeerConnection` object used to initialize a WebRTC peer connection.
   * @param {boolean} polite - Indicates whether the peer is polite (true) or impolite (false).
   */
  constructor(configuration, polite) {
    this.#init(configuration, polite);
  }

  #init = async (configuration, polite) => {
    // Create a new RTCPeerConnection
    this.#configuration = configuration;
    this.#polite = polite;
    this.#pc = new RTCPeerConnection(this.#configuration);

    // Add signaling channel before any other data or media channels are added
    this.addDataChannel(this.#SIGNALING_CHANNEL);

    // Setup event handlers for perfect negotiation: https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
    this.#pc.addEventListener('icecandidate', ({ candidate }) => this.send(this.#SIGNALING_CHANNEL, { candidate }));
    this.#pc.addEventListener('negotiationneeded', this.#onNegotiationNeeded);
    this.#pc.addEventListener('connectionstatechange', () => console.log('Connection state change:', this.#pc.connectionState));
    this.onMessage(this.#SIGNALING_CHANNEL, this.#onSignalingMessage);
  }

  get #closed() {
    return this.connectionState === 'closed';
  }

  #onNegotiationNeeded = async () => {
    console.log('Time to negotiate!');
    if (this.connectionState === 'connected') {
      console.log('Negotiation post connection')
      try {
        this.#makingOffer = true;
        await this.#pc.setLocalDescription();
        this.send(this.#SIGNALING_CHANNEL, { description: this.#pc.localDescription });
      } catch (err) {
        console.error(err);
      } finally {
        this.#makingOffer = false;
      }
    }
  };

  /**
   * Handles incoming signaling messages.
   * @param {{ data: { description: RTCSessionDescriptionInit | null; candidate: RTCIceCandidateInit | null } }} param0
   * @returns {Promise<void>}
   */
  #onSignalingMessage = async ({ data: { description, candidate } }) => {
    try {
      if (description) {
        // An offer may come in while we are busy processing SRD(answer).
        // In this case, we will be in "stable" by the time the offer is processed
        // so it is safe to chain it on our Operations Chain now.
        const readyForOffer =
          !this.#makingOffer &&
          (this.#pc.signalingState == "stable" || this.#isSettingRemoteAnswerPending);
        const offerCollision = description.type == "offer" && !readyForOffer;

        this.#ignoreOffer = !this.#polite && offerCollision;
        if (this.#ignoreOffer) {
          return;
        }
        this.#isSettingRemoteAnswerPending = description.type == "answer";
        await this.#pc.setRemoteDescription(description); // SRD rolls back as needed
        this.#isSettingRemoteAnswerPending = false;
        if (description.type == "offer") {
          await this.#pc.setLocalDescription();
          this.send(this.#SIGNALING_CHANNEL, { description: this.#pc.localDescription });
        }
      } else if (candidate) {
        try {
          await this.#pc.addIceCandidate(candidate);
        } catch (err) {
          if (!this.#ignoreOffer) throw err; // Suppress ignored offer's candidates
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Get the current connection state.
   * @type { RTCPeerConnectionState }
   */
  get connectionState() {
    return this.#pc.connectionState;
  }

  /** Close the WebRTC connection. */
  stop() {
    this.#pc.close();
  }

  /**
   * Creates an offer for the WebRTC connection.
   * @param {RTCOfferOptions} [options] - Optional configuration options for creating the offer.
   * @returns {Promise<RTCSessionDescriptionInit>} a Promise that resolves to the created RTCSessionDescriptionInit object representing the offer.
   */
  async createOffer(options) {
    console.log('Offer::Connection state: ', this.connectionState);
    if (this.#closed) this.#init();
    const offer = await this.#pc.createOffer(options);
    await this.#pc.setLocalDescription(offer);
    console.log('Offer::Connection state: ', this.connectionState);
    return offer;
  }

  /**
   * Creates an answer for the WebRTC connection offer.
   * @param {string} sdp - The SDP string for the remote session description.
   * @returns {Promise<RTCSessionDescriptionInit>} a Promise that resolves to the created RTCSessionDescriptionInit object representing the answer.
   */
  async createAnswer(sdp) {
    console.log('Answer::Connection state: ', this.connectionState);
    if (this.#closed) this.#init();
    const remoteSessionDescription = new RTCSessionDescription({ type: 'offer', sdp });
    await this.#pc.setRemoteDescription(remoteSessionDescription);
    const answer = await this.#pc.createAnswer();
    await this.#pc.setLocalDescription(answer);
    console.log('Answer::Connection state: ', this.connectionState);
    return answer;
  }

  /**
   * @param {RTCSessionDescription} description
   */
  async completeConnection(description) {
    console.log('Complete::Connection state: ', this.connectionState);
    if (this.#closed) this.#init();
    await this.#pc.setRemoteDescription(description);
    console.log('Complete::Connection state: ', this.connectionState);
  }

  /**
   * Sends data over the WebRTC connection.
   * 
   * If the specified data channel does not exist, it is created. The method waits until the data channel is ready before sending the data.
   * @param {string} label - The label of the data channel to use for sending the data.
   * @param {any} data - The data to send.
   */
  async send(label, data) {
    if (this.#closed) this.#init();
    if (!this.#dataChannels[label]) {
      this.addDataChannel(label);
    }

    // Wait until the data channel is ready
    await this.#dataChannels[label].ready;

    // Send the data
    this.#dataChannels[label].channel.send(JSON.stringify(data));
  }

  /**
   * Adds a media stream to the WebRTC connection.
   * @param {MediaStream} stream - The media stream to add.
   */
  addStream(stream) {
    if (this.#closed) this.#init();
    for (const track of stream.getTracks()) {
      this.#pc.addTrack(track, stream);
    }
  }

  /**
   * Adds a data channel to the WebRTC connection.
   * @param {string} label - The label for the data channel.
   * @param {RTCDataChannelInit} [options] - Optional configuration options for the data channel.
   * @throws {Error} If a data channel with the specified label already exists.
   */
  addDataChannel(label, options) {
    if (this.#closed) this.#init();
    if (this.#dataChannels[label]) {
      throw new Error(`Data channel with label "${label}" already exists.`);
    }

    /** @type { { ready: Promise<void>; channel: RTCDataChannel } } */
    const dataChannelObj = {};

    if (!this.#polite) {
      dataChannelObj.channel = this.#pc.createDataChannel(label, options);
    }

    dataChannelObj.ready = new Promise(async (readyResolver) => {
      if (this.#polite) {
        // Wait for the data channel to be created by the remote peer
        dataChannelObj.channel = await (new Promise(dataChannelResolver => this.#pc.addEventListener('datachannel', event => {
          if (event.channel.label === label) {
            dataChannelResolver(event.channel);
          }
        })));
      }

      // Wait for the data channel to open
      dataChannelObj.channel.addEventListener('open', readyResolver);
    });

    this.#dataChannels[label] = dataChannelObj;
  }

  /**
   * Registers a callback function to handle incoming messages on the WebRTC data channel connection.
   * 
   * If the specified data channel does not exist, it is created.
   * @param {string} label - The label of the data channel to listen for messages on.
   * @param {(message: any) => void} callback - The callback function to execute when a message is received.
   * @returns {() => Promise<void>} - A function to remove the event listener.
   */
  onMessage(label, callback) {
    if (this.#closed) this.#init();
    if (!this.#dataChannels[label]) {
      this.addDataChannel(label);
    }

    /** @type { (event: MessageEvent) => void } */
    const callbackWrapper = (event) => callback(JSON.parse(event.data));
    this.#dataChannels[label].ready.then(() => this.#dataChannels[label].channel.addEventListener('message', callbackWrapper));

    return async () => {
      await this.#dataChannels[label].ready;
      this.#dataChannels[label].channel.removeEventListener('message', callbackWrapper);
    };
  }

  /**
   * When a remote media stream is added, this callback is invoked with the stream.
   * @param {(track: MediaStreamTrack, streams: ReadonlyArray<MediaStream>) => void} callback
   * @returns {() => void} - A function to remove the event listener.
   */
  onStreamAdded(callback) {
    if (this.#closed) this.#init();
    /** @type { (event: RTCTrackEvent) => void } */
    const callbackWrapper = (event) => callback(event.track, event.streams);
    this.#pc.addEventListener('track', callbackWrapper);
    return () => this.#pc.removeEventListener('track', callbackWrapper);
  }

  /**
   * @type { (event: keyof RTCPeerConnectionEventMap, callback: (ev: RTCPeerConnectionEventMap[typeof event]) => any, options?: boolean | AddEventListenerOptions) => () => void }
   */
  onConnectionEvent(event, callback, options) {
    if (this.#closed) this.#init();
    this.#pc.addEventListener(event, callback, options);
    return () => this.#pc.removeEventListener(event, callback, options);
  }
}
