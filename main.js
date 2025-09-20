import { $, UserMediaStream, WebRTC } from './index.js';

/**
 * WebRTC peer connection instance.
 *  @type {WebRTC}
 */
let connection;
/**
 * Local media stream.
 * @type {UserMediaStream}
 */
let mediaStream;

// Unsubscribe functions for event listeners
let onStreamAddedUnsubscribe;
let onConnectionEventUnsubscribe;

// Event handlers

/**
 * Handling for paste and enter inputs to accept answer sdp.
 * @type { (e: ClipboardEvent | KeyboardEvent) => void }
 */
const onTextAreaDataEntered = async (e) => {
  let encodedSdp = null;
  let sdp = null;

  // Extract encoded sdp from event
  if (e.type === 'paste') {
    const clipboardEvent = /** @type { ClipboardEvent } */ (e);
    encodedSdp = clipboardEvent.clipboardData.getData('text/plain');
  } else if (e.type === 'keypress' && e.key === 'Enter') {
    e.preventDefault();
    encodedSdp = $('answer').value;
  }

  // Decode sdp
  try {
    sdp = atob(encodedSdp);
  } catch (error) {
    handleError(error, 'Error base-64 decoding SDP.');
  }

  try {
    const remoteSessionDescription = new RTCSessionDescription({ type:'answer', sdp });
    await connection.completeConnection(remoteSessionDescription);
  } catch (error) {
    handleError(error, 'Error while setting remote description from answer.');
  }

  // Remove event listeners to prevent multiple submissions
  $('answer').removeEventListener('paste', onTextAreaDataEntered);
  $('answer').removeEventListener('keypress', onTextAreaDataEntered);
}

const onConnectionStateChanged = async () => {
  if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed') {
    // Handle disconnection
    history.replaceState({}, document.title, window.location.pathname);
    endCall();
  } else if (connection.connectionState === 'connected') {
    // Handle successful connection
    $('loading').style.display = 'none';
    $('start-call').style.display = 'none';
    $('join-call').style.display = 'none';
    $('in-call').style.display = 'initial';

    // Acquire local media stream
    /** @type { MediaStream } */
    let localStream;
    try {
      localStream = await mediaStream.getStream();
      // Display local stream
      $('local-stream').srcObject = localStream;
    } catch (error) {
      handleError(error, 'Could not access media devices. Please check your audio / video permissions and try again.');
    }

    // Add local track to WebRTC connection
    connection.addStream(localStream);
  }
};

const onStreamAdded = (track, streams) => {
  track.addEventListener('unmute', () => {
    // Don't set srcObject again if it is already set.
    if ($('remote-stream').srcObject) return;
    $('remote-stream').srcObject = streams[0];
  }, { once: true });
};

/** Copy SDP to clipboard. */
async function copySdpToClipboard(e, encodedSdp, el, link = false) {
  try {
    if (link) {
      const url = new URL(window.location.href);
      url.searchParams.set('join', encodedSdp);
      await navigator.clipboard.writeText(url.href);
    } else {
      await navigator.clipboard.writeText(encodedSdp);
    }
    el.style.display = 'initial';
  } catch(error) {
    console.warn('Error copying SDP to clipboard: ', error);
  }
}

/** End the current call and close media streams and WebRTC connections. */
function endCall() {
  if (connection) {
    connection.close();
    connection = null;
    mediaStream.stopStream();
    mediaStream = null;
    history.replaceState({}, document.title, window.location.pathname);
    $('join-call').style.display = 'none';
    $('in-call').style.display = 'none';
    $('start-call').style.display = 'none';
    $('link-copied-message').style.display = 'none';
    $('answer-code-copied-message').style.display = 'none';
    $('local-stream').srcObject = null;
    $('remote-stream').srcObject = null;
    $('loading').style.display = 'initial';
    $('answer').value = '';
    if (onStreamAddedUnsubscribe) onStreamAddedUnsubscribe();
    if (onConnectionEventUnsubscribe) onConnectionEventUnsubscribe();
    init();
  }
}

/**
 * Handle errors by displaying an error message and hiding other UI elements.
 * @type { (error: Error, message?: string) => void }
 */
function handleError(error, message) {
  $('loading').style.display = 'none';
  $('start-call').style.display = 'none';
  $('join-call').style.display = 'none';
  $('error-message').style.display = 'initial';
  $('error-text').textContent = message ?? error.message;
  console.error(error);
  throw error;
}

// Initialization function
async function init() {
  const url = new URL(window.location.href);
  const join = url.searchParams.get('join');
  mediaStream = UserMediaStream.createAudioAndVideoStream();

  // Initiate peer connection setup
  if (join) {
    connection = WebRTC.createPoliteConnection();
  } else {
    connection = WebRTC.createImpoliteConnection();
  }

  // Create offer / answer
  /** @type { string } */
  let encodedSdp;

  if (join) {
    // Accept offer and create answer
    try {
      const answer = await connection.createAnswer(atob(join));
      encodedSdp = btoa(answer.sdp);
    } catch (error) {
      handleError(error, 'Failed to create an answer for a WebRTC connection from the offer.');
    }
  } else {
    // Create initial offer
    try {
      const offer = await connection.createOffer();
      encodedSdp = btoa(offer.sdp);
    } catch (error) {
      handleError(error, 'Failed to create an offer for a WebRTC connection.');
    }
  }

  // Setup event handlers

  // Handle connection state changes
  onConnectionEventUnsubscribe = connection.onConnectionEvent('connectionstatechange', onConnectionStateChanged);
  
  // When a remote track is received, display it in the remote video element
  onStreamAddedUnsubscribe = connection.onStreamAdded(onStreamAdded);
  
  // Handle answer sdp input
  $('answer').addEventListener('paste', onTextAreaDataEntered);
  $('answer').addEventListener('keypress', onTextAreaDataEntered);
  
  // Handle copy link button
  $('copy-link-button').addEventListener('click', (e) => copySdpToClipboard(e, encodedSdp, $('link-copied-message'), true));
  
  // Handle copy answer button
  $('copy-answer-code-button').addEventListener('click', (e) => copySdpToClipboard(e, encodedSdp, $('answer-code-copied-message'), false));
  
  // Handle end call button
  $('end-call-button').addEventListener('click', endCall);

  // Show appropriate section once WebRTC setup is done
  $('loading').style.display = 'none';
  if (join) {
    $('join-call').style.display = 'initial';
  } else {
    $('start-call').style.display = 'initial';
  }
}

init();
