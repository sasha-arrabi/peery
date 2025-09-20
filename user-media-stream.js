/**
 * UserMediaStream class to manage user media streams (audio and/or video).
 * This class provides methods to create, retrieve, and stop media streams
 * with specified constraints.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 * @example
 * ```javascript
 * // Create an audio-only stream
 * const audioStream = UserMediaStream.createAudioOnlyStream();
 * ```
 * @example
 * ```javascript
 * // Create a video-only stream
 * const videoStream = UserMediaStream.createVideoOnlyStream();
 * ```
 * @example
 * ```javascript
 * // Create an audio and video stream
 * const avStream = UserMediaStream.createAudioAndVideoStream();
 * ```
 * @example
 * ```javascript
 * // Retrieve the media stream
 * const stream = await avStream.getStream();
 * ```
 * @example
 * ```javascript
 * // Stop the media stream
 * await avStream.stopStream();
 * ```
 */
export class UserMediaStream {
  #constraints = {
    audio: {
      noiseSuppression: true,
      echoCancellation: true,
    },
    video: false,
  };
  #stream;

  constructor(constraints) {
    this.#constraints = constraints;
  }

  static createAudioOnlyStream() {
    return new UserMediaStream({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
      },
      video: false,
    });
  }

  static createVideoOnlyStream() {
    return new UserMediaStream({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  }

  static createAudioAndVideoStream() {
    return new UserMediaStream({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
      },
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  }

  /**
   * Retrieves a media stream based on the specified constraints.
   * 
   * If the stream has not been opened yet, it is lazily opened using `navigator.mediaDevices.getUserMedia`
   * with the provided constraints. If the stream is already open, the existing stream is returned.
   * 
   * @returns {Promise<MediaStream>} - A Promise that resolves to the media stream.
   */
  getStream() {
    if (!this.#stream) {
      this.#stream = navigator.mediaDevices.getUserMedia(this.#constraints);
    }

    return this.#stream;
  }

  /**
   * Stops the media stream.
   * @returns {Promise<void> | undefined} - A Promise that resolves when the stream is stopped, or undefined if there is no active stream.
   */
  stopStream() {
    if (this.#stream) {
      return this.#stream.then(stream => stream.getTracks().forEach(track => track.stop()));
    }
  }
}
